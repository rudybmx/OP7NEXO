"""Agendamento público (Fase 5): agenda_public_tokens

Link público POR AGENDA (token CSPRNG 256-bit) que o paciente usa para marcar sozinho,
sem login. Diferente do canal_connect_tokens: este é LONGEVO e REUSÁVEL (muitos pacientes
usam o mesmo link), nunca consumido por reserva — revogável trocando o status para 'revoked'.
Índice parcial único garante 1 token 'active' por agenda (get-or-create atômico).

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
        "agenda_public_tokens",
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("agenda_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["agenda_id"], ["agendas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("token"),
    )
    op.create_index("ix_agenda_public_tokens_agenda_id", "agenda_public_tokens", ["agenda_id"])
    # 1 token 'active' por agenda (libera get-or-create atômico).
    op.create_index(
        "uq_agenda_public_tokens_agenda_ativo",
        "agenda_public_tokens",
        ["agenda_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_index("uq_agenda_public_tokens_agenda_ativo", table_name="agenda_public_tokens")
    op.drop_index("ix_agenda_public_tokens_agenda_id", table_name="agenda_public_tokens")
    op.drop_table("agenda_public_tokens")
