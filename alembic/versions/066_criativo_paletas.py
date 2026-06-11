"""Esquemas de cores salvos por workspace (Estúdio de Criativos)

Tabela `criativo_paletas`: o usuário salva a regra 60/30/10 atual (3 cores) e
recarrega depois. Máx. 10 por workspace (enforce no endpoint). Multi-tenant
(workspace_id NOT NULL).

Revision ID: 066
Revises: 065
Create Date: 2026-06-11
"""
from alembic import op
import sqlalchemy as sa

revision = "066"
down_revision = "065"
branch_labels = None
depends_on = None

_TS = (
    "criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(), "
    "atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()"
)


def upgrade() -> None:
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS criativo_paletas (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            cor_60        VARCHAR(20),
            cor_30        VARCHAR(20),
            cor_10        VARCHAR(20),
            ativo         BOOLEAN NOT NULL DEFAULT true,
            {_TS}
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_criativo_paletas_ws "
        "ON criativo_paletas (workspace_id, ativo)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS criativo_paletas CASCADE"))
