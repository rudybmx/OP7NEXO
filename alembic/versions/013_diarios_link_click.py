"""meta_insights_diarios: adiciona link_click

Revision ID: 013
Revises: 012
Create Date: 2026-05-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_insights_diarios
        ADD COLUMN IF NOT EXISTS link_click INTEGER DEFAULT 0;
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_insights_diarios
        DROP COLUMN IF EXISTS link_click;
    """))

