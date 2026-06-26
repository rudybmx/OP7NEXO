"""Catálogo de serviços da Agenda (Fase 1.5): agenda_servicos + agendamentos.servico_id

Serviço por agenda (agenda_id NULL = serviço do workspace, vale p/ todas as agendas).
duracao_minutos guia o slot/disponibilidade. agendamentos ganha servico_id (FK nullable)
mantendo `servico` text como snapshot do nome.

(Renumerado de 102 -> 103 por colisão: outro agente já tinha revision 102 = contato_nome_confirmado.)

Revision ID: 103
Revises: 102
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "103"
down_revision = "102"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agenda_servicos",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agenda_id", postgresql.UUID(as_uuid=True), nullable=True),  # NULL = serviço do workspace (todas as agendas)
        sa.Column("nome", sa.String(length=120), nullable=False),
        sa.Column("duracao_minutos", sa.Integer(), server_default="30", nullable=False),
        sa.Column("preco", sa.Numeric(10, 2), nullable=True),
        sa.Column("cor", sa.String(length=20), nullable=True),
        sa.Column("ativo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agenda_id"], ["agendas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agenda_servicos_ws", "agenda_servicos", ["workspace_id", "agenda_id", "ativo"])

    op.add_column("agendamentos", sa.Column("servico_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_agendamentos_servico", "agendamentos", "agenda_servicos", ["servico_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_agendamentos_servico", "agendamentos", type_="foreignkey")
    op.drop_column("agendamentos", "servico_id")
    op.drop_index("ix_agenda_servicos_ws", table_name="agenda_servicos")
    op.drop_table("agenda_servicos")
