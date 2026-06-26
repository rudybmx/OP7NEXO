"""Responsável de card pode ser um agente de IA: crm_painel_cards.responsavel_agente_id

Permite atribuir um agente (tabela `agentes`) como responsável de um card de painel,
em vez de um usuário. Mutuamente exclusivo com responsavel_user_id (regra na API).
FK ON DELETE SET NULL para não travar exclusão de agente.

Revision ID: 107
Revises: 106
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "107"
down_revision = "106"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crm_painel_cards",
        sa.Column("responsavel_agente_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_painel_cards_responsavel_agente",
        "crm_painel_cards",
        "agentes",
        ["responsavel_agente_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_crm_painel_cards_responsavel_agente_id",
        "crm_painel_cards",
        ["responsavel_agente_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_crm_painel_cards_responsavel_agente_id", table_name="crm_painel_cards")
    op.drop_constraint("fk_painel_cards_responsavel_agente", "crm_painel_cards", type_="foreignkey")
    op.drop_column("crm_painel_cards", "responsavel_agente_id")
