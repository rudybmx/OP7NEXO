"""add creative cards table and daily video metrics

Revision ID: 023_meta_cards_video_metrics
Revises: 022_meta_creatives_hq_metadata
Create Date: 2026-05-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "023_meta_cards_video_metrics"
down_revision: Union[str, None] = "022_meta_creatives_hq_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS meta_creative_cards_catalog (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id    UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            creative_id       VARCHAR(50) NOT NULL,
            ad_id             VARCHAR(50),
            campaign_id       VARCHAR(50),
            adset_id          VARCHAR(50),
            card_index        INTEGER NOT NULL,
            image_hash        VARCHAR(120),
            video_id          VARCHAR(50),
            image_url_hq      TEXT,
            source_type       VARCHAR(40),
            link              TEXT,
            name              TEXT,
            description       TEXT,
            raw_payload       JSONB,
            last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (ads_account_id, creative_id, card_index)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_meta_creative_cards_workspace "
        "ON meta_creative_cards_catalog(workspace_id, creative_id)"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS meta_video_metrics_daily (
            id                                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ads_account_id                     UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            ad_id                              VARCHAR(50) NOT NULL,
            video_id                           VARCHAR(50) NOT NULL,
            data                               DATE NOT NULL,
            video_views                        INTEGER NOT NULL DEFAULT 0,
            video_play_actions                 INTEGER NOT NULL DEFAULT 0,
            video_avg_pct_watched_actions      INTEGER NOT NULL DEFAULT 0,
            video_complete_watched_actions     INTEGER NOT NULL DEFAULT 0,
            video_p25                          INTEGER NOT NULL DEFAULT 0,
            video_p50                          INTEGER NOT NULL DEFAULT 0,
            video_p75                          INTEGER NOT NULL DEFAULT 0,
            video_p95                          INTEGER NOT NULL DEFAULT 0,
            video_p100                         INTEGER NOT NULL DEFAULT 0,
            thruplay                           INTEGER NOT NULL DEFAULT 0,
            cost_per_thruplay                  NUMERIC(14,6),
            atualizado_em                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            criado_em                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (ads_account_id, video_id, ad_id, data)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_meta_video_metrics_daily_acc_date "
        "ON meta_video_metrics_daily(ads_account_id, data)"
    ))

    op.execute(sa.text(
        "ALTER TABLE meta_videos_catalog "
        "ADD COLUMN IF NOT EXISTS source_url TEXT"
    ))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE meta_videos_catalog DROP COLUMN IF EXISTS source_url"))
    op.execute(sa.text("DROP TABLE IF EXISTS meta_video_metrics_daily"))
    op.execute(sa.text("DROP TABLE IF EXISTS meta_creative_cards_catalog"))
