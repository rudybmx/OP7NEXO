"""fix contatos unique constraint per workspace (multi-tenancy)

Revision ID: 027_fix_contatos_unique_workspace
Revises: 026_link_click_anuncios
Create Date: 2026-05-14
"""
from alembic import op

revision = '027_contatos_ws_unique'
down_revision = '026_link_click_anuncios'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$
        DECLARE
            c TEXT;
        BEGIN
            -- Encontra e remove constraint UNIQUE(jid) de coluna única
            SELECT conname INTO c
            FROM pg_constraint
            WHERE conrelid = 'public.crm_whatsapp_contatos'::regclass
              AND contype = 'u'
              AND array_length(conkey, 1) = 1
              AND conkey[1] = (
                SELECT attnum FROM pg_attribute
                WHERE attrelid = 'public.crm_whatsapp_contatos'::regclass
                  AND attname = 'jid'
              );
            IF c IS NOT NULL THEN
                EXECUTE 'ALTER TABLE public.crm_whatsapp_contatos DROP CONSTRAINT ' || quote_ident(c);
            END IF;
        END $$;

        -- Remove duplicatas por (workspace_id, jid) mantendo o registro mais recente
        DELETE FROM public.crm_whatsapp_contatos a
        USING public.crm_whatsapp_contatos b
        WHERE a.id > b.id
          AND a.jid = b.jid
          AND a.workspace_id = b.workspace_id;

        -- Adiciona constraint composta (isolamento multi-tenant correto)
        ALTER TABLE public.crm_whatsapp_contatos
            ADD CONSTRAINT crm_whatsapp_contatos_workspace_jid_unique
            UNIQUE (workspace_id, jid);
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE public.crm_whatsapp_contatos
            DROP CONSTRAINT IF EXISTS crm_whatsapp_contatos_workspace_jid_unique;

        ALTER TABLE public.crm_whatsapp_contatos
            ADD CONSTRAINT crm_whatsapp_contatos_jid_unique UNIQUE (jid);
    """)
