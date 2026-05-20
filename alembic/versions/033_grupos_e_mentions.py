"""add group support and mentions to CRM schema

Revision ID: 033_grupos_e_mentions
Revises: 032_add_canal_id_conversas
Create Date: 2026-05-15
"""
from alembic import op

revision = '033_grupos_e_mentions'
down_revision = '032_add_canal_id_conversas'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- 1. Campos de grupo na conversa --
    op.execute("""
        ALTER TABLE public.crm_whatsapp_conversas
            ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS group_name TEXT;
    """)

    # -- 2. Campos de participante e menção na mensagem --
    op.execute("""
        ALTER TABLE public.crm_whatsapp_mensagens
            ADD COLUMN IF NOT EXISTS participant_jid TEXT,
            ADD COLUMN IF NOT EXISTS participant_name TEXT,
            ADD COLUMN IF NOT EXISTS is_mentioned BOOLEAN NOT NULL DEFAULT false;
    """)

    # -- 3. Índices de performance --
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_conversas_is_group ON public.crm_whatsapp_conversas(is_group);
        CREATE INDEX IF NOT EXISTS idx_mensagens_participant ON public.crm_whatsapp_mensagens(participant_jid);
        CREATE INDEX IF NOT EXISTS idx_mensagens_mentioned ON public.crm_whatsapp_mensagens(is_mentioned);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS idx_mensagens_mentioned;
        DROP INDEX IF EXISTS idx_mensagens_participant;
        DROP INDEX IF EXISTS idx_conversas_is_group;

        ALTER TABLE public.crm_whatsapp_mensagens
            DROP COLUMN IF EXISTS is_mentioned,
            DROP COLUMN IF EXISTS participant_name,
            DROP COLUMN IF EXISTS participant_jid;

        ALTER TABLE public.crm_whatsapp_conversas
            DROP COLUMN IF EXISTS group_name,
            DROP COLUMN IF EXISTS is_group;
    """)
