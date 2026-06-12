"""Pagamento de tokens via Stripe Checkout (hospedado) — fase 3b.

Fluxo: o cliente clica "Pagar com cartão/PIX" → `POST /estudio/checkout` cria uma
Stripe Checkout Session e devolve a URL; o cliente paga na página da Stripe e volta.
O crédito do saldo acontece por DUAS vias idempotentes (não credita o mesmo
session_id 2x): (1) `POST /estudio/checkout/confirmar` chamado no retorno; (2)
`POST /estudio/stripe/webhook` (verifica a assinatura) quando o webhook está
configurado. Chaves só no `.env`. O agente não processa cartão — o cliente paga
na página segura da Stripe.
"""
import logging
import uuid

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_usuario_atual, verificar_acesso_workspace
from app.models.estudio import EstudioTokenTransacao
from app.models.user import User
from app.services import estudio_wallet

router = APIRouter(prefix="/estudio", tags=["estudio-stripe"])
log = logging.getLogger(__name__)


def _ensure_stripe() -> None:
    if not settings.stripe_secret_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Pagamento online não configurado.")
    stripe.api_key = settings.stripe_secret_key


def _ja_creditado(db: Session, session_id: str) -> bool:
    return (
        db.query(EstudioTokenTransacao)
        .filter(
            EstudioTokenTransacao.referencia == session_id,
            EstudioTokenTransacao.tipo == "credito",
        )
        .first()
        is not None
    )


def _creditar_sessao(db: Session, session: dict, por: uuid.UUID | None = None) -> None:
    """Credita o saldo a partir de uma sessão Stripe paga (idempotente)."""
    if session.get("payment_status") != "paid":
        return
    sid = session.get("id")
    md = session.get("metadata") or {}
    ws = md.get("workspace_id")
    tokens = int(md.get("tokens") or 0)
    if not (sid and ws and tokens > 0):
        return
    if _ja_creditado(db, sid):
        return
    try:
        estudio_wallet.creditar(db, uuid.UUID(ws), tokens, "Recarga via Stripe", referencia=sid, origem="comprado", por=por)
    except IntegrityError:
        # Corrida (confirm-on-return + webhook na mesma sessão): o índice único
        # barrou o 2º crédito. Já está creditado — ignora.
        db.rollback()
        log.info("[stripe] crédito idempotente: sessão %s já creditada", sid)


class CheckoutIn(BaseModel):
    workspace_id: uuid.UUID
    tokens: int = Field(gt=0, le=100000)


@router.post("/checkout")
def criar_checkout(
    payload: CheckoutIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Cria a Checkout Session (R$1/token) e devolve a URL de pagamento."""
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    _ensure_stripe()
    base = settings.frontend_url.rstrip("/")
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[{
                "price_data": {
                    "currency": "brl",
                    "product_data": {"name": f"{payload.tokens} tokens — Estúdio AI"},
                    "unit_amount": 100,  # R$1,00 por token
                },
                "quantity": payload.tokens,
            }],
            metadata={"workspace_id": str(payload.workspace_id), "tokens": str(payload.tokens)},
            success_url=f"{base}/marketing/estudio-ai/carregar-tokens?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{base}/marketing/estudio-ai/carregar-tokens?cancelado=1",
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("[stripe] checkout falhou: %s", str(exc)[:200])
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Falha ao iniciar o pagamento.")
    return {"url": session.url}


class ConfirmarIn(BaseModel):
    workspace_id: uuid.UUID
    session_id: str


@router.post("/checkout/confirmar")
def confirmar_checkout(
    payload: ConfirmarIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Chamado no retorno do Checkout: se pago, credita (idempotente)."""
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    _ensure_stripe()
    try:
        session = stripe.checkout.Session.retrieve(payload.session_id)
    except Exception:  # noqa: BLE001
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sessão de pagamento não encontrada.")
    if str((session.get("metadata") or {}).get("workspace_id")) != str(payload.workspace_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sessão de outro workspace.")
    pago = session.get("payment_status") == "paid"
    if pago:
        _creditar_sessao(db, session, por=usuario.id)
    return {"pago": pago, "saldo_tokens": estudio_wallet.saldo(db, payload.workspace_id)}


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Webhook da Stripe: credita em checkout.session.completed (assinatura verificada)."""
    if not settings.stripe_webhook_secret:
        # Ainda não configurado; o confirm-on-return cobre o crédito.
        return {"received": True, "note": "webhook secret não configurado"}
    raw = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(raw, sig, settings.stripe_webhook_secret)
    except Exception:  # noqa: BLE001  (assinatura inválida ou payload malformado)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Assinatura inválida")
    etype = event.get("type")
    # Crédito em checkout.session.completed (cartão: já pago) OU
    # async_payment_succeeded (PIX/boleto: pagamento assíncrono confirma depois).
    # _creditar_sessao só credita se payment_status=='paid' (no PIX, o completed
    # chega 'unpaid' → no-op) e é idempotente por session_id.
    if etype in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        _creditar_sessao(db, event["data"]["object"])
    elif etype == "checkout.session.async_payment_failed":
        log.info("[stripe] PIX/async falhou: sessão %s", (event["data"]["object"] or {}).get("id"))
    return {"received": True}
