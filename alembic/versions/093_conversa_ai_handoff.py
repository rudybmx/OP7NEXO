"""ai_handoff_motivo + ai_handoff_at em crm_whatsapp_conversas — marcação de falha do agente

Quando o agente faz handoff (escala p/ humano sem responder), registra o motivo
(limite_tokens/baixa_confianca/erro_llm/fora_horario/config/envio_falhou) e quando,
para o front exibir um selo na conversa. Limpo no sucesso da resposta.

Revision ID: 093
Revises: 092
Create Date: 2026-06-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision = "093"
down_revision = "092"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas ADD COLUMN IF NOT EXISTS ai_handoff_motivo VARCHAR(40)"))
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas ADD COLUMN IF NOT EXISTS ai_handoff_at TIMESTAMPTZ"))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas DROP COLUMN IF EXISTS ai_handoff_at"))
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas DROP COLUMN IF EXISTS ai_handoff_motivo"))
