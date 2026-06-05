"""canal_id nullable em eventos, mensagens e conversas

Revision ID: 054
Revises: 053
Create Date: 2026-06-05
"""
from alembic import op

revision = "054"
down_revision = "053_meta_sync_log"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE crm_whatsapp_eventos ALTER COLUMN canal_id DROP NOT NULL")
    op.execute("ALTER TABLE crm_whatsapp_mensagens ALTER COLUMN canal_id DROP NOT NULL")
    op.execute("ALTER TABLE crm_whatsapp_conversas ALTER COLUMN canal_id DROP NOT NULL")


def downgrade():
    # Reconstrói a constraint apenas onde canal_id não é null
    op.execute("ALTER TABLE crm_whatsapp_eventos ALTER COLUMN canal_id SET NOT NULL")
    op.execute("ALTER TABLE crm_whatsapp_mensagens ALTER COLUMN canal_id SET NOT NULL")
    op.execute("ALTER TABLE crm_whatsapp_conversas ALTER COLUMN canal_id SET NOT NULL")
