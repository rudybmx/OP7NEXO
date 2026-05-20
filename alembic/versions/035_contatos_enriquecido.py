"""contatos enrichment — etapa_funil, responsavel, equipe, UTM, Meta referral

Revision ID: 035_contatos_enriquecido
Revises: 034_enriquecimento_contatos
Create Date: 2026-05-15
"""
from alembic import op

revision = '035_contatos_enriquecido'
down_revision = '034_enriquecimento_contatos'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- 1. Campos de CRM/funil --
    op.execute("""
        ALTER TABLE public.crm_whatsapp_contatos
            ADD COLUMN IF NOT EXISTS etapa_funil VARCHAR(50) DEFAULT 'novo',
            ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS equipe_id UUID REFERENCES public.crm_whatsapp_equipes(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS notas TEXT,
            ADD COLUMN IF NOT EXISTS instagram VARCHAR(100),
            ADD COLUMN IF NOT EXISTS facebook VARCHAR(100),
            ADD COLUMN IF NOT EXISTS primeira_conversa_at TIMESTAMPTZ;
    """)

    # -- 2. Campos de UTM / tracking --
    op.execute("""
        ALTER TABLE public.crm_whatsapp_contatos
            ADD COLUMN IF NOT EXISTS campanha_origem VARCHAR(100),
            ADD COLUMN IF NOT EXISTS utm_source VARCHAR(50),
            ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(50),
            ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(100);
    """)

    # -- 3. Campos específicos Meta Ads (Click-to-WhatsApp referral) --
    op.execute("""
        ALTER TABLE public.crm_whatsapp_contatos
            ADD COLUMN IF NOT EXISTS meta_ad_id VARCHAR(50),
            ADD COLUMN IF NOT EXISTS meta_ctwa_clid VARCHAR(100),
            ADD COLUMN IF NOT EXISTS meta_headline TEXT,
            ADD COLUMN IF NOT EXISTS meta_body TEXT,
            ADD COLUMN IF NOT EXISTS meta_source_url TEXT,
            ADD COLUMN IF NOT EXISTS meta_media_type VARCHAR(20),
            ADD COLUMN IF NOT EXISTS meta_image_url TEXT,
            ADD COLUMN IF NOT EXISTS meta_referral_json JSONB;
    """)

    # -- 4. Índices de performance --
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_contatos_etapa_funil ON public.crm_whatsapp_contatos(etapa_funil);
        CREATE INDEX IF NOT EXISTS idx_contatos_responsavel ON public.crm_whatsapp_contatos(responsavel_id);
        CREATE INDEX IF NOT EXISTS idx_contatos_utm_source ON public.crm_whatsapp_contatos(utm_source);
        CREATE INDEX IF NOT EXISTS idx_contatos_campanha ON public.crm_whatsapp_contatos(campanha_origem);
        CREATE INDEX IF NOT EXISTS idx_contatos_primeira_conversa ON public.crm_whatsapp_contatos(primeira_conversa_at);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS idx_contatos_primeira_conversa;
        DROP INDEX IF EXISTS idx_contatos_campanha;
        DROP INDEX IF EXISTS idx_contatos_utm_source;
        DROP INDEX IF EXISTS idx_contatos_responsavel;
        DROP INDEX IF EXISTS idx_contatos_etapa_funil;

        ALTER TABLE public.crm_whatsapp_contatos
            DROP COLUMN IF EXISTS meta_referral_json,
            DROP COLUMN IF EXISTS meta_image_url,
            DROP COLUMN IF EXISTS meta_media_type,
            DROP COLUMN IF EXISTS meta_source_url,
            DROP COLUMN IF EXISTS meta_body,
            DROP COLUMN IF EXISTS meta_headline,
            DROP COLUMN IF EXISTS meta_ctwa_clid,
            DROP COLUMN IF EXISTS meta_ad_id,
            DROP COLUMN IF EXISTS utm_campaign,
            DROP COLUMN IF EXISTS utm_medium,
            DROP COLUMN IF EXISTS utm_source,
            DROP COLUMN IF EXISTS campanha_origem,
            DROP COLUMN IF EXISTS primeira_conversa_at,
            DROP COLUMN IF EXISTS facebook,
            DROP COLUMN IF EXISTS instagram,
            DROP COLUMN IF EXISTS notas,
            DROP COLUMN IF EXISTS equipe_id,
            DROP COLUMN IF EXISTS responsavel_id,
            DROP COLUMN IF EXISTS etapa_funil;
    """)
