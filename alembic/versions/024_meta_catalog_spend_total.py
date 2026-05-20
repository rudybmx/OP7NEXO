"""meta catalog: spend_total em campaigns/adsets

Revision ID: 024_meta_catalog_spend_total
Revises: 023_meta_cards_video_metrics
Create Date: 2026-05-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "024_meta_catalog_spend_total"
down_revision: Union[str, None] = "023_meta_cards_video_metrics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_campaigns_catalog
        ADD COLUMN IF NOT EXISTS spend_total NUMERIC(12,2);
    """))
    op.execute(sa.text("""
        ALTER TABLE meta_adsets_catalog
        ADD COLUMN IF NOT EXISTS spend_total NUMERIC(12,2);
    """))
    op.execute(sa.text("""
        UPDATE meta_campaigns_catalog c
        SET spend_total = s.spend_total
        FROM (
            SELECT ads_account_id, campaign_id, COALESCE(SUM(spend),0) AS spend_total
            FROM meta_campanhas_insights
            GROUP BY ads_account_id, campaign_id
        ) s
        WHERE c.ads_account_id = s.ads_account_id
          AND c.campaign_id = s.campaign_id;
    """))
    op.execute(sa.text("""
        UPDATE meta_adsets_catalog a
        SET spend_total = s.spend_total
        FROM (
            SELECT ads_account_id, adset_id, COALESCE(SUM(spend),0) AS spend_total
            FROM meta_anuncios_insights
            WHERE adset_id IS NOT NULL
            GROUP BY ads_account_id, adset_id
        ) s
        WHERE a.ads_account_id = s.ads_account_id
          AND a.adset_id = s.adset_id;
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_adsets_catalog
        DROP COLUMN IF EXISTS spend_total;
    """))
    op.execute(sa.text("""
        ALTER TABLE meta_campaigns_catalog
        DROP COLUMN IF EXISTS spend_total;
    """))
