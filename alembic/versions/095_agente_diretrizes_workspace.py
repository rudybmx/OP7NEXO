"""agente_diretrizes_workspace — diretrizes de IA por workspace

Texto único por workspace, injetado no system prompt de TODOS os agentes daquele
workspace (ver app/services/agent_service.py::_diretrizes_workspace). Boot-safe:
a API roda `alembic upgrade head` no startup (lifespan).

Revision ID: 095
Revises: 094
Create Date: 2026-06-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "095"
down_revision: Union[str, None] = "094"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS agente_diretrizes_workspace (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id   UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
            diretrizes     TEXT NOT NULL DEFAULT '',
            atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS agente_diretrizes_workspace"))
