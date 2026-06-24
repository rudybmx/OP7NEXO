"""Link público de conexão: tabela canal_connect_tokens

Token público (CSPRNG 256 bits) que o admin envia ao cliente para conectar o
canal WhatsApp sem login. Separado do webhook_token. Um token 'active' por canal
(índice parcial único) → get-or-create atômico; consumo (1h) anti-hijack.

Revision ID: 090
Revises: 089
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "090"
down_revision = "089"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "canal_connect_tokens",
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("canal_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["canal_id"], ["canais_entrada.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("token"),
    )
    op.create_index(
        "ix_canal_connect_tokens_canal_id",
        "canal_connect_tokens",
        ["canal_id"],
    )
    # Garante no máximo 1 token 'active' por canal — base do get-or-create atômico.
    op.create_index(
        "uq_canal_connect_tokens_canal_ativo",
        "canal_connect_tokens",
        ["canal_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_index("uq_canal_connect_tokens_canal_ativo", table_name="canal_connect_tokens")
    op.drop_index("ix_canal_connect_tokens_canal_id", table_name="canal_connect_tokens")
    op.drop_table("canal_connect_tokens")
