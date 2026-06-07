"""Adiciona campos favorita e fixada em crm_whatsapp_conversas

Revision ID: 056
Revises: 055
Create Date: 2026-06-07
"""
from alembic import op
import sqlalchemy as sa

revision = "056"
down_revision = "055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crm_whatsapp_conversas",
        sa.Column("favorita", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "crm_whatsapp_conversas",
        sa.Column("fixada", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("crm_whatsapp_conversas", "fixada")
    op.drop_column("crm_whatsapp_conversas", "favorita")
