"""ads_accounts - nome original da conta Meta

Revision ID: 03b_ads_meta_account_name
Revises: 039_ads_acc_access_pause
Create Date: 2026-05-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "03b_ads_meta_account_name"
down_revision: Union[str, None] = "039_ads_acc_access_pause"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ads_accounts",
        sa.Column("meta_account_name", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ads_accounts", "meta_account_name")
