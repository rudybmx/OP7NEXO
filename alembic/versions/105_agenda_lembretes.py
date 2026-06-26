"""Lembretes de agendamento (Fase 4): agenda_lembrete_config + agenda_lembrete_envios

Config de lembrete por agenda (agenda_id NULL = global do workspace). O job de varredura no
worker envia por WhatsApp X dias/horas antes; agenda_lembrete_envios é o log de dedupe durável
(1 envio por agendamento×config, não re-spamma o paciente).

Revision ID: 105
Revises: 104
Create Date: 2026-06-26

(Renumerado de 104 -> 105 por colisão: outro agente já tinha revision 104 = agente_horario_modo.)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "105"
down_revision = "104"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agenda_lembrete_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agenda_id", postgresql.UUID(as_uuid=True), nullable=True),  # NULL = global do workspace
        sa.Column("canal", sa.String(length=20), server_default="whatsapp", nullable=False),
        sa.Column("dias_antes", sa.Integer(), server_default="1", nullable=False),
        sa.Column("hora_envio", sa.String(length=5), nullable=True),   # 'HH:mm' p/ dias_antes > 0
        sa.Column("horas_antes", sa.Integer(), nullable=True),         # p/ dias_antes = 0
        sa.Column("mensagem_template", sa.Text(), nullable=False),
        sa.Column("tem_midia", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("midia_url", sa.Text(), nullable=True),
        sa.Column("midia_tipo", sa.String(length=20), nullable=True),
        sa.Column("ativo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("ordem", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agenda_id"], ["agendas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agenda_lembrete_config_ws", "agenda_lembrete_config", ["workspace_id", "ativo"])

    op.create_table(
        "agenda_lembrete_envios",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agendamento_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("config_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("enviado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("status", sa.String(length=12), server_default="enviado", nullable=False),
        sa.Column("erro", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agendamento_id"], ["agendamentos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["config_id"], ["agenda_lembrete_config.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agendamento_id", "config_id", name="uq_lembrete_envio_agendamento_config"),
    )


def downgrade() -> None:
    op.drop_table("agenda_lembrete_envios")
    op.drop_index("ix_agenda_lembrete_config_ws", table_name="agenda_lembrete_config")
    op.drop_table("agenda_lembrete_config")
