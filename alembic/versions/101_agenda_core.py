"""Agenda nativa (core): agendas + horarios + bloqueios + agendamentos

Espelha op7nexo-front/src/types/agenda.ts. Multi-tenant (workspace_id em toda tabela).
Anti-double-booking matemático via EXCLUDE (btree_gist): nenhuma sobreposição no mesmo
(agenda_id, slot_index), parcial nos status que ocupam vaga (agendado/confirmado/em_atendimento).
Vínculo do agendamento ao contato por telefone normalizado (canonização do 9º dígito BR).

Revision ID: 101
Revises: 100
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "101"
down_revision = "100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extensão necessária para EXCLUDE com igualdade (uuid/int) + range no mesmo índice GiST
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    # ── agendas (o recurso: profissional/sala/equipamento) ───────────────────
    op.create_table(
        "agendas",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nome", sa.String(length=120), nullable=False),
        sa.Column("tipo", sa.String(length=20), server_default="profissional", nullable=False),
        sa.Column("cor", sa.String(length=20), server_default="#3E5BFF", nullable=False),
        sa.Column("capacidade_simultanea", sa.Integer(), server_default="1", nullable=False),
        sa.Column("fuso_horario", sa.String(length=40), server_default="America/Sao_Paulo", nullable=False),
        sa.Column("webhook_url", sa.Text(), nullable=True),
        # autonomia do agente de IA por agenda (lógica na Fase 3): desativado|direto|confirmar
        sa.Column("agente_agendamento", sa.String(length=12), server_default="confirmar", nullable=False),
        # profissional dono da agenda (permissão fina é fase futura — coluna barata agora)
        sa.Column("responsavel_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("ativo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["responsavel_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agendas_ws", "agendas", ["workspace_id", "ativo"])

    # ── agenda_horarios (working hours por dia; várias faixas/dia permitidas) ─
    op.create_table(
        "agenda_horarios",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agenda_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dia_semana", sa.String(length=3), nullable=False),  # dom|seg|ter|qua|qui|sex|sab
        sa.Column("ativo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("hora_inicio", sa.String(length=5), nullable=False),  # HH:mm
        sa.Column("hora_fim", sa.String(length=5), nullable=False),
        sa.Column("duracao_slot_minutos", sa.Integer(), server_default="30", nullable=False),
        sa.Column("tem_almoco", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("almoco_inicio", sa.String(length=5), nullable=True),
        sa.Column("almoco_fim", sa.String(length=5), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agenda_id"], ["agendas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agenda_horarios_agenda", "agenda_horarios", ["agenda_id", "dia_semana"])

    # ── agenda_bloqueios (global=null ou por agenda) ─────────────────────────
    op.create_table(
        "agenda_bloqueios",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agenda_id", postgresql.UUID(as_uuid=True), nullable=True),  # null = bloqueio global do workspace
        sa.Column("motivo", sa.String(length=200), nullable=False),
        sa.Column("inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fim", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tipo", sa.String(length=20), server_default="outro", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agenda_id"], ["agendas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agenda_bloqueios_ws", "agenda_bloqueios", ["workspace_id", "inicio", "fim"])
    op.create_index("ix_agenda_bloqueios_agenda", "agenda_bloqueios", ["agenda_id"])

    # ── agendamentos ─────────────────────────────────────────────────────────
    op.create_table(
        "agendamentos",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agenda_id", postgresql.UUID(as_uuid=True), nullable=False),
        # vínculo por telefone (chave) + contato_id de conveniência (nullable)
        sa.Column("contato_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cliente_nome", sa.String(length=160), nullable=False),
        sa.Column("cliente_telefone", sa.String(length=20), nullable=True),
        sa.Column("cliente_telefone_normalizado", sa.String(length=20), nullable=True),
        sa.Column("cliente_email", sa.String(length=160), nullable=True),
        # exceção terceiro: quem marcou (telefone da conversa), p/ aparecer na caixa do contato
        sa.Column("agendado_por_telefone", sa.String(length=20), nullable=True),
        sa.Column("agendado_por_telefone_normalizado", sa.String(length=20), nullable=True),
        sa.Column("data_hora_inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("data_hora_fim", sa.DateTime(timezone=True), nullable=False),
        sa.Column("slot_index", sa.Integer(), server_default="0", nullable=False),
        sa.Column("servico", sa.String(length=160), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="agendado", nullable=False),
        sa.Column("origem", sa.String(length=12), server_default="manual", nullable=False),
        sa.Column("criado_por", sa.String(length=64), nullable=True),
        sa.Column("cancelamento_motivo", sa.Text(), nullable=True),
        sa.Column("cancelado_por", sa.String(length=64), nullable=True),
        sa.Column("cancelado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reagendado_de", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("nps_enviado", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("nps_enviado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("nps_score", sa.Integer(), nullable=True),
        sa.Column("ativo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agenda_id"], ["agendas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contato_id"], ["crm_whatsapp_contatos.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reagendado_de"], ["agendamentos.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agendamentos_ws_agenda_inicio", "agendamentos", ["workspace_id", "agenda_id", "data_hora_inicio"])
    op.create_index("ix_agendamentos_ws_tel", "agendamentos", ["workspace_id", "cliente_telefone_normalizado"])
    op.create_index("ix_agendamentos_ws_agpor_tel", "agendamentos", ["workspace_id", "agendado_por_telefone_normalizado"])
    op.create_index("ix_agendamentos_ws_status", "agendamentos", ["workspace_id", "status"])
    op.create_index("ix_agendamentos_contato", "agendamentos", ["contato_id"])

    # Anti-double-booking: nenhuma sobreposição de horário no mesmo (agenda_id, slot_index)
    # entre agendamentos que ocupam vaga. tstzrange '[)' → back-to-back não colide.
    op.execute(
        """
        ALTER TABLE agendamentos
        ADD CONSTRAINT excl_agendamentos_no_overlap
        EXCLUDE USING gist (
            agenda_id WITH =,
            slot_index WITH =,
            tstzrange(data_hora_inicio, data_hora_fim) WITH &&
        )
        WHERE (ativo AND status IN ('agendado', 'confirmado', 'em_atendimento'))
        """
    )


def downgrade() -> None:
    op.drop_table("agendamentos")  # remove a EXCLUDE + índices junto
    op.drop_index("ix_agenda_bloqueios_agenda", table_name="agenda_bloqueios")
    op.drop_index("ix_agenda_bloqueios_ws", table_name="agenda_bloqueios")
    op.drop_table("agenda_bloqueios")
    op.drop_index("ix_agenda_horarios_agenda", table_name="agenda_horarios")
    op.drop_table("agenda_horarios")
    op.drop_index("ix_agendas_ws", table_name="agendas")
    op.drop_table("agendas")
    # btree_gist permanece instalado (idempotente; pode ser usado por outras tabelas)
