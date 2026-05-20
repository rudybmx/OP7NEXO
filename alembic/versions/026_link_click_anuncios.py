"""add link_click to meta_anuncios_insights

Revision ID: 026_link_click_anuncios
Revises: 025_video_3_sec
Create Date: 2026-05-14
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "026_link_click_anuncios"
down_revision: Union[str, None] = "025_video_3_sec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_anuncios_insights
        ADD COLUMN IF NOT EXISTS link_click INTEGER NOT NULL DEFAULT 0;
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_anuncios_insights
        DROP COLUMN IF EXISTS link_click;
    """))
