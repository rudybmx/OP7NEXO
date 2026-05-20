"""meta_anuncios_insights — resultado bruto por anúncio

Revision ID: 037_meta_anuncios_resultados
Revises: 036_meta_creatives_utm
Create Date: 2026-05-16
"""
from alembic import op

revision = "037_meta_anuncios_resultados"
down_revision = "036_meta_creatives_utm"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE public.meta_anuncios_insights
            ADD COLUMN IF NOT EXISTS result_count INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS result_indicator TEXT;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE public.meta_anuncios_insights
            DROP COLUMN IF EXISTS result_indicator,
            DROP COLUMN IF EXISTS result_count;
    """)
