"""Carteira de tokens do Estúdio AI — saldo, transações e recarga (manual/admin).

1 token = R$1; consumo por criativo: medium=1, alta=2, Modelo Reverso=3 (débito
em /design/gerar). Fase 1: recarga é criada PENDENTE pelo cliente e CONFIRMADA
por um platform_admin (após o pagamento). Lógica de saldo no serviço
`app.services.estudio_wallet`.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import (
    exigir_platform_admin,
    get_usuario_atual,
    verificar_acesso_workspace,
)
from app.models.estudio import EstudioTokenTransacao
from app.models.user import User
from app.services import estudio_wallet

router = APIRouter(prefix="/estudio", tags=["estudio-tokens"])

PIX_INSTRUCAO = (
    "Para concluir a recarga, faça o PIX no valor indicado e envie o comprovante "
    "ao seu gerente. O saldo é creditado após a confirmação do pagamento."
)


def _tx_out(t: EstudioTokenTransacao) -> dict:
    return {
        "id": str(t.id),
        "workspace_id": str(t.workspace_id),
        "tipo": t.tipo,
        "tokens": t.tokens,
        "valor_reais": float(t.valor_reais) if t.valor_reais is not None else None,
        "motivo": t.motivo,
        "status": t.status,
        "criado_em": t.criado_em.isoformat() if t.criado_em else None,
    }


@router.get("/saldo")
def obter_saldo(
    workspace_id: uuid.UUID = Query(...),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    verificar_acesso_workspace(usuario, workspace_id, db)
    return {"workspace_id": str(workspace_id), "saldo_tokens": estudio_wallet.saldo(db, workspace_id)}


@router.get("/transacoes")
def listar_transacoes(
    workspace_id: uuid.UUID = Query(...),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    verificar_acesso_workspace(usuario, workspace_id, db)
    rows = (
        db.query(EstudioTokenTransacao)
        .filter(EstudioTokenTransacao.workspace_id == workspace_id)
        .order_by(EstudioTokenTransacao.criado_em.desc())
        .limit(100)
        .all()
    )
    return [_tx_out(t) for t in rows]


class RecargaIn(BaseModel):
    workspace_id: uuid.UUID
    tokens: int = Field(gt=0, le=100000)


@router.post("/recarga", status_code=status.HTTP_201_CREATED)
def criar_recarga(
    payload: RecargaIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Cliente solicita uma recarga (fica PENDENTE até o admin confirmar)."""
    verificar_acesso_workspace(usuario, payload.workspace_id, db)
    t = estudio_wallet.registrar(
        db, payload.workspace_id, "credito", payload.tokens, "Recarga de saldo",
        status="pendente", valor=payload.tokens * estudio_wallet.TOKEN_VALOR_REAIS, por=usuario.id,
    )
    db.commit()
    db.refresh(t)
    return {"transacao": _tx_out(t), "instrucao_pagamento": PIX_INSTRUCAO}


@router.post("/recarga/{transacao_id}/confirmar")
def confirmar_recarga(
    transacao_id: uuid.UUID,
    usuario: User = Depends(exigir_platform_admin),
    db: Session = Depends(get_db),
):
    """platform_admin confirma a recarga (após pagamento) e credita o saldo."""
    t = (
        db.query(EstudioTokenTransacao)
        .filter(EstudioTokenTransacao.id == transacao_id)
        .first()
    )
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transação não encontrada")
    if t.tipo != "credito" or t.status != "pendente":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Transação não é uma recarga pendente")
    estudio_wallet.confirmar(db, t)
    return {"transacao": _tx_out(t), "saldo_tokens": estudio_wallet.saldo(db, t.workspace_id)}


class CreditarIn(BaseModel):
    workspace_id: uuid.UUID
    tokens: int = Field(gt=0, le=100000)
    motivo: Optional[str] = None


@router.post("/creditar")
def creditar_admin(
    payload: CreditarIn,
    usuario: User = Depends(exigir_platform_admin),
    db: Session = Depends(get_db),
):
    """Crédito manual direto (admin) — sem passar por recarga pendente."""
    t = estudio_wallet.creditar(
        db, payload.workspace_id, payload.tokens,
        payload.motivo or "Crédito manual (admin)", por=usuario.id,
    )
    return {"transacao": _tx_out(t), "saldo_tokens": estudio_wallet.saldo(db, payload.workspace_id)}
