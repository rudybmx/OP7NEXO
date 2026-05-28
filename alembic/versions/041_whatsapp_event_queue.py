"""whatsapp event queue

Revision ID: 041_whatsapp_event_queue
Revises: 040
Create Date: 2026-05-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "041_whatsapp_event_queue"
down_revision: Union[str, None] = "040"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_eventos
            ADD COLUMN IF NOT EXISTS canal_id UUID REFERENCES public.canais_entrada(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS event_type VARCHAR(64),
            ADD COLUMN IF NOT EXISTS event_hash VARCHAR(64),
            ADD COLUMN IF NOT EXISTS processing_status VARCHAR(32) NOT NULL DEFAULT 'pending',
            ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS error_message TEXT
    """))
    op.execute(sa.text("""
        UPDATE public.crm_whatsapp_eventos
        SET event_type = UPPER(REPLACE(REPLACE(COALESCE(event, ''), '.', '_'), '-', '_'))
        WHERE event_type IS NULL
    """))
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_whatsapp_eventos_event_hash
        ON public.crm_whatsapp_eventos(event_hash)
        WHERE event_hash IS NOT NULL
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_whatsapp_eventos_canal_id
        ON public.crm_whatsapp_eventos(canal_id)
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_whatsapp_eventos_processing_status
        ON public.crm_whatsapp_eventos(processing_status)
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS public.crm_message_jobs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
            canal_id UUID REFERENCES public.canais_entrada(id) ON DELETE SET NULL,
            raw_event_id UUID NOT NULL REFERENCES public.crm_whatsapp_eventos(id) ON DELETE CASCADE,
            job_type VARCHAR(32) NOT NULL DEFAULT 'webhook_event',
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            priority INTEGER NOT NULL DEFAULT 0,
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 5,
            locked_at TIMESTAMPTZ,
            locked_by VARCHAR(100),
            next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            processed_at TIMESTAMPTZ,
            error_message TEXT,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_crm_message_jobs_raw_event_id UNIQUE (raw_event_id)
        )
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_message_jobs_status_next_run
        ON public.crm_message_jobs(status, next_run_at, priority DESC, created_at)
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_message_jobs_workspace_status
        ON public.crm_message_jobs(workspace_id, status)
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_message_jobs_workspace_status"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_message_jobs_status_next_run"))
    op.execute(sa.text("DROP TABLE IF EXISTS public.crm_message_jobs"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_whatsapp_eventos_processing_status"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_whatsapp_eventos_canal_id"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.uq_crm_whatsapp_eventos_event_hash"))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_eventos
            DROP COLUMN IF EXISTS error_message,
            DROP COLUMN IF EXISTS retry_count,
            DROP COLUMN IF EXISTS processed_at,
            DROP COLUMN IF EXISTS processing_status,
            DROP COLUMN IF EXISTS event_hash,
            DROP COLUMN IF EXISTS event_type,
            DROP COLUMN IF EXISTS canal_id
    """))
