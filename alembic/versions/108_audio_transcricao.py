"""transcrição de áudio: crm_whatsapp_midia.transcricao_status

Status do pipeline de transcrição automática (gpt-4o-transcribe) dos áudios de
WhatsApp. O TEXTO da transcrição vai em `crm_whatsapp_mensagens.conteudo` (substitui
o placeholder "[mídia]") — aqui guardamos só o STATUS, que dirige o chevron no front e
o race-guard do agente (não responder a um áudio ainda não transcrito).

Estados: pendente | processando | pronto | sem_fala | erro | nao_transcrito (legado).
Áudios JÁ existentes no deploy → 'nao_transcrito' (não há backfill; o front não exibe
"transcrevendo…" eternamente neles). Boot-safe (ADD COLUMN IF NOT EXISTS); aditivo.

Revision ID: 108
Revises: 107
Create Date: 2026-06-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "108"
down_revision: Union[str, None] = "107"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE crm_whatsapp_midia ADD COLUMN IF NOT EXISTS "
        "transcricao_status VARCHAR(20) NOT NULL DEFAULT 'pendente'"
    ))
    # Áudios já existentes não serão transcritos (sem backfill) → status terminal
    # 'nao_transcrito' p/ o front não mostrar "transcrevendo…" para sempre neles.
    op.execute(sa.text(
        "UPDATE crm_whatsapp_midia SET transcricao_status = 'nao_transcrito' "
        "WHERE tipo = 'audio' AND transcricao_status = 'pendente'"
    ))
    # Índice parcial p/ varrer áudios por status (backfill futuro / sweep).
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_crm_midia_audio_transcricao "
        "ON crm_whatsapp_midia (transcricao_status) WHERE tipo = 'audio'"
    ))
    # Idempotência do job de transcrição (1 por mensagem) — habilita o ON CONFLICT do
    # enfileiramento, espelhando o índice do job 'media_download'.
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_job_audio_transcription "
        "ON crm_message_jobs (related_message_id) "
        "WHERE related_message_id IS NOT NULL AND job_type = 'audio_transcription'"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS uq_crm_job_audio_transcription"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_crm_midia_audio_transcricao"))
    op.execute(sa.text(
        "ALTER TABLE crm_whatsapp_midia DROP COLUMN IF EXISTS transcricao_status"
    ))
