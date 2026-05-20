"""sync_jobs table for async Meta Ads sync tracking

Revision ID: 018
Revises: 017
Create Date: 2026-05-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS sync_jobs (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ads_account_id  VARCHAR NOT NULL,
            status          VARCHAR NOT NULL DEFAULT 'pending',
            etapa_atual     VARCHAR,
            progresso       INTEGER NOT NULL DEFAULT 0,
            totais          JSONB,
            erro            TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_sync_jobs_ads_account_id ON sync_jobs (ads_account_id)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_sync_jobs_status ON sync_jobs (status)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS sync_jobs"))
