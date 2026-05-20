"""meta_anuncios_insights — tipo_criativo, image_url_hq, link_anuncio, carousel_items

Revision ID: 009
Revises: 008
Create Date: 2026-05-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_anuncios_insights
        ADD COLUMN IF NOT EXISTS tipo_criativo   VARCHAR(20) DEFAULT 'IMAGE',
        ADD COLUMN IF NOT EXISTS image_url_hq    TEXT,
        ADD COLUMN IF NOT EXISTS link_anuncio    TEXT,
        ADD COLUMN IF NOT EXISTS carousel_items  JSONB;
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE meta_anuncios_insights
        DROP COLUMN IF EXISTS tipo_criativo,
        DROP COLUMN IF EXISTS image_url_hq,
        DROP COLUMN IF EXISTS link_anuncio,
        DROP COLUMN IF EXISTS carousel_items;
    """))
