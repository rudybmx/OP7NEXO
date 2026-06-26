"""Transcrição automática de áudio (speech-to-text) dos áudios de WhatsApp.

O job 'audio_transcription' (enfileirado em `whatsapp_media.register_media_record`
quando uma mídia de áudio fica 'ready' — cobre recebidos E enviados) re-baixa o
arquivo do MinIO, transcreve via `gpt-4o-transcribe` (feature 'audio' do `ai_config`
→ chave/base DEDICADA de imagem, OpenAI real) e grava:

- o TEXTO em `crm_whatsapp_mensagens.conteudo`, SUBSTITUINDO o placeholder "[mídia]"
  (mesmo guard de `whatsapp_crm_persistence` — nunca sobrescreve edição humana). Assim
  o agente, a análise e a busca passam a "ver" o áudio sem nenhum JOIN na hot-path.
- o STATUS em `crm_whatsapp_midia.transcricao_status` (dirige o chevron no front e o
  race-guard do `agent_service`: não responder a áudio ainda não transcrito).

Tolerante a falha: erro de API/download → status 'erro' só na última tentativa +
retry pelo worker (dead-letter = terminal). Áudio sem fala → 'sem_fala'. Idempotente
(status 'pronto' = no-op). NÃO acorda o agente: o job agente_reply (debounce) se
re-agenda sozinho enquanto o status for não-terminal.
"""
from __future__ import annotations

import logging
import re

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.ai_config import get_ai_config
from app.services.object_storage import get_object
from app.services.redis_pub import publish_whatsapp_event
from app.services.whatsapp_media import MEDIA_BUCKET

log = logging.getLogger(__name__)

_MARCADOR_RE = re.compile(r"\[[^\]]*\]")

# Extensão coerente com o mimetype REAL (o voice do WhatsApp chega ogg/opus e pode ter
# sido transcodado p/ audio/mp4 no armazenamento) — o endpoint de STT usa a extensão.
_EXT_POR_MIME = {
    "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/aac": "m4a", "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3", "audio/mp3": "mp3",
    "audio/ogg": "ogg", "audio/opus": "ogg", "audio/oga": "ogg",
    "audio/wav": "wav", "audio/x-wav": "wav",
    "audio/webm": "webm",
}


def _so_marcador(texto: str) -> bool:
    """gpt-4o-transcribe devolve só "[música]"/"[risos]"/"[inaudível]" para áudio sem
    fala — sem nada fora dos colchetes, tratamos como 'sem_fala'."""
    return not _MARCADOR_RE.sub("", texto).strip()


def _fname_para_stt(filename: str | None, mimetype: str | None) -> str:
    ext = _EXT_POR_MIME.get((mimetype or "").split(";", 1)[0].strip().lower(), "")
    return f"audio.{ext}" if ext else (filename or "audio.ogg")


def transcrever_audio(
    content: bytes, mimetype: str | None, filename: str | None
) -> tuple[str | None, str]:
    """Transcreve `content` (bytes do áudio) e retorna (texto, status).

    status ∈ {'pronto','sem_fala'}. **Levanta** exceção em falha de API/rede (o caller
    decide retry). Áudio vazio/sem fala → (None, 'sem_fala')."""
    if not content:
        return None, "sem_fala"
    cfg = get_ai_config("audio")
    from openai import OpenAI

    client = OpenAI(api_key=cfg.api_key, base_url=cfg.base_url)
    resp = client.audio.transcriptions.create(
        model=cfg.model,
        file=(_fname_para_stt(filename, mimetype), content, mimetype or "audio/ogg"),
        language="pt",
    )
    texto = (getattr(resp, "text", None) or "").strip()
    if not texto or _so_marcador(texto):
        return None, "sem_fala"
    return texto, "pronto"


def process_audio_transcription_job(db: Session, job: dict) -> None:
    """Entrada do worker para job_type='audio_transcription'."""
    payload = job.get("payload") if isinstance(job.get("payload"), dict) else {}
    mensagem_id = str(job.get("related_message_id") or payload.get("mensagem_id") or "")
    if not mensagem_id:
        return

    midia = db.execute(
        text("""
            SELECT id, conversa_id, workspace_id, minio_path, mimetype, filename, transcricao_status
            FROM public.crm_whatsapp_midia
            WHERE mensagem_id = CAST(:m AS uuid) AND tipo = 'audio' AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 1
        """),
        {"m": mensagem_id},
    ).mappings().first()
    if not midia:
        return  # sem mídia de áudio associada → nada a transcrever
    if midia["transcricao_status"] == "pronto":
        return  # idempotente

    minio_path = payload.get("minio_path") or midia["minio_path"]
    if not minio_path:
        return
    mimetype = payload.get("mimetype") or midia["mimetype"] or "audio/ogg"
    filename = midia["filename"] or "audio.ogg"
    conversa_id = str(midia["conversa_id"]) if midia["conversa_id"] else ""
    workspace_id = str(midia["workspace_id"]) if midia["workspace_id"] else ""

    # Atualiza o status em TODAS as linhas de mídia de áudio da mensagem. Outbound gera 2
    # linhas (envio + echo do webhook) e o front lê via _dedup_midias a MAIS ANTIGA — por id
    # único o status iria na linha errada e o chevron ficaria preso em "Transcrevendo…".
    db.execute(
        text("UPDATE public.crm_whatsapp_midia SET transcricao_status='processando', "
             "updated_at=NOW() WHERE mensagem_id=CAST(:m AS uuid) AND tipo='audio'"),
        {"m": mensagem_id},
    )
    db.commit()

    try:
        resp = get_object(MEDIA_BUCKET, minio_path)
        try:
            content = resp.read()
        finally:
            resp.close()
            resp.release_conn()
        texto, status = transcrever_audio(content, mimetype, filename)
    except Exception as exc:  # noqa: BLE001 — falha de download/STT → retry pelo worker
        attempts = int(job.get("attempts") or 0)
        max_attempts = int(job.get("max_attempts") or 5)
        if attempts >= max_attempts:  # esgotou → status terminal libera o race-guard
            db.execute(
                text("UPDATE public.crm_whatsapp_midia SET transcricao_status='erro', "
                     "updated_at=NOW() WHERE mensagem_id=CAST(:m AS uuid) AND tipo='audio'"),
                {"m": mensagem_id},
            )
            db.commit()
        log.warning("[transcricao] falhou msg=%s tentativa=%s/%s: %s",
                    mensagem_id, attempts, max_attempts, exc)
        raise  # worker re-agenda (backoff) ou manda p/ dead_letter

    if status == "pronto" and texto:
        # Substitui o placeholder "[mídia]" pela transcrição — mesmo guard de
        # whatsapp_crm_persistence (NUNCA sobrescreve um conteudo já editado por humano).
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_mensagens
                SET conteudo = CASE
                        WHEN COALESCE(conteudo, '') IN ('', '[mídia]') THEN :t
                        ELSE conteudo
                    END,
                    updated_at = NOW()
                WHERE id = CAST(:m AS uuid)
            """),
            {"t": texto, "m": mensagem_id},
        )
    db.execute(
        text("UPDATE public.crm_whatsapp_midia SET transcricao_status=:s, "
             "updated_at=NOW() WHERE mensagem_id=CAST(:m AS uuid) AND tipo='audio'"),
        {"s": status, "m": mensagem_id},
    )
    db.commit()
    log.info("[transcricao] msg=%s status=%s chars=%s", mensagem_id, status, len(texto or ""))

    # Refresh do front (chevron 'transcrevendo'→'pronto' + conteudo). Reusa o evento de
    # mídia pronta, que o front já trata revalidando as mensagens da conversa.
    if conversa_id:
        try:
            publish_whatsapp_event({
                "type": "message.media.ready",
                "workspaceId": workspace_id,
                "conversaId": conversa_id,
                "mensagemId": mensagem_id,
            })
        except Exception as exc:  # noqa: BLE001 — publish é best-effort
            log.info("[transcricao] publish refresh falhou conversa=%s: %s", conversa_id, exc)
