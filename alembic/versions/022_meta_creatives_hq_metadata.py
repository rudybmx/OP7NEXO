"""add HQ metadata fields to meta_creatives_catalog

Revision ID: 022_meta_creatives_hq_metadata
Revises: 021_canais_evo_fields
Create Date: 2026-05-13 00:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '022_meta_creatives_hq_metadata'
down_revision: Union[str, None] = '021_canais_evo_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('meta_creatives_catalog', sa.Column('image_hash', sa.String(length=120), nullable=True))
    op.add_column('meta_creatives_catalog', sa.Column('meta_image_url_tmp', sa.Text(), nullable=True))
    op.add_column('meta_creatives_catalog', sa.Column('meta_permalink_url', sa.Text(), nullable=True))
    op.add_column('meta_creatives_catalog', sa.Column('original_width', sa.Integer(), nullable=True))
    op.add_column('meta_creatives_catalog', sa.Column('original_height', sa.Integer(), nullable=True))
    op.add_column('meta_creatives_catalog', sa.Column('hq_source', sa.String(length=40), nullable=True))
    op.add_column('meta_creatives_catalog', sa.Column('hq_last_resolved_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('meta_creatives_catalog', 'hq_last_resolved_at')
    op.drop_column('meta_creatives_catalog', 'hq_source')
    op.drop_column('meta_creatives_catalog', 'original_height')
    op.drop_column('meta_creatives_catalog', 'original_width')
    op.drop_column('meta_creatives_catalog', 'meta_permalink_url')
    op.drop_column('meta_creatives_catalog', 'meta_image_url_tmp')
    op.drop_column('meta_creatives_catalog', 'image_hash')
