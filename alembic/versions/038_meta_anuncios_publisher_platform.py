"""meta_anuncios_insights — publisher_platform por anúncio

Revision ID: 038_meta_anuncios_pubplatform
Revises: 037_meta_anuncios_resultados
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "038_meta_anuncios_pubplatform"
down_revision = "037_meta_anuncios_resultados"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE public.meta_anuncios_insights
            ADD COLUMN IF NOT EXISTS publisher_platform VARCHAR(30)
    """))

    op.execute(sa.text("""
        UPDATE public.meta_anuncios_insights
        SET publisher_platform = 'unknown'
        WHERE publisher_platform IS NULL
    """))

    op.execute(sa.text("""
        ALTER TABLE public.meta_anuncios_insights
            ALTER COLUMN publisher_platform SET DEFAULT 'unknown'
    """))

    op.execute(sa.text("""
        ALTER TABLE public.meta_anuncios_insights
            ALTER COLUMN publisher_platform SET NOT NULL
    """))

    op.execute(sa.text("""
        ALTER TABLE public.meta_anuncios_insights
            DROP CONSTRAINT IF EXISTS meta_anuncios_insights_ads_account_id_ad_id_data_key
    """))

    op.execute(sa.text("""
        ALTER TABLE public.meta_anuncios_insights
            ADD CONSTRAINT meta_anuncios_insights_ads_account_id_ad_id_data_publisher_platform_key
            UNIQUE (ads_account_id, ad_id, data, publisher_platform)
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE public.meta_anuncios_insights
            DROP CONSTRAINT IF EXISTS meta_anuncios_insights_ads_account_id_ad_id_data_publisher_platform_key
    """))

    op.execute(sa.text("""
        ALTER TABLE public.meta_anuncios_insights
            DROP COLUMN IF EXISTS publisher_platform
    """))

    op.execute(sa.text("""
        ALTER TABLE public.meta_anuncios_insights
            ADD CONSTRAINT meta_anuncios_insights_ads_account_id_ad_id_data_key
            UNIQUE (ads_account_id, ad_id, data)
    """))
