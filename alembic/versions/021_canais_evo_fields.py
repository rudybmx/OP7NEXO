"""add evolution fields to canais_entrada

Revision ID: 021_canais_evo_fields
Revises: 019_user_workspace_access
Create Date: 2026-05-12 20:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '021_canais_evo_fields'
down_revision: Union[str, None] = '020'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('canais_entrada', sa.Column('numero_telefone', sa.String(20), nullable=True))
    op.add_column('canais_entrada', sa.Column('conectado_em', sa.DateTime(timezone=True), nullable=True))
    op.add_column('canais_entrada', sa.Column('evolution_instance_id', sa.String(100), nullable=True))
    op.add_column('canais_entrada', sa.Column('connection_status', sa.String(20), nullable=True, server_default='disconnected'))


def downgrade() -> None:
    op.drop_column('canais_entrada', 'numero_telefone')
    op.drop_column('canais_entrada', 'conectado_em')
    op.drop_column('canais_entrada', 'evolution_instance_id')
    op.drop_column('canais_entrada', 'connection_status')
