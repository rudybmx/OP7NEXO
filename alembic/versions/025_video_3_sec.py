"""add video_3_sec to meta_video_metrics_daily

Revision ID: 025_video_3_sec
Revises: 024_meta_catalog_spend_total
Create Date: 2026-05-14
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "025_video_3_sec"
down_revision: Union[str, None] = "024_meta_catalog_spend_total"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_video_metrics_daily
        ADD COLUMN IF NOT EXISTS video_3_sec INTEGER NOT NULL DEFAULT 0;
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_video_metrics_daily
        DROP COLUMN IF EXISTS video_3_sec;
    """))
