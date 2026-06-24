"""Conversa: marcação manual "não lida" (marcada_nao_lida)

Adiciona crm_whatsapp_conversas.marcada_nao_lida (boolean, default false).
Distingue "marquei como não lido" de "tem mensagem nova" (nao_lidas).

Revision ID: 092
Revises: 091
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = "092"
down_revision = "091"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crm_whatsapp_conversas",
        sa.Column("marcada_nao_lida", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("crm_whatsapp_conversas", "marcada_nao_lida")
