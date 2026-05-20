"""meta_creatives_catalog — adicionar colunas UTM persistidas

Revision ID: 036_meta_creatives_utm
Revises: 035_contatos_enriquecido
Create Date: 2026-05-15
"""
from alembic import op

revision = '036_meta_creatives_utm'
down_revision = '035_contatos_enriquecido'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE public.meta_creatives_catalog
            ADD COLUMN IF NOT EXISTS headline        TEXT,
            ADD COLUMN IF NOT EXISTS destination_url TEXT,
            ADD COLUMN IF NOT EXISTS url_tags        TEXT,
            ADD COLUMN IF NOT EXISTS utm_source      VARCHAR(100),
            ADD COLUMN IF NOT EXISTS utm_medium      VARCHAR(100),
            ADD COLUMN IF NOT EXISTS utm_campaign    VARCHAR(150),
            ADD COLUMN IF NOT EXISTS utm_content     VARCHAR(200),
            ADD COLUMN IF NOT EXISTS utm_term        VARCHAR(200);
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE public.meta_creatives_catalog
            DROP COLUMN IF EXISTS headline,
            DROP COLUMN IF EXISTS destination_url,
            DROP COLUMN IF EXISTS url_tags,
            DROP COLUMN IF EXISTS utm_source,
            DROP COLUMN IF EXISTS utm_medium,
            DROP COLUMN IF EXISTS utm_campaign,
            DROP COLUMN IF EXISTS utm_content,
            DROP COLUMN IF EXISTS utm_term;
    """)
