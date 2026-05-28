"""whatsapp media pipeline

Revision ID: 043_whatsapp_media_pipeline
Revises: 042_whatsapp_crm_persistence
Create Date: 2026-05-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "043_whatsapp_media_pipeline"
down_revision: Union[str, None] = "042_whatsapp_crm_persistence"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_mensagens
            ADD COLUMN IF NOT EXISTS media_status VARCHAR(32),
            ADD COLUMN IF NOT EXISTS media_error TEXT
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_whatsapp_mensagens_media_status
        ON public.crm_whatsapp_mensagens(workspace_id, media_status)
    """))

    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_midia
            ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS canal_id UUID REFERENCES public.canais_entrada(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS storage_status VARCHAR(32) NOT NULL DEFAULT 'ready',
            ADD COLUMN IF NOT EXISTS sha256 VARCHAR(64),
            ADD COLUMN IF NOT EXISTS filename VARCHAR(255),
            ADD COLUMN IF NOT EXISTS caption TEXT,
            ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
            ADD COLUMN IF NOT EXISTS width INTEGER,
            ADD COLUMN IF NOT EXISTS height INTEGER,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    """))
    op.execute(sa.text("""
        UPDATE public.crm_whatsapp_midia md
        SET workspace_id = c.workspace_id,
            canal_id = c.canal_id
        FROM public.crm_whatsapp_conversas c
        WHERE md.conversa_id = c.id
          AND md.workspace_id IS NULL
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_whatsapp_midia_workspace_status
        ON public.crm_whatsapp_midia(workspace_id, storage_status)
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_whatsapp_midia_mensagem
        ON public.crm_whatsapp_midia(mensagem_id)
    """))

    op.execute(sa.text("""
        ALTER TABLE public.crm_message_jobs
            ADD COLUMN IF NOT EXISTS related_message_id UUID REFERENCES public.crm_whatsapp_mensagens(id) ON DELETE CASCADE
    """))
    op.execute(sa.text("""
        ALTER TABLE public.crm_message_jobs
            ALTER COLUMN raw_event_id DROP NOT NULL
    """))
    op.execute(sa.text("""
        ALTER TABLE public.crm_message_jobs
            DROP CONSTRAINT IF EXISTS uq_crm_message_jobs_raw_event_id
    """))
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_message_jobs_webhook_event
        ON public.crm_message_jobs(raw_event_id)
        WHERE raw_event_id IS NOT NULL AND job_type = 'webhook_event'
    """))
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_message_jobs_media_download
        ON public.crm_message_jobs(related_message_id)
        WHERE related_message_id IS NOT NULL AND job_type = 'media_download'
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS public.uq_crm_message_jobs_media_download"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.uq_crm_message_jobs_webhook_event"))
    op.execute(sa.text("""
        ALTER TABLE public.crm_message_jobs
            DROP COLUMN IF EXISTS related_message_id
    """))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_whatsapp_midia_mensagem"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_whatsapp_midia_workspace_status"))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_midia
            DROP COLUMN IF EXISTS updated_at,
            DROP COLUMN IF EXISTS height,
            DROP COLUMN IF EXISTS width,
            DROP COLUMN IF EXISTS duration_seconds,
            DROP COLUMN IF EXISTS caption,
            DROP COLUMN IF EXISTS filename,
            DROP COLUMN IF EXISTS sha256,
            DROP COLUMN IF EXISTS storage_status,
            DROP COLUMN IF EXISTS canal_id,
            DROP COLUMN IF EXISTS workspace_id
    """))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_whatsapp_mensagens_media_status"))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_mensagens
            DROP COLUMN IF EXISTS media_error,
            DROP COLUMN IF EXISTS media_status
    """))
