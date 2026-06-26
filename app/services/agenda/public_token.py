"""Tokens públicos de agendamento por agenda (`agenda_public_tokens`).

Token CSPRNG de 256 bits que a clínica divulga para o paciente marcar sozinho (sem login).
LONGEVO e reusável (não consome por reserva, não expira sozinho) — revogável trocando o
status. Um token 'active' por agenda (índice parcial único) → get-or-create atômico.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.agenda_public_token import AgendaPublicToken


def gerar_ou_reusar_token(db: Session, agenda_id, workspace_id) -> AgendaPublicToken:
    """Reusa o token 'active' da agenda ou cria um novo (atômico)."""
    existente = (
        db.query(AgendaPublicToken)
        .filter(
            AgendaPublicToken.agenda_id == agenda_id,
            AgendaPublicToken.status == "active",
        )
        .first()
    )
    if existente:
        return existente

    novo = AgendaPublicToken(
        token=secrets.token_urlsafe(32),
        agenda_id=agenda_id,
        workspace_id=workspace_id,
        status="active",
    )
    db.add(novo)
    try:
        db.commit()
    except IntegrityError:
        # Corrida (double-click): outro request criou o token ativo — relê o vigente.
        db.rollback()
        return (
            db.query(AgendaPublicToken)
            .filter(
                AgendaPublicToken.agenda_id == agenda_id,
                AgendaPublicToken.status == "active",
            )
            .first()
        )
    db.refresh(novo)
    return novo


def buscar_token_valido(db: Session, token: str) -> AgendaPublicToken | None:
    """Token 'active' correspondente, ou None."""
    return (
        db.query(AgendaPublicToken)
        .filter(AgendaPublicToken.token == token, AgendaPublicToken.status == "active")
        .first()
    )


def revogar_tokens_da_agenda(db: Session, agenda_id) -> int:
    """Marca todos os tokens 'active' da agenda como 'revoked'. Retorna quantos."""
    n = (
        db.query(AgendaPublicToken)
        .filter(
            AgendaPublicToken.agenda_id == agenda_id,
            AgendaPublicToken.status == "active",
        )
        .update(
            {"status": "revoked", "revoked_at": datetime.now(timezone.utc)},
            synchronize_session=False,
        )
    )
    db.commit()
    return n
