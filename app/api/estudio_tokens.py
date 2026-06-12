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
from app.models.estudio import EstudioTokenSaldo, EstudioTokenTransacao
from app.models.user import User
from app.models.workspace import Workspace
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
        .filter(
            EstudioTokenTransacao.workspace_id == workspace_id,
            EstudioTokenTransacao.status != "cancelado",  # canceladas somem para o cliente
        )
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
        status="pendente", valor=payload.tokens * estudio_wallet.TOKEN_VALOR_REAIS,
        origem="comprado", por=usuario.id,
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
        payload.motivo or "Crédito manual (admin)", origem="concedido", por=usuario.id,
    )
    return {"transacao": _tx_out(t), "saldo_tokens": estudio_wallet.saldo(db, payload.workspace_id)}


@router.post("/recarga/{transacao_id}/cancelar")
def cancelar_recarga(
    transacao_id: uuid.UUID,
    usuario: User = Depends(exigir_platform_admin),
    db: Session = Depends(get_db),
):
    """platform_admin cancela uma recarga pendente (some para o cliente)."""
    t = (
        db.query(EstudioTokenTransacao)
        .filter(EstudioTokenTransacao.id == transacao_id)
        .first()
    )
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transação não encontrada")
    if t.tipo != "credito" or t.status != "pendente":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Transação não é uma recarga pendente")
    t.status = "cancelado"
    db.commit()
    return {"ok": True}


class RemoverIn(BaseModel):
    workspace_id: uuid.UUID
    tokens: int = Field(gt=0, le=1000000)


@router.post("/remover")
def remover_tokens(
    payload: RemoverIn,
    usuario: User = Depends(exigir_platform_admin),
    db: Session = Depends(get_db),
):
    """Remove tokens CONCEDIDOS (não comprados). Cap = removivel (grátis no saldo)."""
    b = estudio_wallet.buckets(db, payload.workspace_id)
    if payload.tokens > b["removivel"]:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Só é possível remover até {b['removivel']} token(s) concedido(s). "
            f"O restante ({b['transferivel']}) foi comprado — use Transferir.",
        )
    estudio_wallet.debitar(
        db, payload.workspace_id, payload.tokens, "Remoção de tokens (admin)",
        origem="remocao", por=usuario.id,
    )
    return {"saldo_tokens": estudio_wallet.saldo(db, payload.workspace_id)}


class TransferirIn(BaseModel):
    origem_workspace_id: uuid.UUID
    destino_workspace_id: uuid.UUID
    tokens: int = Field(gt=0, le=1000000)


@router.post("/transferir")
def transferir_tokens(
    payload: TransferirIn,
    usuario: User = Depends(exigir_platform_admin),
    db: Session = Depends(get_db),
):
    """Transfere tokens COMPRADOS de um workspace para outro. Cap = transferivel."""
    if payload.origem_workspace_id == payload.destino_workspace_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Origem e destino devem ser diferentes")
    destino = db.query(Workspace).filter(Workspace.id == payload.destino_workspace_id).first()
    if not destino:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace de destino não encontrado")
    origem_ws = db.query(Workspace).filter(Workspace.id == payload.origem_workspace_id).first()
    b = estudio_wallet.buckets(db, payload.origem_workspace_id)
    if payload.tokens > b["transferivel"]:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Só é possível transferir até {b['transferivel']} token(s) comprado(s).",
        )
    # Débito na origem + crédito no destino (comprado) — um único commit.
    estudio_wallet.registrar(
        db, payload.origem_workspace_id, "debito", payload.tokens,
        f"Transferência enviada p/ {destino.nome}", origem="transferencia", por=usuario.id,
    )
    estudio_wallet.registrar(
        db, payload.destino_workspace_id, "credito", payload.tokens,
        f"Transferência recebida de {origem_ws.nome if origem_ws else 'workspace'}",
        valor=payload.tokens * estudio_wallet.TOKEN_VALOR_REAIS, origem="comprado", por=usuario.id,
    )
    db.commit()
    return {
        "saldo_origem": estudio_wallet.saldo(db, payload.origem_workspace_id),
        "saldo_destino": estudio_wallet.saldo(db, payload.destino_workspace_id),
    }


# ───────────────────────── Admin: controle global de tokens ─────────────────
@router.get("/admin/saldos")
def admin_saldos(
    usuario: User = Depends(exigir_platform_admin),
    db: Session = Depends(get_db),
):
    """Saldo de todos os workspaces ativos (0 quando nunca recarregou)."""
    rows = (
        db.query(Workspace.id, Workspace.nome, EstudioTokenSaldo.saldo_tokens)
        .outerjoin(EstudioTokenSaldo, EstudioTokenSaldo.workspace_id == Workspace.id)
        .filter(Workspace.ativo.is_(True))
        .all()
    )
    out = []
    for wid, nome, saldo in rows:
        s = saldo or 0
        # buckets só p/ quem tem saldo (os demais são 0/0) — evita queries à toa.
        if s > 0:
            b = estudio_wallet.buckets(db, wid)
            removivel, transferivel, comprado = b["removivel"], b["transferivel"], b["comprado_restante"]
        else:
            removivel = transferivel = comprado = 0
        out.append({
            "workspace_id": str(wid), "nome": nome, "saldo_tokens": s,
            "removivel": removivel, "transferivel": transferivel, "comprado": comprado,
        })
    out.sort(key=lambda x: x["saldo_tokens"], reverse=True)
    return out


@router.get("/admin/recargas-pendentes")
def admin_recargas_pendentes(
    usuario: User = Depends(exigir_platform_admin),
    db: Session = Depends(get_db),
):
    """Recargas pendentes de todos os workspaces (para o admin confirmar)."""
    rows = (
        db.query(EstudioTokenTransacao, Workspace.nome)
        .join(Workspace, Workspace.id == EstudioTokenTransacao.workspace_id)
        .filter(
            EstudioTokenTransacao.status == "pendente",
            EstudioTokenTransacao.tipo == "credito",
        )
        .order_by(EstudioTokenTransacao.criado_em.desc())
        .all()
    )
    return [
        {
            "id": str(t.id),
            "workspace_id": str(t.workspace_id),
            "nome": nome,
            "tokens": t.tokens,
            "valor_reais": float(t.valor_reais) if t.valor_reais is not None else None,
            "criado_em": t.criado_em.isoformat() if t.criado_em else None,
        }
        for t, nome in rows
    ]
