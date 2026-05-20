"""add campaign_id to meta_publicos_insights

Revision ID: 015
Revises: 014
Create Date: 2026-05-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_publicos_insights
        ADD COLUMN IF NOT EXISTS campaign_id VARCHAR NOT NULL DEFAULT 'ALL'
    """))

    op.execute(sa.text("""
        DO $$
        DECLARE cname TEXT;
        BEGIN
          SELECT constraint_name INTO cname
          FROM information_schema.table_constraints
          WHERE table_name = 'meta_publicos_insights'
            AND constraint_type = 'UNIQUE'
          LIMIT 1;
          IF cname IS NOT NULL THEN
            EXECUTE 'ALTER TABLE meta_publicos_insights DROP CONSTRAINT ' || quote_ident(cname);
          END IF;
        END $$
    """))

    op.execute(sa.text("""
        ALTER TABLE meta_publicos_insights
        ADD CONSTRAINT meta_publicos_insights_unique
        UNIQUE (ads_account_id, data, breakdown_type, breakdown_value, campaign_id)
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_publicos_insights
        DROP CONSTRAINT IF EXISTS meta_publicos_insights_unique
    """))
    op.execute(sa.text("""
        ALTER TABLE meta_publicos_insights
        DROP COLUMN IF EXISTS campaign_id
    """))
    op.execute(sa.text("""
        ALTER TABLE meta_publicos_insights
        ADD CONSTRAINT meta_publicos_insights_ads_account_id_data_breakdown_type_br_key
        UNIQUE (ads_account_id, data, breakdown_type, breakdown_value)
    """))
