"""Ambiente de Notificações: notificacoes + leituras (por usuário) + config (audiência)

Notificações in-app genéricas e escaláveis (tipo livre + payload JSONB), com:
- audiência por papel (snapshot em `audiencia_papeis`; [] = todos),
- leitura POR USUÁRIO (`notificacao_leituras`) — broadcast sem fan-out de linhas,
- config por workspace×tipo (`notificacao_config`) para ligar/desligar e ajustar quem vê.

Tipos iniciais: 'canal_offline' (gatilho health-check, audiência admin) e
'mensagem_nova' (gatilho inbound, agregada por conversa, audiência atendente).

Revision ID: 100
Revises: 099
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "100"
down_revision = "099"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── notificacoes ─────────────────────────────────────────────────────────
    op.create_table(
        "notificacoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tipo", sa.String(length=40), nullable=False),
        sa.Column("severidade", sa.String(length=10), server_default="info", nullable=False),
        sa.Column("titulo", sa.String(length=160), nullable=False),
        sa.Column("mensagem", sa.Text(), nullable=True),
        sa.Column("link", sa.String(length=300), nullable=True),
        # snapshot dos papéis que veem esta notificação ([] = todos do workspace)
        sa.Column("audiencia_papeis", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        # referência opcional à entidade de origem (p/ dedupe e "marcar lida ao abrir")
        sa.Column("entidade_tipo", sa.String(length=30), nullable=True),
        sa.Column("entidade_id", postgresql.UUID(as_uuid=True), nullable=True),
        # chave lógica de agregação/anti-spam (ex.: 'mensagem_nova:<conversa_id>')
        sa.Column("dedupe_key", sa.String(length=200), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notificacoes_ws_criado", "notificacoes", ["workspace_id", "criado_em"])
    op.create_index("ix_notificacoes_ws_dedupe", "notificacoes", ["workspace_id", "dedupe_key"])
    op.create_index("ix_notificacoes_entidade", "notificacoes", ["entidade_tipo", "entidade_id"])

    # ── notificacao_leituras (estado de leitura POR usuário) ─────────────────
    op.create_table(
        "notificacao_leituras",
        sa.Column("notificacao_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lida_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["notificacao_id"], ["notificacoes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("notificacao_id", "user_id"),
    )
    op.create_index("ix_notificacao_leituras_user", "notificacao_leituras", ["user_id"])

    # ── notificacao_config (audiência/ativação por workspace×tipo) ───────────
    op.create_table(
        "notificacao_config",
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tipo", sa.String(length=40), nullable=False),
        sa.Column("ativo", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("audiencia_papeis", postgresql.JSONB(), nullable=False),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("workspace_id", "tipo"),
    )


def downgrade() -> None:
    op.drop_table("notificacao_config")
    op.drop_index("ix_notificacao_leituras_user", table_name="notificacao_leituras")
    op.drop_table("notificacao_leituras")
    op.drop_index("ix_notificacoes_entidade", table_name="notificacoes")
    op.drop_index("ix_notificacoes_ws_dedupe", table_name="notificacoes")
    op.drop_index("ix_notificacoes_ws_criado", table_name="notificacoes")
    op.drop_table("notificacoes")
