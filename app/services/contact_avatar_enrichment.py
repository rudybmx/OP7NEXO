"""Jobs de enriquecimento de avatar de contatos e grupos via WAHA."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services import waha_service
from app.services.waha_service import WahaError

logger = logging.getLogger(__name__)

CONTACT_AVATAR_JOB_TYPE = "contact_avatar_enrichment"
GROUP_ENRICHMENT_JOB_TYPE = "group_enrichment"
AVATAR_TTL_DAYS = 7
WAHA_STORE_DISABLED_MSG = "Enable NOWEB store"


# ---------------------------------------------------------------------------
# Enqueue helpers
# ---------------------------------------------------------------------------


def enqueue_contact_avatar_enrichment(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    contact_id: str,
    jid: str,
    instance: str,
) -> bool:
    """Enfileira busca de avatar para um contato, com dedup e verificação de TTL.

    Não insere job se:
    - avatar_fetched_at já está dentro do TTL (7 dias), OU
    - já existe job pending/running para este contato.
    """
    if not (workspace_id and canal_id and contact_id and jid and instance):
        return False

    try:
        # Verificar TTL no contato antes de criar job
        row = db.execute(
            text("""
                SELECT avatar_fetched_at
                FROM public.crm_whatsapp_contatos
                WHERE id = CAST(:cid AS uuid)
                  AND workspace_id = CAST(:ws AS uuid)
            """),
            {"cid": contact_id, "ws": workspace_id},
        ).mappings().first()

        if row and row["avatar_fetched_at"] is not None:
            fetched = row["avatar_fetched_at"]
            if fetched.tzinfo is None:
                fetched = fetched.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - fetched) < timedelta(days=AVATAR_TTL_DAYS):
                return False  # Já tem avatar recente

        # Dedup: job pending/running recente para este contato
        existing = db.execute(
            text("""
                SELECT 1 FROM public.crm_message_jobs
                WHERE workspace_id = CAST(:ws AS uuid)
                  AND job_type = :job_type
                  AND status IN ('pending', 'running')
                  AND payload->>'contact_id' = :contact_id
                  AND created_at >= NOW() - INTERVAL '7 days'
                LIMIT 1
            """),
            {"ws": workspace_id, "job_type": CONTACT_AVATAR_JOB_TYPE, "contact_id": contact_id},
        ).fetchone()
        if existing:
            return False

        payload_json = json.dumps(
            {"contact_id": contact_id, "jid": jid, "instance": instance, "canal_id": canal_id},
            separators=(",", ":"),
        )
        db.execute(
            text("""
                INSERT INTO public.crm_message_jobs (
                    workspace_id, canal_id, raw_event_id, related_message_id,
                    job_type, status, priority, payload, created_at, updated_at, next_run_at
                ) VALUES (
                    CAST(:ws AS uuid), CAST(:canal AS uuid), NULL, NULL,
                    :job_type, 'pending', 1, CAST(:payload AS jsonb), NOW(), NOW(), NOW()
                )
            """),
            {
                "ws": workspace_id,
                "canal": canal_id,
                "job_type": CONTACT_AVATAR_JOB_TYPE,
                "payload": payload_json,
            },
        )
        return True
    except Exception:
        logger.exception(
            "[avatar-enqueue] falha ao enfileirar workspace=%s", str(workspace_id)[:8]
        )
        return False


def enqueue_group_enrichment(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    conversa_id: str,
    group_jid: str,
    instance: str,
) -> bool:
    """Enfileira busca de nome e avatar de grupo, com dedup e verificação de preenchimento."""
    if not (workspace_id and canal_id and conversa_id and group_jid and instance):
        return False

    try:
        # Não inserir job se group_name e group_avatar_url já estão preenchidos
        row = db.execute(
            text("""
                SELECT group_name, group_avatar_url
                FROM public.crm_whatsapp_conversas
                WHERE id = CAST(:conv_id AS uuid)
                  AND workspace_id = CAST(:ws AS uuid)
            """),
            {"conv_id": conversa_id, "ws": workspace_id},
        ).mappings().first()

        if row and row["group_name"] and row["group_avatar_url"]:
            return False  # Já enriquecido

        # Dedup: job pending/running recente para esta conversa
        existing = db.execute(
            text("""
                SELECT 1 FROM public.crm_message_jobs
                WHERE workspace_id = CAST(:ws AS uuid)
                  AND job_type = :job_type
                  AND status IN ('pending', 'running')
                  AND payload->>'conversa_id' = :conversa_id
                  AND created_at >= NOW() - INTERVAL '7 days'
                LIMIT 1
            """),
            {"ws": workspace_id, "job_type": GROUP_ENRICHMENT_JOB_TYPE, "conversa_id": conversa_id},
        ).fetchone()
        if existing:
            return False

        payload_json = json.dumps(
            {
                "conversa_id": conversa_id,
                "group_jid": group_jid,
                "instance": instance,
                "canal_id": canal_id,
            },
            separators=(",", ":"),
        )
        db.execute(
            text("""
                INSERT INTO public.crm_message_jobs (
                    workspace_id, canal_id, raw_event_id, related_message_id,
                    job_type, status, priority, payload, created_at, updated_at, next_run_at
                ) VALUES (
                    CAST(:ws AS uuid), CAST(:canal AS uuid), NULL, NULL,
                    :job_type, 'pending', 1, CAST(:payload AS jsonb), NOW(), NOW(), NOW()
                )
            """),
            {
                "ws": workspace_id,
                "canal": canal_id,
                "job_type": GROUP_ENRICHMENT_JOB_TYPE,
                "payload": payload_json,
            },
        )
        return True
    except Exception:
        logger.exception(
            "[group-enqueue] falha ao enfileirar workspace=%s", str(workspace_id)[:8]
        )
        return False


# ---------------------------------------------------------------------------
# Process helpers
# ---------------------------------------------------------------------------


def _jid_type(jid: str) -> str:
    if "@lid" in jid:
        return "lid"
    if "@g.us" in jid:
        return "group"
    return "individual"


def _load_canal_cfg(db: Session, *, workspace_id: str, canal_id: str) -> dict[str, Any] | None:
    """Retorna o sub-dict 'waha' do config do canal, que é o esperado por _headers() em waha_service."""
    row = db.execute(
        text("""
            SELECT config FROM public.canais_entrada
            WHERE id = CAST(:canal_id AS uuid)
              AND workspace_id = CAST(:ws AS uuid)
        """),
        {"canal_id": canal_id, "ws": workspace_id},
    ).mappings().first()
    if not row:
        return None
    full_cfg = row["config"] or {}
    return dict(full_cfg.get("waha", {}))


def process_contact_avatar_enrichment_job(db: Session, job: dict[str, Any]) -> dict[str, Any]:
    payload = job.get("job_payload") or job.get("payload") or {}
    workspace_id = str(job.get("workspace_id") or "")
    contact_id = str(payload.get("contact_id") or "")
    jid = str(payload.get("jid") or "")
    canal_id = str(payload.get("canal_id") or "")

    if not (workspace_id and contact_id and jid and canal_id):
        raise RuntimeError("Job contact_avatar_enrichment incompleto")

    jt = _jid_type(jid)

    # Verificar TTL: se já buscou recentemente, skip
    row = db.execute(
        text("""
            SELECT avatar_fetched_at FROM public.crm_whatsapp_contatos
            WHERE id = CAST(:cid AS uuid) AND workspace_id = CAST(:ws AS uuid)
        """),
        {"cid": contact_id, "ws": workspace_id},
    ).mappings().first()

    if row and row["avatar_fetched_at"] is not None:
        fetched = row["avatar_fetched_at"]
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - fetched) < timedelta(days=AVATAR_TTL_DAYS):
            return {"status": "skipped"}

    cfg = _load_canal_cfg(db, workspace_id=workspace_id, canal_id=canal_id)
    if cfg is None:
        raise RuntimeError(f"Canal não encontrado workspace={str(workspace_id)[:8]}")

    # Sessão WAHA vem do config do canal; payload['instance'] é fallback legado
    session = cfg.get("session") or str(payload.get("instance") or "")
    if not session:
        raise RuntimeError(f"Sessão WAHA não encontrada workspace={str(workspace_id)[:8]}")

    try:
        url = waha_service.buscar_avatar_chat(session, jid, cfg, timeout=5.0)
    except WahaError as exc:
        err_str = str(exc)
        if WAHA_STORE_DISABLED_MSG in err_str:
            # Falha permanente para @lid sem store — marcar fetched_at e não tentar mais
            logger.warning(
                "[avatar-enrich] store_disabled jid_type=%s session=%s workspace=%s",
                jt, session, str(workspace_id)[:8],
            )
            db.execute(
                text("""
                    UPDATE public.crm_whatsapp_contatos
                    SET avatar_fetched_at = NOW(), updated_at = NOW()
                    WHERE id = CAST(:cid AS uuid) AND workspace_id = CAST(:ws AS uuid)
                """),
                {"cid": contact_id, "ws": workspace_id},
            )
            db.commit()
            return {"status": "skipped"}

        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        logger.warning(
            "[avatar-enrich] falha jid_type=%s session=%s workspace=%s status=%s",
            jt, session, str(workspace_id)[:8],
            status_code or type(exc).__name__,
        )
        raise

    # Sucesso: url pode ser str (tem foto) ou None (sem foto)
    db.execute(
        text("""
            UPDATE public.crm_whatsapp_contatos
            SET avatar_url = COALESCE(:url, avatar_url),
                avatar_fetched_at = NOW(),
                updated_at = NOW()
            WHERE id = CAST(:cid AS uuid) AND workspace_id = CAST(:ws AS uuid)
        """),
        {"url": url, "cid": contact_id, "ws": workspace_id},
    )
    db.commit()
    return {"status": "done", "has_avatar": url is not None}


def process_group_enrichment_job(db: Session, job: dict[str, Any]) -> dict[str, Any]:
    payload = job.get("job_payload") or job.get("payload") or {}
    workspace_id = str(job.get("workspace_id") or "")
    conversa_id = str(payload.get("conversa_id") or "")
    group_jid = str(payload.get("group_jid") or "")
    canal_id = str(payload.get("canal_id") or "")

    if not (workspace_id and conversa_id and group_jid and canal_id):
        raise RuntimeError("Job group_enrichment incompleto")

    # Verificar se já está enriquecido
    row = db.execute(
        text("""
            SELECT group_name, group_avatar_url FROM public.crm_whatsapp_conversas
            WHERE id = CAST(:conv_id AS uuid) AND workspace_id = CAST(:ws AS uuid)
        """),
        {"conv_id": conversa_id, "ws": workspace_id},
    ).mappings().first()

    if row and row["group_name"] and row["group_avatar_url"]:
        return {"status": "skipped"}

    cfg = _load_canal_cfg(db, workspace_id=workspace_id, canal_id=canal_id)
    if cfg is None:
        raise RuntimeError(f"Canal não encontrado workspace={str(workspace_id)[:8]}")

    # Sessão WAHA vem do config do canal
    session = cfg.get("session") or str(payload.get("instance") or "")
    if not session:
        raise RuntimeError(f"Sessão WAHA não encontrada workspace={str(workspace_id)[:8]}")

    try:
        nome = waha_service.buscar_nome_grupo(session, group_jid, cfg, timeout=5.0)
        avatar_url = waha_service.buscar_avatar_chat(session, group_jid, cfg, timeout=5.0)
    except WahaError as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        logger.warning(
            "[group-enrich] falha session=%s workspace=%s status=%s",
            session, str(workspace_id)[:8],
            status_code or type(exc).__name__,
        )
        raise

    db.execute(
        text("""
            UPDATE public.crm_whatsapp_conversas
            SET group_name = COALESCE(:nome, group_name),
                group_avatar_url = COALESCE(:avatar, group_avatar_url),
                updated_at = NOW()
            WHERE id = CAST(:conv_id AS uuid) AND workspace_id = CAST(:ws AS uuid)
        """),
        {"nome": nome, "avatar": avatar_url, "conv_id": conversa_id, "ws": workspace_id},
    )
    db.commit()

    return {"status": "done", "group_name": nome, "has_avatar": avatar_url is not None}
