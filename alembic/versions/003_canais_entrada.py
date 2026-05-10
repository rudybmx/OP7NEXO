"""canais de entrada omnichannel

Revision ID: 003
Revises: 002
Create Date: 2026-05-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE canais_entrada (
            id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            tipo                 VARCHAR(30) NOT NULL,
            nome                 VARCHAR(100) NOT NULL,
            config               JSONB DEFAULT '{}',
            mensagem_boas_vindas TEXT,
            webhook_token        VARCHAR(64) UNIQUE,
            status               VARCHAR(20) NOT NULL DEFAULT 'inativo',
            criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX ix_canais_workspace ON canais_entrada(workspace_id)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_canais_workspace"))
    op.execute(sa.text("DROP TABLE IF EXISTS canais_entrada"))
