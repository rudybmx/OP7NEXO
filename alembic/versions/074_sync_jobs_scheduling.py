"""Sync inteligente Meta Ads (spec 002): agendamento de sync_jobs

Adiciona em sync_jobs: tipo (leve|pesado|backfill), next_run_at, attempts.
Índice (status, next_run_at) para o poll do worker "nunca desistir".

Revision ID: 074
Revises: 073
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "074"
down_revision = "073"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sync_jobs",
        sa.Column("tipo", sa.String(10), nullable=False, server_default="leve"),
    )
    op.add_column(
        "sync_jobs",
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.add_column(
        "sync_jobs",
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    # next_run_at das linhas existentes = created_at (não disparar tudo de uma vez).
    op.execute("UPDATE sync_jobs SET next_run_at = created_at")
    # Derivar tipo dos valores antigos de modo_sync.
    op.execute("UPDATE sync_jobs SET tipo = 'backfill' WHERE modo_sync = 'backfill'")
    op.create_index(
        "ix_sync_jobs_status_next_run",
        "sync_jobs",
        ["status", "next_run_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_sync_jobs_status_next_run", table_name="sync_jobs")
    op.drop_column("sync_jobs", "attempts")
    op.drop_column("sync_jobs", "next_run_at")
    op.drop_column("sync_jobs", "tipo")
