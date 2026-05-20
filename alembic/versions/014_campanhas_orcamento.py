"""meta_campanhas_insights: adiciona orcamento_diario

Revision ID: 014
Revises: 013
Create Date: 2026-05-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_campanhas_insights
        ADD COLUMN IF NOT EXISTS orcamento_diario NUMERIC(10,2);
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_campanhas_insights
        DROP COLUMN IF EXISTS orcamento_diario;
    """))
