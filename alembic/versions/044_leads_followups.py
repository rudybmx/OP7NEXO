"""leads followups

Revision ID: 044_leads_followups
Revises: 043_whatsapp_media_pipeline
Create Date: 2026-05-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "044_leads_followups"
down_revision: Union[str, None] = "043_whatsapp_media_pipeline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_contatos
            ADD COLUMN IF NOT EXISTS lead_status VARCHAR(32) NOT NULL DEFAULT 'novo',
            ADD COLUMN IF NOT EXISTS lead_score INTEGER,
            ADD COLUMN IF NOT EXISTS followup_due_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS last_origin_event_id UUID
    """))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_conversas
            ADD COLUMN IF NOT EXISTS lead_status VARCHAR(32) NOT NULL DEFAULT 'novo',
            ADD COLUMN IF NOT EXISTS followup_due_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS last_outbound_at TIMESTAMPTZ
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS public.crm_lead_origin_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
            canal_id UUID REFERENCES public.canais_entrada(id) ON DELETE SET NULL,
            contato_id UUID REFERENCES public.crm_whatsapp_contatos(id) ON DELETE CASCADE,
            conversa_id UUID REFERENCES public.crm_whatsapp_conversas(id) ON DELETE SET NULL,
            mensagem_id UUID REFERENCES public.crm_whatsapp_mensagens(id) ON DELETE SET NULL,
            raw_event_id UUID REFERENCES public.crm_whatsapp_eventos(id) ON DELETE SET NULL,
            source VARCHAR(50),
            medium VARCHAR(50),
            campaign VARCHAR(150),
            origin_label VARCHAR(150),
            meta_ad_id VARCHAR(100),
            meta_ctwa_clid VARCHAR(150),
            meta_headline TEXT,
            meta_source_url TEXT,
            referral_json JSONB,
            raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_contatos
            DROP CONSTRAINT IF EXISTS crm_whatsapp_contatos_last_origin_event_id_fkey
    """))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_contatos
            ADD CONSTRAINT crm_whatsapp_contatos_last_origin_event_id_fkey
            FOREIGN KEY (last_origin_event_id) REFERENCES public.crm_lead_origin_events(id) ON DELETE SET NULL
            NOT VALID
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS public.crm_followups (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
            canal_id UUID REFERENCES public.canais_entrada(id) ON DELETE SET NULL,
            contato_id UUID NOT NULL REFERENCES public.crm_whatsapp_contatos(id) ON DELETE CASCADE,
            conversa_id UUID REFERENCES public.crm_whatsapp_conversas(id) ON DELETE SET NULL,
            responsavel_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
            tipo VARCHAR(50) NOT NULL DEFAULT 'retorno',
            status VARCHAR(32) NOT NULL DEFAULT 'pendente',
            due_at TIMESTAMPTZ NOT NULL,
            completed_at TIMESTAMPTZ,
            nota TEXT,
            created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
            updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))

    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_lead_origin_workspace_created
        ON public.crm_lead_origin_events(workspace_id, created_at DESC)
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_lead_origin_contato
        ON public.crm_lead_origin_events(contato_id, created_at DESC)
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_followups_workspace_due
        ON public.crm_followups(workspace_id, status, due_at)
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_followups_contato
        ON public.crm_followups(contato_id, due_at DESC)
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_contatos_lead_status
        ON public.crm_whatsapp_contatos(workspace_id, lead_status)
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_conversas_followup_due
        ON public.crm_whatsapp_conversas(workspace_id, followup_due_at)
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_conversas_followup_due"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_contatos_lead_status"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_followups_contato"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_followups_workspace_due"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_lead_origin_contato"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_lead_origin_workspace_created"))
    op.execute(sa.text("DROP TABLE IF EXISTS public.crm_followups"))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_contatos
            DROP CONSTRAINT IF EXISTS crm_whatsapp_contatos_last_origin_event_id_fkey,
            DROP COLUMN IF EXISTS last_origin_event_id,
            DROP COLUMN IF EXISTS followup_due_at,
            DROP COLUMN IF EXISTS lead_score,
            DROP COLUMN IF EXISTS lead_status
    """))
    op.execute(sa.text("DROP TABLE IF EXISTS public.crm_lead_origin_events"))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_conversas
            DROP COLUMN IF EXISTS last_outbound_at,
            DROP COLUMN IF EXISTS last_inbound_at,
            DROP COLUMN IF EXISTS followup_due_at,
            DROP COLUMN IF EXISTS lead_status
    """))
