"""meta_sync_log — histórico de execuções de sync por conta Meta Ads

Revision ID: 053_meta_sync_log
Revises: 052_resolver_lids_historicos
Create Date: 2026-06-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "053_meta_sync_log"
down_revision: Union[str, None] = "052_resolver_lids_historicos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS meta_sync_log (
            id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ads_account_id       UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            sync_mode            VARCHAR(30) NOT NULL,
            started_at           TIMESTAMPTZ NOT NULL,
            finished_at          TIMESTAMPTZ,
            status               VARCHAR(30) NOT NULL,
            stage_failed         VARCHAR(80),
            error_message        TEXT,
            campaigns_upserted   INTEGER NOT NULL DEFAULT 0,
            adsets_upserted      INTEGER NOT NULL DEFAULT 0,
            ads_upserted         INTEGER NOT NULL DEFAULT 0,
            insights_days        INTEGER NOT NULL DEFAULT 0,
            request_count        INTEGER NOT NULL DEFAULT 0,
            rate_limit_usage_pct INTEGER,
            criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_meta_sync_log_account_started
            ON meta_sync_log (ads_account_id, started_at DESC)
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_meta_sync_log_account_started"))
    op.execute(sa.text("DROP TABLE IF EXISTS meta_sync_log"))
