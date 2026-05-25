"""ads_accounts — access N:N por workspace e sync pausado

Revision ID: 039_ads_acc_access_pause
Revises: 038_meta_anuncios_pubplatform
Create Date: 2026-05-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "039_ads_acc_access_pause"
down_revision: Union[str, None] = "038_meta_anuncios_pubplatform"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE ads_accounts
        ADD COLUMN IF NOT EXISTS sync_paused BOOLEAN NOT NULL DEFAULT false
    """))
    op.execute(sa.text("""
        ALTER TABLE ads_accounts
        ALTER COLUMN sync_paused SET DEFAULT false
    """))
    op.execute(sa.text("""
        ALTER TABLE ads_accounts
        ALTER COLUMN sync_paused SET NOT NULL
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS ads_account_workspace_access (
            ads_account_id UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (ads_account_id, workspace_id)
        )
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS idx_ads_account_workspace_access_account
        ON ads_account_workspace_access(ads_account_id)
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS idx_ads_account_workspace_access_workspace
        ON ads_account_workspace_access(workspace_id)
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS idx_ads_account_workspace_access_workspace"))
    op.execute(sa.text("DROP INDEX IF EXISTS idx_ads_account_workspace_access_account"))
    op.execute(sa.text("DROP TABLE IF EXISTS ads_account_workspace_access"))
    op.execute(sa.text("ALTER TABLE ads_accounts DROP COLUMN IF EXISTS sync_paused"))
