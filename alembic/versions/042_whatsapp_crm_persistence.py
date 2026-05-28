"""whatsapp crm persistence hardening

Revision ID: 042_whatsapp_crm_persistence
Revises: 041_whatsapp_event_queue
Create Date: 2026-05-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "042_whatsapp_crm_persistence"
down_revision: Union[str, None] = "041_whatsapp_event_queue"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_mensagens
            ADD COLUMN IF NOT EXISTS canal_id UUID REFERENCES public.canais_entrada(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS raw_event_id UUID REFERENCES public.crm_whatsapp_eventos(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS message_hash VARCHAR(64),
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    """))
    op.execute(sa.text("""
        UPDATE public.crm_whatsapp_mensagens m
        SET canal_id = c.canal_id,
            updated_at = COALESCE(m.created_at, NOW())
        FROM public.crm_whatsapp_conversas c
        WHERE m.conversa_id = c.id
          AND m.canal_id IS NULL
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_whatsapp_mensagens_canal_id
        ON public.crm_whatsapp_mensagens(canal_id)
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_whatsapp_mensagens_raw_event_id
        ON public.crm_whatsapp_mensagens(raw_event_id)
    """))
    op.execute(sa.text("""
        DROP INDEX IF EXISTS public.ux_crm_whatsapp_mensagens_evolution_msg
    """))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_mensagens
            DROP CONSTRAINT IF EXISTS uq_mensagens_instance_evolution_msg_id
    """))
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_msg_workspace_canal_provider_id
        ON public.crm_whatsapp_mensagens(workspace_id, canal_id, instance, evolution_msg_id)
        WHERE evolution_msg_id IS NOT NULL AND evolution_msg_id <> ''
    """))
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_msg_workspace_canal_hash
        ON public.crm_whatsapp_mensagens(workspace_id, canal_id, message_hash)
        WHERE message_hash IS NOT NULL AND message_hash <> ''
    """))

    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_conversas
            DROP CONSTRAINT IF EXISTS crm_whatsapp_conversas_instance_remote_jid_key,
            DROP CONSTRAINT IF EXISTS uq_conversas_instance_remote_jid
    """))
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_open_conversation_per_channel
        ON public.crm_whatsapp_conversas(workspace_id, canal_id, instance, remote_jid)
        WHERE ativo = true AND status <> 'resolvido'
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS public.crm_conversation_assignments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
            canal_id UUID REFERENCES public.canais_entrada(id) ON DELETE SET NULL,
            conversa_id UUID NOT NULL REFERENCES public.crm_whatsapp_conversas(id) ON DELETE CASCADE,
            contato_id UUID REFERENCES public.crm_whatsapp_contatos(id) ON DELETE SET NULL,
            action VARCHAR(32) NOT NULL,
            from_responsavel_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
            to_responsavel_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
            from_equipe_id UUID REFERENCES public.crm_whatsapp_equipes(id) ON DELETE SET NULL,
            to_equipe_id UUID REFERENCES public.crm_whatsapp_equipes(id) ON DELETE SET NULL,
            actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_assignments_workspace_created
        ON public.crm_conversation_assignments(workspace_id, created_at DESC)
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_crm_assignments_conversa
        ON public.crm_conversation_assignments(conversa_id, created_at DESC)
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_assignments_conversa"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_assignments_workspace_created"))
    op.execute(sa.text("DROP TABLE IF EXISTS public.crm_conversation_assignments"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.uq_crm_open_conversation_per_channel"))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_conversas
            ADD CONSTRAINT uq_conversas_instance_remote_jid UNIQUE (instance, remote_jid)
    """))
    op.execute(sa.text("DROP INDEX IF EXISTS public.uq_crm_msg_workspace_canal_hash"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.uq_crm_msg_workspace_canal_provider_id"))
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS ux_crm_whatsapp_mensagens_evolution_msg
        ON public.crm_whatsapp_mensagens(instance, evolution_msg_id)
        WHERE evolution_msg_id IS NOT NULL
    """))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_whatsapp_mensagens_raw_event_id"))
    op.execute(sa.text("DROP INDEX IF EXISTS public.ix_crm_whatsapp_mensagens_canal_id"))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_mensagens
            DROP COLUMN IF EXISTS updated_at,
            DROP COLUMN IF EXISTS message_hash,
            DROP COLUMN IF EXISTS raw_event_id,
            DROP COLUMN IF EXISTS canal_id
    """))
