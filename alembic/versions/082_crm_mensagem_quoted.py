"""CRM: colunas de resposta/citação (quoted reply) em crm_whatsapp_mensagens

Adiciona quoted_message_id, quoted_remote_jid, quoted_message_type, quoted_text
para renderizar mensagens citadas (reply) no chat. Extraídas do contextInfo
pelo normalizer.

Revision ID: 082
Revises: 074
Create Date: 2026-06-22
"""
from alembic import op
import sqlalchemy as sa

# Numeração: 075-081 estão reservadas pela branch não-mergeada
# agent/crm-atendimento-port — pulamos para 082 e evitamos colisão.
revision = "082"
down_revision = "074"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("crm_whatsapp_mensagens", sa.Column("quoted_message_id", sa.String(255), nullable=True))
    op.add_column("crm_whatsapp_mensagens", sa.Column("quoted_remote_jid", sa.String(64), nullable=True))
    op.add_column("crm_whatsapp_mensagens", sa.Column("quoted_message_type", sa.String(50), nullable=True))
    op.add_column("crm_whatsapp_mensagens", sa.Column("quoted_text", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("crm_whatsapp_mensagens", "quoted_text")
    op.drop_column("crm_whatsapp_mensagens", "quoted_message_type")
    op.drop_column("crm_whatsapp_mensagens", "quoted_remote_jid")
    op.drop_column("crm_whatsapp_mensagens", "quoted_message_id")
