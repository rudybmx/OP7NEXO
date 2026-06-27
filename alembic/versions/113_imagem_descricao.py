"""análise de imagem: crm_whatsapp_midia.descricao_status

Status do pipeline de análise de imagem (gpt-4o-mini) das imagens de WhatsApp. A
DESCRIÇÃO neutra da imagem vai em `crm_whatsapp_mensagens.conteudo` como `[imagem: ...]`
(substitui o placeholder "[mídia]") — aqui guardamos só o STATUS, que dirige o race-guard
do agente (não responder a uma imagem ainda não analisada). O AGENTE, pelo seu prompt,
decide responder sobre a imagem ou só reconhecer que recebeu.

Estados: pendente | processando | pronto | erro | nao_analisado (legado).
Imagens JÁ existentes no deploy → 'nao_analisado' (não há backfill). Boot-safe
(ADD COLUMN IF NOT EXISTS); aditivo. Paralela a `transcricao_status` (áudio, migration 108).

Revision ID: 113
Revises: 112
Create Date: 2026-06-27
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "113"
down_revision: Union[str, None] = "112"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE crm_whatsapp_midia ADD COLUMN IF NOT EXISTS "
        "descricao_status VARCHAR(20) NOT NULL DEFAULT 'pendente'"
    ))
    # Imagens já existentes não serão analisadas (sem backfill) → status terminal.
    op.execute(sa.text(
        "UPDATE crm_whatsapp_midia SET descricao_status = 'nao_analisado' "
        "WHERE tipo = 'image' AND descricao_status = 'pendente'"
    ))
    # Índice parcial p/ varrer imagens por status (backfill futuro / sweep).
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_crm_midia_image_descricao "
        "ON crm_whatsapp_midia (descricao_status) WHERE tipo = 'image'"
    ))
    # Idempotência do job de análise (1 por mensagem) — habilita o ON CONFLICT do enqueue.
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_job_image_analysis "
        "ON crm_message_jobs (related_message_id) "
        "WHERE related_message_id IS NOT NULL AND job_type = 'image_analysis'"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS uq_crm_job_image_analysis"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_crm_midia_image_descricao"))
    op.execute(sa.text(
        "ALTER TABLE crm_whatsapp_midia DROP COLUMN IF EXISTS descricao_status"
    ))
