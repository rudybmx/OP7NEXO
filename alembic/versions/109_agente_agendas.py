"""Seleção de agenda pelo agente (Fase 6): agente_agendas

Vínculo M:N agente↔agenda. Restringe quais agendas o agente de IA pode consultar/marcar
(multi-clínica). SEM vínculo = atende todas as agendáveis do workspace (fallback compatível).

Revision ID: 109
Revises: 108
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "109"
down_revision = "108"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agente_agendas",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("agente_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agenda_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agente_id"], ["agentes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agenda_id"], ["agendas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agente_id", "agenda_id", name="uq_agente_agenda"),
    )
    op.create_index("ix_agente_agendas_agente_id", "agente_agendas", ["agente_id"])
    op.create_index("ix_agente_agendas_agenda_id", "agente_agendas", ["agenda_id"])


def downgrade() -> None:
    op.drop_index("ix_agente_agendas_agenda_id", table_name="agente_agendas")
    op.drop_index("ix_agente_agendas_agente_id", table_name="agente_agendas")
    op.drop_table("agente_agendas")
