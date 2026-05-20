"""add canal_id to crm_whatsapp_conversas

Revision ID: 032_add_canal_id_conversas
Revises: 031_crm_schema_evolution
Create Date: 2026-05-15
"""
from alembic import op

revision = '032_add_canal_id_conversas'
down_revision = '031_crm_schema_evolution'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE public.crm_whatsapp_conversas
            ADD COLUMN IF NOT EXISTS canal_id UUID REFERENCES public.canais_entrada(id) ON DELETE SET NULL;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE public.crm_whatsapp_conversas
            DROP COLUMN IF EXISTS canal_id;
    """)
