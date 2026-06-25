"""followup automático: agentes.tempo_followup_min + conversas.followup_fechamento

`tempo_followup_min` (min sem resposta do lead → etiqueta 'followup'; null = desligado).
`followup_fechamento` (em_aberto|ganho|perca|...) editável na página de followup.
Boot-safe (ADD COLUMN IF NOT EXISTS).

Revision ID: 098
Revises: 097
Create Date: 2026-06-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "098"
down_revision: Union[str, None] = "097"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE agentes ADD COLUMN IF NOT EXISTS tempo_followup_min INTEGER"))
    op.execute(sa.text(
        "ALTER TABLE crm_whatsapp_conversas ADD COLUMN IF NOT EXISTS "
        "followup_fechamento VARCHAR(20) NOT NULL DEFAULT 'em_aberto'"
    ))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas DROP COLUMN IF EXISTS followup_fechamento"))
    op.execute(sa.text("ALTER TABLE agentes DROP COLUMN IF EXISTS tempo_followup_min"))
