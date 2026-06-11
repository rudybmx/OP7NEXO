"""Carteira de tokens do Estúdio AI — saldo + transações por workspace

Cobrança por token: 1 token = R$1; criativo medium=1, alta=2, Modelo Reverso=3.
Saldo POR workspace (cobra o cliente/franquia). Fase 1: recarga manual/admin
(gateway automático = futuro). Nome distinto de `meta_tokens` (OAuth da Meta).

Revision ID: 067
Revises: 066
Create Date: 2026-06-11
"""
from alembic import op
import sqlalchemy as sa

revision = "067"
down_revision = "066"
branch_labels = None
depends_on = None

_TS = (
    "criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(), "
    "atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()"
)


def upgrade() -> None:
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS estudio_token_saldo (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id  UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
            saldo_tokens  INTEGER NOT NULL DEFAULT 0,
            {_TS}
        )
    """))
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS estudio_token_transacoes (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            tipo          VARCHAR(10) NOT NULL,             -- credito | debito
            tokens        INTEGER NOT NULL,
            valor_reais   NUMERIC(10,2),
            motivo        TEXT,
            status        VARCHAR(12) NOT NULL DEFAULT 'confirmado', -- confirmado | pendente | cancelado
            referencia    TEXT,
            criado_por    UUID,
            {_TS}
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_estudio_tx_ws "
        "ON estudio_token_transacoes (workspace_id, criado_em)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_estudio_tx_status "
        "ON estudio_token_transacoes (status, tipo)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS estudio_token_transacoes CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS estudio_token_saldo CASCADE"))
