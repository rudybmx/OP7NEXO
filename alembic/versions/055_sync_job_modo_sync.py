"""Adiciona coluna modo_sync em sync_jobs

Revision ID: 055
Revises: 054
Create Date: 2026-06-05
"""
from alembic import op
import sqlalchemy as sa

revision = "055"
down_revision = "054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sync_jobs",
        sa.Column("modo_sync", sa.String(30), nullable=False, server_default="recorrente"),
    )


def downgrade() -> None:
    op.drop_column("sync_jobs", "modo_sync")
