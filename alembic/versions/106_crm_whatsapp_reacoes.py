"""CRM: reações com emoji em mensagens de WhatsApp (crm_whatsapp_reacoes)

Tabela de reações (espelha o WhatsApp real). Reação é evento mutável:
mesma pessoa troca o emoji (REPLACE) ou remove (a linha é apagada). Unicidade
por (workspace, canal, instance, mensagem-alvo, quem-reagiu) — emoji FORA da
chave — dá idempotência ao eco inbound do que enviamos. Casa com a mensagem-alvo
pelo id externo do provider (evolution_msg_id / wamid / id WAHA), tolerando
reação que chega antes da própria mensagem-alvo (mensagem_id nullable).

Revision ID: 106
Revises: 105
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "106"
down_revision = "105"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_whatsapp_reacoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("canal_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("conversa_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("mensagem_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("instance", sa.String(length=100), nullable=True),
        sa.Column("target_evolution_msg_id", sa.String(length=255), nullable=False),
        sa.Column("reactor_jid", sa.String(length=64), nullable=False),
        sa.Column("reactor_name", sa.String(length=255), nullable=True),
        sa.Column("from_me", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=True),
        sa.Column("reacted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["canal_id"], ["canais_entrada.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["conversa_id"], ["crm_whatsapp_conversas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["mensagem_id"], ["crm_whatsapp_mensagens.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # Unicidade: 1 reação por (pessoa × mensagem-alvo) num canal/instância.
    # emoji FORA da chave → trocar emoji é UPDATE, remover é DELETE; o eco
    # from_me do que enviamos cai na mesma linha (idempotência). NULLS NOT
    # DISTINCT p/ que canal_id/instance nulos ainda colidam (Postgres 15+).
    op.create_index(
        "uq_crm_reacao_target_reactor",
        "crm_whatsapp_reacoes",
        ["workspace_id", "canal_id", "instance", "target_evolution_msg_id", "reactor_jid"],
        unique=True,
        postgresql_nulls_not_distinct=True,
    )
    op.create_index("ix_crm_reacao_mensagem", "crm_whatsapp_reacoes", ["mensagem_id"])
    op.create_index(
        "ix_crm_reacao_target",
        "crm_whatsapp_reacoes",
        ["workspace_id", "canal_id", "instance", "target_evolution_msg_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_crm_reacao_target", table_name="crm_whatsapp_reacoes")
    op.drop_index("ix_crm_reacao_mensagem", table_name="crm_whatsapp_reacoes")
    op.drop_index("uq_crm_reacao_target_reactor", table_name="crm_whatsapp_reacoes")
    op.drop_table("crm_whatsapp_reacoes")
