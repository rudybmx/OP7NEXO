"""ads_accounts — balance/amount_spent/spend_cap columns

Revision ID: 008
Revises: 007
Create Date: 2026-05-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE ads_accounts
        ADD COLUMN IF NOT EXISTS balance      NUMERIC(14,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS amount_spent NUMERIC(14,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS spend_cap    NUMERIC(14,2) DEFAULT 0;
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE ads_accounts
        DROP COLUMN IF EXISTS balance,
        DROP COLUMN IF EXISTS amount_spent,
        DROP COLUMN IF EXISTS spend_cap;
    """))
