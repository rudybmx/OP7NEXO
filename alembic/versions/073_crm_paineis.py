"""Kanban / Painéis CRM — 6 tabelas (crm_paineis + crm_painel_*)

Revision ID: 073
Revises: 072
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "073"
down_revision = "072"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_paineis",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("tipo", sa.String(40), nullable=False, server_default="custom"),
        sa.Column("sistema", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("automacao_ativa", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("bloqueado", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_crm_paineis_workspace", "crm_paineis", ["workspace_id"])
    # Um único painel de cada tipo de sistema por workspace (custom é livre).
    op.create_index(
        "uq_painel_workspace_tipo",
        "crm_paineis",
        ["workspace_id", "tipo"],
        unique=True,
        postgresql_where=sa.text("tipo <> 'custom' AND ativo = true"),
    )

    op.create_table(
        "crm_painel_fases",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("painel_id", sa.UUID(), nullable=False),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("cor", sa.String(7), nullable=False, server_default="#64748b"),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("limite_wip", sa.Integer(), nullable=True),
        sa.Column("fixa", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["painel_id"], ["crm_paineis.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_crm_painel_fases_painel", "crm_painel_fases", ["painel_id"])

    op.create_table(
        "crm_painel_campos",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("painel_id", sa.UUID(), nullable=False),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False, server_default="texto"),
        sa.Column("opcoes", JSONB(), nullable=True),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["painel_id"], ["crm_paineis.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_crm_painel_campos_painel", "crm_painel_campos", ["painel_id"])

    op.create_table(
        "crm_painel_cards",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("painel_id", sa.UUID(), nullable=False),
        sa.Column("fase_id", sa.UUID(), nullable=False),
        sa.Column("titulo", sa.String(255), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("prioridade", sa.String(20), nullable=True),
        sa.Column("responsavel_user_id", sa.UUID(), nullable=True),
        sa.Column("origem_agente", sa.String(120), nullable=True),
        sa.Column("data_vencimento", sa.DateTime(timezone=True), nullable=True),
        sa.Column("nome", sa.String(255), nullable=True),
        sa.Column("telefone", sa.String(40), nullable=True),
        sa.Column("canal_entrada_id", sa.UUID(), nullable=True),
        sa.Column("resumo_conversa", sa.Text(), nullable=True),
        sa.Column("conversa_id", sa.UUID(), nullable=True),
        sa.Column("contato_id", sa.UUID(), nullable=True),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("arquivado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["painel_id"], ["crm_paineis.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fase_id"], ["crm_painel_fases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["responsavel_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["canal_entrada_id"], ["canais_entrada.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["conversa_id"], ["crm_whatsapp_conversas.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["contato_id"], ["crm_whatsapp_contatos.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_crm_painel_cards_painel", "crm_painel_cards", ["painel_id"])
    op.create_index("ix_crm_painel_cards_fase", "crm_painel_cards", ["fase_id"])
    op.create_index("ix_crm_painel_cards_conversa", "crm_painel_cards", ["conversa_id"])
    # Idempotência das automações: 1 card por (painel, conversa) enquanto ativo.
    op.create_index(
        "uq_painel_card_conversa",
        "crm_painel_cards",
        ["painel_id", "conversa_id"],
        unique=True,
        postgresql_where=sa.text("conversa_id IS NOT NULL AND ativo = true"),
    )

    op.create_table(
        "crm_painel_card_valores",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("card_id", sa.UUID(), nullable=False),
        sa.Column("campo_id", sa.UUID(), nullable=False),
        sa.Column("valor", JSONB(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["card_id"], ["crm_painel_cards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["campo_id"], ["crm_painel_campos.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("card_id", "campo_id", name="uq_card_campo"),
    )

    op.create_table(
        "crm_painel_comentarios",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("card_id", sa.UUID(), nullable=False),
        sa.Column("autor_user_id", sa.UUID(), nullable=True),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["card_id"], ["crm_painel_cards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["autor_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_crm_painel_comentarios_card", "crm_painel_comentarios", ["card_id"])


def downgrade() -> None:
    op.drop_table("crm_painel_comentarios")
    op.drop_table("crm_painel_card_valores")
    op.drop_table("crm_painel_cards")
    op.drop_table("crm_painel_campos")
    op.drop_table("crm_painel_fases")
    op.drop_table("crm_paineis")
