"""Cria tabela crm_contato_etiquetas (vínculo etiqueta <-> contato)

Revision ID: 110
Revises: 109
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = "110"
down_revision = "109"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_contato_etiquetas",
        sa.Column("contato_id", sa.UUID(), nullable=False),
        sa.Column("etiqueta_id", sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint("contato_id", "etiqueta_id"),
        sa.ForeignKeyConstraint(
            ["contato_id"], ["crm_whatsapp_contatos.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["etiqueta_id"], ["crm_etiquetas.id"], ondelete="CASCADE"
        ),
    )


def downgrade() -> None:
    op.drop_table("crm_contato_etiquetas")
