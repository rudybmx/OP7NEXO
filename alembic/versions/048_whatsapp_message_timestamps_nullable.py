"""allow outbound whatsapp messages without recebida_em

Revision ID: 048_wa_msg_timestamps_nullable
Revises: 047_crm_wa_not_null
Create Date: 2026-06-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "048_wa_msg_timestamps_nullable"
down_revision: Union[str, None] = "047_crm_wa_not_null"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_mensagens
            ALTER COLUMN recebida_em DROP NOT NULL,
            ALTER COLUMN enviada_em DROP NOT NULL
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        UPDATE public.crm_whatsapp_mensagens
        SET recebida_em = COALESCE(recebida_em, enviada_em, created_at, NOW())
        WHERE recebida_em IS NULL
    """))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_mensagens
            ALTER COLUMN recebida_em SET NOT NULL
    """))
