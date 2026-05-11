"""meta_insights_diarios: leads breakdown por canal (whatsapp/instagram/messenger/formulario)

Revision ID: 011
Revises: 010
Create Date: 2026-05-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_insights_diarios
        ADD COLUMN IF NOT EXISTS leads_whatsapp  INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS leads_instagram INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS leads_messenger INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS leads_formulario INTEGER DEFAULT 0;
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_insights_diarios
        DROP COLUMN IF EXISTS leads_whatsapp,
        DROP COLUMN IF EXISTS leads_instagram,
        DROP COLUMN IF EXISTS leads_messenger,
        DROP COLUMN IF EXISTS leads_formulario;
    """))
