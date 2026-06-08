"""Cria tabela matriz_investimento para planejamento de verba por canal/mês

Revision ID: 060
Revises: 059
Create Date: 2026-06-08
"""
from alembic import op
import sqlalchemy as sa

revision = "060"
down_revision = "059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS matriz_investimento (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            year         INTEGER NOT NULL,
            canal        VARCHAR(20) NOT NULL,
            mes          INTEGER NOT NULL,
            aprovado     NUMERIC(14,2) NOT NULL DEFAULT 0,
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by   VARCHAR(255),
            CONSTRAINT uq_matriz_investimento UNIQUE (workspace_id, year, canal, mes)
        );

        CREATE INDEX IF NOT EXISTS ix_matriz_investimento_workspace_year
            ON matriz_investimento (workspace_id, year);
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        DROP TABLE IF EXISTS matriz_investimento;
    """))
