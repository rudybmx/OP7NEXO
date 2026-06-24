"""Tokens públicos de conexão de canal (`canal_connect_tokens`).

Token CSPRNG de 256 bits que o admin envia ao cliente para conectar o canal sem
login. Separado do `webhook_token`. Regras:
- 1 token `active` por canal (índice parcial único) → get-or-create atômico;
- validade 24h ao criar; ao conectar, vira `consumed` com validade 1h (anti-hijack
  de link antigo);
- token `consumed` dentro da janela ainda responde (mostra "já conectado"); expirado → 404.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.canal_connect_token import CanalConnectToken

TTL_ATIVO = timedelta(hours=24)
TTL_CONSUMIDO = timedelta(hours=1)


def gerar_ou_reusar_token(db: Session, canal_id, workspace_id) -> CanalConnectToken:
    """Reusa o token `active` válido do canal ou cria um novo (atômico)."""
    agora = datetime.now(timezone.utc)

    existente = (
        db.query(CanalConnectToken)
        .filter(
            CanalConnectToken.canal_id == canal_id,
            CanalConnectToken.status == "active",
            CanalConnectToken.expires_at > agora,
        )
        .first()
    )
    if existente:
        return existente

    # Expira tokens ativos vencidos (libera o índice parcial antes de inserir).
    db.query(CanalConnectToken).filter(
        CanalConnectToken.canal_id == canal_id,
        CanalConnectToken.status == "active",
        CanalConnectToken.expires_at <= agora,
    ).update(
        {"status": "consumed", "consumed_at": agora}, synchronize_session=False
    )
    db.flush()

    novo = CanalConnectToken(
        token=secrets.token_urlsafe(32),
        canal_id=canal_id,
        workspace_id=workspace_id,
        status="active",
        expires_at=agora + TTL_ATIVO,
    )
    db.add(novo)
    try:
        db.commit()
    except IntegrityError:
        # Corrida (double-click): outro request criou o token ativo — relê o vigente.
        db.rollback()
        return (
            db.query(CanalConnectToken)
            .filter(
                CanalConnectToken.canal_id == canal_id,
                CanalConnectToken.status == "active",
            )
            .first()
        )
    db.refresh(novo)
    return novo


def buscar_token_valido(db: Session, token: str) -> CanalConnectToken | None:
    """Token (qualquer status) se existir e NÃO estiver expirado; senão None (→ 404)."""
    row = db.get(CanalConnectToken, token)
    if not row:
        return None
    if row.expires_at <= datetime.now(timezone.utc):
        return None
    return row


def consumir_tokens_do_canal(db: Session, canal_id) -> int:
    """Consome todos os tokens `active` do canal (validade curta). Idempotente.

    Chamado ao detectar conexão real — no poll síncrono e no webhook assíncrono.
    """
    agora = datetime.now(timezone.utc)
    n = (
        db.query(CanalConnectToken)
        .filter(
            CanalConnectToken.canal_id == canal_id,
            CanalConnectToken.status == "active",
        )
        .update(
            {
                "status": "consumed",
                "consumed_at": agora,
                "expires_at": agora + TTL_CONSUMIDO,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    return n
