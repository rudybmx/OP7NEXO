"""Análise/descrição de imagem recebida (visão), para o agente entender imagens.

O job 'image_analysis' (enfileirado em `whatsapp_media.register_media_record` quando
uma mídia de imagem fica 'ready') re-baixa o arquivo do MinIO, gera uma DESCRIÇÃO NEUTRA
via `gpt-4o-mini` (feature 'agent_image' do `ai_config` → chave/base DEDICADA de imagem,
OpenAI real; `detail:low`) e grava:

- a descrição em `crm_whatsapp_mensagens.conteudo` como `"[imagem: <descrição>]"`,
  SUBSTITUINDO o placeholder "[mídia]" (mesmo guard — nunca sobrescreve caption do cliente
  nem edição humana). Assim o AGENTE "vê" a imagem sem JOIN e, pelo seu prompt, decide
  responder sobre ela ou só reconhecer que recebeu (a relevância é do agente, não da visão).
- o STATUS em `crm_whatsapp_midia.descricao_status` (race-guard do `agent_service`).

A descrição é role-agnostic (serve a busca/operador e funciona até sem agente no canal).
Tolerante a falha: erro de API/download → status 'erro' só na última tentativa (+ conteudo
"[imagem]" genérico p/ o agente ao menos reconhecer) + retry. Idempotente ('pronto' = no-op).
O front NÃO exibe a descrição (só bastidores) — suprime o marcador "[imagem: ...]".
"""
from __future__ import annotations

import base64
import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.ai_config import get_ai_config
from app.services.object_storage import get_object
from app.services.redis_pub import publish_whatsapp_event
from app.services.whatsapp_media import MEDIA_BUCKET

log = logging.getLogger(__name__)

_PROMPT = (
    "Descreva objetivamente, em 1 ou 2 frases curtas e em português do Brasil, o que esta "
    "imagem mostra (assunto principal, tipo de imagem e qualquer texto visível relevante). "
    "Seja factual: não interprete intenções, não opine e não invente nada que não esteja visível."
)
_MAX_DESC_CHARS = 600

# Grava a descrição no conteudo SEM perder o que o cliente escreveu:
# - vazio / "[mídia]"            → só o marcador "[imagem: ...]";
# - já contém "[imagem"          → idempotente (não duplica em reprocesso);
# - caption real do cliente      → CONCATENA "caption [imagem: ...]" (o agente vê foto + texto;
#                                  o front remove o marcador e mostra só o caption).
# (LIKE '%[imagem%' — no Postgres o '[' é literal em LIKE.)
_SQL_SET_CONTEUDO = """
    UPDATE public.crm_whatsapp_mensagens
    SET conteudo = CASE
            WHEN COALESCE(conteudo, '') IN ('', '[mídia]') THEN :t
            WHEN conteudo LIKE '%[imagem%' THEN conteudo
            ELSE conteudo || ' ' || :t
        END,
        updated_at = NOW()
    WHERE id = CAST(:m AS uuid)
"""


def descrever_imagem(content: bytes, mimetype: str | None) -> tuple[str | None, str]:
    """Descreve `content` (bytes da imagem) e retorna (descricao, status).

    status ∈ {'pronto','erro'}. **Levanta** exceção em falha de API/rede (o caller decide
    retry); só retorna ('','erro') para resposta vazia do modelo."""
    if not content:
        return None, "erro"
    cfg = get_ai_config("agent_image")
    from openai import OpenAI

    client = OpenAI(api_key=cfg.api_key, base_url=cfg.base_url)
    b64 = base64.b64encode(content).decode()
    mime = (mimetype or "image/jpeg").split(";", 1)[0].strip() or "image/jpeg"
    resp = client.chat.completions.create(
        model=cfg.model,
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": _PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "low"}},
            ],
        }],
    )
    desc = (resp.choices[0].message.content or "").strip()
    if not desc:
        return None, "erro"
    return desc[:_MAX_DESC_CHARS], "pronto"


def process_image_analysis_job(db: Session, job: dict) -> None:
    """Entrada do worker para job_type='image_analysis'."""
    payload = job.get("payload") if isinstance(job.get("payload"), dict) else {}
    mensagem_id = str(job.get("related_message_id") or payload.get("mensagem_id") or "")
    if not mensagem_id:
        return

    midia = db.execute(
        text("""
            SELECT id, conversa_id, workspace_id, minio_path, mimetype, descricao_status
            FROM public.crm_whatsapp_midia
            WHERE mensagem_id = CAST(:m AS uuid) AND tipo = 'image' AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 1
        """),
        {"m": mensagem_id},
    ).mappings().first()
    if not midia:
        return  # sem mídia de imagem associada → nada a descrever
    if midia["descricao_status"] == "pronto":
        return  # idempotente

    minio_path = payload.get("minio_path") or midia["minio_path"]
    if not minio_path:
        return
    mimetype = payload.get("mimetype") or midia["mimetype"] or "image/jpeg"
    conversa_id = str(midia["conversa_id"]) if midia["conversa_id"] else ""
    workspace_id = str(midia["workspace_id"]) if midia["workspace_id"] else ""

    # Status em TODAS as linhas de mídia de imagem da mensagem (outbound pode ter 2 — envio +
    # echo do webhook — igual à lição do áudio).
    db.execute(
        text("UPDATE public.crm_whatsapp_midia SET descricao_status='processando', "
             "updated_at=NOW() WHERE mensagem_id=CAST(:m AS uuid) AND tipo='image'"),
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
        descricao, status = descrever_imagem(content, mimetype)
    except Exception as exc:  # noqa: BLE001 — falha de download/visão → retry pelo worker
        attempts = int(job.get("attempts") or 0)
        max_attempts = int(job.get("max_attempts") or 5)
        if attempts >= max_attempts:  # esgotou → status terminal + conteudo genérico
            db.execute(
                text("UPDATE public.crm_whatsapp_midia SET descricao_status='erro', "
                     "updated_at=NOW() WHERE mensagem_id=CAST(:m AS uuid) AND tipo='image'"),
                {"m": mensagem_id},
            )
            db.execute(text(_SQL_SET_CONTEUDO), {"t": "[imagem]", "m": mensagem_id})
            db.commit()
        log.warning("[img-desc] falhou msg=%s tentativa=%s/%s: %s",
                    mensagem_id, attempts, max_attempts, exc)
        raise  # worker re-agenda (backoff) ou manda p/ dead_letter

    # Conteudo: descrição marcada se pronto; genérico "[imagem]" se a visão veio vazia.
    novo_conteudo = f"[imagem: {descricao}]" if (status == "pronto" and descricao) else "[imagem]"
    db.execute(text(_SQL_SET_CONTEUDO), {"t": novo_conteudo, "m": mensagem_id})
    db.execute(
        text("UPDATE public.crm_whatsapp_midia SET descricao_status=:s, "
             "updated_at=NOW() WHERE mensagem_id=CAST(:m AS uuid) AND tipo='image'"),
        {"s": status, "m": mensagem_id},
    )
    db.commit()
    log.info("[img-desc] msg=%s status=%s chars=%s", mensagem_id, status, len(descricao or ""))

    # Refresh do front (revalida as mensagens da conversa). Reusa o evento de mídia pronta.
    if conversa_id:
        try:
            publish_whatsapp_event({
                "type": "message.media.ready",
                "workspaceId": workspace_id,
                "conversaId": conversa_id,
                "mensagemId": mensagem_id,
            })
        except Exception as exc:  # noqa: BLE001 — publish é best-effort
            log.info("[img-desc] publish refresh falhou conversa=%s: %s", conversa_id, exc)
