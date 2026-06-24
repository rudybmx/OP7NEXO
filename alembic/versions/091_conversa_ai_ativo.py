"""ai_ativo em crm_whatsapp_conversas — chave do agente por conversa (default desligado)

Revision ID: 091
Revises: 090
Create Date: 2026-06-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "091"
down_revision: Union[str, None] = "090"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Chave por conversa: o agente só responde quando ligado. DEFAULT false = inicia DESLIGADO
    # em TODAS as conversas (opt-in explícito por conversa — trava de segurança). ADD COLUMN com
    # default constante é metadata-only no PG (rápido mesmo com ~2,6k linhas). Idempotente.
    op.execute(sa.text(
        "ALTER TABLE crm_whatsapp_conversas ADD COLUMN IF NOT EXISTS ai_ativo BOOLEAN NOT NULL DEFAULT false"
    ))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas DROP COLUMN IF EXISTS ai_ativo"))
