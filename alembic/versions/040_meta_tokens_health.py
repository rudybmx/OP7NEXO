"""meta_tokens health columns

Revision ID: 040
Revises: 03b_ads_meta_account_name
Create Date: 2026-05-27
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "040"
down_revision: Union[str, None] = "03b_ads_meta_account_name"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_tokens
            ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS last_check_status VARCHAR(32),
            ADD COLUMN IF NOT EXISTS last_check_http_status INTEGER,
            ADD COLUMN IF NOT EXISTS last_check_error TEXT
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_tokens
            DROP COLUMN IF EXISTS last_check_error,
            DROP COLUMN IF EXISTS last_check_http_status,
            DROP COLUMN IF EXISTS last_check_status,
            DROP COLUMN IF EXISTS last_checked_at
    """))
