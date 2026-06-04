"""normalize contato.nome when stored as formatted phone instead of raw digits

Revision ID: 049_fix_contato_nome_fmt
Revises: 048_wa_msg_timestamps_nullable
Create Date: 2026-06-04
"""
from typing import Sequence, Union

from alembic import op


revision: str = "049_fix_contato_nome_fmt"
down_revision: Union[str, None] = "048_wa_msg_timestamps_nullable"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Contatos que já têm push_name: usa push_name como nome definitivo
    op.execute("""
        UPDATE public.crm_whatsapp_contatos
        SET nome = push_name, updated_at = NOW()
        WHERE push_name IS NOT NULL
          AND push_name != ''
          AND (
              nome IS NULL
              OR REGEXP_REPLACE(nome, '[^0-9]', '', 'g') = REGEXP_REPLACE(telefone, '[^0-9]', '', 'g')
          )
    """)
    # Contatos sem push_name com nome formatado: normaliza para dígitos puros
    # para que o próximo inbound com push_name acione a condição nome = telefone
    op.execute("""
        UPDATE public.crm_whatsapp_contatos
        SET nome = telefone, updated_at = NOW()
        WHERE (push_name IS NULL OR push_name = '')
          AND telefone IS NOT NULL
          AND nome IS NOT NULL
          AND nome != telefone
          AND REGEXP_REPLACE(nome, '[^0-9]', '', 'g') = REGEXP_REPLACE(telefone, '[^0-9]', '', 'g')
    """)


def downgrade() -> None:
    pass
