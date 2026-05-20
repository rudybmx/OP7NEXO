"""meta catalog tables (campaigns/adsets/ads/creatives/videos)

Revision ID: 020
Revises: 019
Create Date: 2026-05-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS meta_campaigns_catalog (
            id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id        UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            campaign_id           VARCHAR(50) NOT NULL,
            nome                  VARCHAR(255),
            objetivo              VARCHAR(80),
            effective_status      VARCHAR(40),
            configured_status     VARCHAR(40),
            start_time            TIMESTAMPTZ,
            stop_time             TIMESTAMPTZ,
            daily_budget          NUMERIC(12,2),
            lifetime_budget       NUMERIC(12,2),
            raw_payload           JSONB,
            last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (ads_account_id, campaign_id)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_meta_campaigns_catalog_workspace "
        "ON meta_campaigns_catalog(workspace_id, effective_status)"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS meta_adsets_catalog (
            id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id        UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            adset_id              VARCHAR(50) NOT NULL,
            campaign_id           VARCHAR(50),
            nome                  VARCHAR(255),
            effective_status      VARCHAR(40),
            configured_status     VARCHAR(40),
            start_time            TIMESTAMPTZ,
            end_time              TIMESTAMPTZ,
            daily_budget          NUMERIC(12,2),
            lifetime_budget       NUMERIC(12,2),
            bid_strategy          VARCHAR(80),
            raw_payload           JSONB,
            last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (ads_account_id, adset_id)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_meta_adsets_catalog_workspace "
        "ON meta_adsets_catalog(workspace_id, effective_status)"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS meta_ads_catalog (
            id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id        UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            ad_id                 VARCHAR(50) NOT NULL,
            campaign_id           VARCHAR(50),
            adset_id              VARCHAR(50),
            creative_id           VARCHAR(50),
            nome                  VARCHAR(255),
            effective_status      VARCHAR(40),
            configured_status     VARCHAR(40),
            raw_payload           JSONB,
            last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (ads_account_id, ad_id)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_meta_ads_catalog_workspace "
        "ON meta_ads_catalog(workspace_id, effective_status)"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS meta_creatives_catalog (
            id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id              UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id            UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            creative_id               VARCHAR(50) NOT NULL,
            ad_id                     VARCHAR(50),
            campaign_id               VARCHAR(50),
            adset_id                  VARCHAR(50),
            nome                      VARCHAR(255),
            object_type               VARCHAR(60),
            tipo_criativo             VARCHAR(30),
            effective_object_story_id VARCHAR(100),
            video_id                  VARCHAR(50),
            thumbnail_url             TEXT,
            image_url_hq              TEXT,
            link_anuncio              TEXT,
            carousel_items            JSONB,
            raw_payload               JSONB,
            last_seen_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            criado_em                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (ads_account_id, creative_id)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_meta_creatives_catalog_workspace "
        "ON meta_creatives_catalog(workspace_id, tipo_criativo)"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS meta_videos_catalog (
            id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id        UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            video_id              VARCHAR(50) NOT NULL,
            creative_id           VARCHAR(50),
            ad_id                 VARCHAR(50),
            campaign_id           VARCHAR(50),
            adset_id              VARCHAR(50),
            thumbnail_url         TEXT,
            image_url_hq          TEXT,
            raw_payload           JSONB,
            last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (ads_account_id, video_id)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_meta_videos_catalog_workspace "
        "ON meta_videos_catalog(workspace_id)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS meta_videos_catalog"))
    op.execute(sa.text("DROP TABLE IF EXISTS meta_creatives_catalog"))
    op.execute(sa.text("DROP TABLE IF EXISTS meta_ads_catalog"))
    op.execute(sa.text("DROP TABLE IF EXISTS meta_adsets_catalog"))
    op.execute(sa.text("DROP TABLE IF EXISTS meta_campaigns_catalog"))
