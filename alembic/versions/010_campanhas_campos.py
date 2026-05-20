"""meta_campanhas_insights.status + meta_anuncios_insights.(adset_name, status, objetivo)

Revision ID: 010
Revises: 009
Create Date: 2026-05-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_campanhas_insights
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
    """))
    op.execute(sa.text("""
        ALTER TABLE meta_anuncios_insights
        ADD COLUMN IF NOT EXISTS adset_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS status     VARCHAR(20) DEFAULT 'ACTIVE',
        ADD COLUMN IF NOT EXISTS objetivo   VARCHAR(50);
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_campanhas_insights
        DROP COLUMN IF EXISTS status;
    """))
    op.execute(sa.text("""
        ALTER TABLE meta_anuncios_insights
        DROP COLUMN IF EXISTS adset_name,
        DROP COLUMN IF EXISTS status,
        DROP COLUMN IF EXISTS objetivo;
    """))
