"""transferência p/ responsável: agentes.codigo_responsavel

`codigo_responsavel` (FK users; quando definido, o agente passa a rotear a conversa para
esse humano no handoff — Fase 4). null = sem responsável (comportamento atual: só marca
ai_escalado). ON DELETE SET NULL espelha crm_conversation_assignments.actor_user_id.
Boot-safe (ADD COLUMN IF NOT EXISTS).

Revision ID: 099
Revises: 098
Create Date: 2026-06-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "099"
down_revision: Union[str, None] = "098"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE agentes ADD COLUMN IF NOT EXISTS codigo_responsavel UUID "
        "REFERENCES public.users(id) ON DELETE SET NULL"
    ))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE agentes DROP COLUMN IF EXISTS codigo_responsavel"))
