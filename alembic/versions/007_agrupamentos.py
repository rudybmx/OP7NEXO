"""ads_accounts — campo agrupamento

Revision ID: 007
Revises: 006
Create Date: 2026-05-10
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE ads_accounts
        ADD COLUMN IF NOT EXISTS agrupamento VARCHAR(100);
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE ads_accounts
        DROP COLUMN IF EXISTS agrupamento;
    """))
