"""enriquecimento contatos e grupos — avatar_fetched_at, group_avatar_url

Revision ID: 034_enriquecimento_contatos
Revises: 033_grupos_e_mentions
Create Date: 2026-05-15
"""
from alembic import op

revision = '034_enriquecimento_contatos'
down_revision = '033_grupos_e_mentions'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- 1. avatar_fetched_at para controle de re-fetch de foto de perfil --
    op.execute("""
        ALTER TABLE public.crm_whatsapp_contatos
            ADD COLUMN IF NOT EXISTS avatar_fetched_at TIMESTAMPTZ;
    """)

    # -- 2. group_avatar_url para foto do grupo --
    op.execute("""
        ALTER TABLE public.crm_whatsapp_conversas
            ADD COLUMN IF NOT EXISTS group_avatar_url TEXT;
    """)

    # -- 3. Índices --
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_contatos_avatar_fetched_at
            ON public.crm_whatsapp_contatos(avatar_fetched_at)
            WHERE avatar_fetched_at IS NOT NULL;
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS idx_contatos_avatar_fetched_at;

        ALTER TABLE public.crm_whatsapp_conversas
            DROP COLUMN IF EXISTS group_avatar_url;

        ALTER TABLE public.crm_whatsapp_contatos
            DROP COLUMN IF EXISTS avatar_fetched_at;
    """)
