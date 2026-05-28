"""sync_jobs history and sync_job_events log

Revision ID: 041_meta_sync_history
Revises: 040_meta_tokens_health
Create Date: 2026-05-27
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "041_meta_sync_history"
down_revision: Union[str, None] = "040_meta_tokens_health"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE sync_jobs
        ADD COLUMN IF NOT EXISTS modo_sync VARCHAR NOT NULL DEFAULT 'recorrente'
    """))
    op.execute(sa.text("""
        ALTER TABLE sync_jobs
        ADD COLUMN IF NOT EXISTS janela_inicio DATE
    """))
    op.execute(sa.text("""
        ALTER TABLE sync_jobs
        ADD COLUMN IF NOT EXISTS janela_fim DATE
    """))
    op.execute(sa.text("""
        ALTER TABLE sync_jobs
        ALTER COLUMN modo_sync SET DEFAULT 'recorrente'
    """))
    op.execute(sa.text("""
        ALTER TABLE sync_jobs
        ALTER COLUMN modo_sync SET NOT NULL
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS sync_job_events (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sync_job_id   UUID NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
            tipo          VARCHAR(32) NOT NULL,
            etapa_atual   VARCHAR,
            progresso     INTEGER,
            mensagem      TEXT,
            detalhes      JSONB,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_sync_job_events_sync_job_id_created_at
        ON sync_job_events (sync_job_id, created_at)
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_sync_job_events_sync_job_id_created_at"))
    op.execute(sa.text("DROP TABLE IF EXISTS sync_job_events"))
    op.execute(sa.text("ALTER TABLE sync_jobs DROP COLUMN IF EXISTS janela_fim"))
    op.execute(sa.text("ALTER TABLE sync_jobs DROP COLUMN IF EXISTS janela_inicio"))
    op.execute(sa.text("ALTER TABLE sync_jobs DROP COLUMN IF EXISTS modo_sync"))
