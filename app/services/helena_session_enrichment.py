from __future__ import annotations

import json
import logging
from contextlib import nullcontext
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.helena_chat import HelenaChatError, get_helena_session_by_id

logger = logging.getLogger(__name__)

HELENA_SESSION_ENRICHMENT_JOB_TYPE = "helena_session_enrichment"
HELENA_SESSION_ENRICHMENT_DUPE_WINDOW_MINUTES = 30
HELENA_ACTIVE_STATUSES = {"STARTED", "PENDING", "IN_PROGRESS"}
HELENA_CLOSED_STATUSES = {"COMPLETED", "HIDDEN"}


def enqueue_helena_session_enrichment(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    session_id: str,
    conversation_id: str,
    contact_id: str,
    source_event_id: str,
    provider_message_id: str,
    occurred_at: str,
    provider: str = "crm_externo_zapi",
) -> bool:
    session_id_clean = _clean_text(session_id)
    conversation_id_clean = _clean_text(conversation_id)
    contact_id_clean = _clean_text(contact_id)
    source_event_id_clean = _clean_text(source_event_id)
    provider_message_id_clean = _clean_text(provider_message_id)
    if not (
        session_id_clean
        and conversation_id_clean
        and contact_id_clean
        and source_event_id_clean
        and provider_message_id_clean
    ):
        return False

    payload = {
        "session_id": session_id_clean,
        "provider": provider,
        "conversation_id": conversation_id_clean,
        "contact_id": contact_id_clean,
        "source_event_id": source_event_id_clean,
        "provider_message_id": provider_message_id_clean,
        "occurred_at": occurred_at,
    }
    payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)

    nested_tx = db.begin_nested() if hasattr(db, "begin_nested") else nullcontext()
    try:
        with nested_tx:
            existing = db.execute(
                text(f"""
                    SELECT id
                    FROM public.crm_message_jobs
                    WHERE workspace_id = CAST(:workspace_id AS uuid)
                      AND canal_id = CAST(:canal_id AS uuid)
                      AND job_type = :job_type
                      AND status IN ('pending', 'running', 'error')
                      AND payload->>'session_id' = :session_id
                      AND updated_at >= NOW() - INTERVAL '{HELENA_SESSION_ENRICHMENT_DUPE_WINDOW_MINUTES} minutes'
                    ORDER BY updated_at DESC
                    LIMIT 1
                """),
                {
                    "workspace_id": workspace_id,
                    "canal_id": canal_id,
                    "job_type": HELENA_SESSION_ENRICHMENT_JOB_TYPE,
                    "session_id": session_id_clean,
                },
            ).fetchone()
            if existing:
                logger.info(
                    "[helena-session-enrichment] duplicate skipped workspace=%s canal=%s session=%s",
                    workspace_id,
                    canal_id,
                    session_id_clean,
                )
                return False

            db.execute(
                text("""
                    INSERT INTO public.crm_message_jobs (
                        workspace_id, canal_id, raw_event_id, related_message_id,
                        job_type, status, priority, payload, created_at, updated_at, next_run_at
                    )
                    VALUES (
                        CAST(:workspace_id AS uuid), CAST(:canal_id AS uuid), NULL, NULL,
                        :job_type, 'pending', :priority, CAST(:payload AS jsonb), NOW(), NOW(), NOW()
                    )
                """),
                {
                    "workspace_id": workspace_id,
                    "canal_id": canal_id,
                    "job_type": HELENA_SESSION_ENRICHMENT_JOB_TYPE,
                    "priority": 4,
                    "payload": payload_json,
                },
            )
        return True
    except Exception:
        logger.exception(
            "[helena-session-enrichment] falha ao enfileirar workspace=%s canal=%s session=%s",
            workspace_id,
            canal_id,
            session_id_clean,
        )
        return False


def process_helena_session_enrichment_job(db: Session, job: dict[str, Any]) -> dict[str, Any]:
    payload = job.get("job_payload")
    if not isinstance(payload, dict) or not payload:
        payload = job.get("payload") if isinstance(job.get("payload"), dict) else {}

    workspace_id = _clean_text(job.get("workspace_id"))
    canal_id = _clean_text(job.get("canal_id"))
    session_id = _clean_text(payload.get("session_id"))
    conversation_id = _clean_text(payload.get("conversation_id"))
    contact_id = _clean_text(payload.get("contact_id"))

    if not (workspace_id and canal_id and session_id and conversation_id and contact_id):
        raise RuntimeError("Job de enriquecimento Helena incompleto")

    canal_row = _load_canal_row(db, workspace_id=workspace_id, canal_id=canal_id)
    if not canal_row:
        raise RuntimeError("Canal não encontrado para enriquecimento Helena")

    conversation_row = _load_conversation_row(
        db,
        workspace_id=workspace_id,
        canal_id=canal_id,
        conversation_id=conversation_id,
    )
    if not conversation_row:
        raise RuntimeError("Conversa não encontrada para enriquecimento Helena")
    if _clean_text(conversation_row.get("contato_id")) != contact_id:
        raise RuntimeError("Conversa não corresponde ao contato informado no job")

    contact_row = _load_contact_row(
        db,
        workspace_id=workspace_id,
        contact_id=contact_id,
    )
    if not contact_row:
        raise RuntimeError("Contato não encontrado para enriquecimento Helena")

    try:
        session_payload = get_helena_session_by_id(canal_row["config"] or {}, session_id, timeout=8.0)
    except HelenaChatError as exc:
        if exc.status_code == 404:
            logger.info(
                "[helena-session-enrichment] session_id=%s canal=%s not_found=true",
                session_id,
                canal_id,
            )
            return {
                "status": "skipped",
                "workspace_id": workspace_id,
                "canal_id": canal_id,
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "session_id": session_id,
            }
        raise

    snapshot = _build_helena_session_snapshot(session_payload, session_id=session_id)
    _apply_contact_enrichment(
        db,
        contact_id=contact_id,
        snapshot=snapshot,
    )
    _apply_conversation_enrichment(
        db,
        workspace_id=workspace_id,
        canal_id=canal_id,
        conversation_id=conversation_id,
        snapshot=snapshot,
    )
    db.commit()

    return {
        "status": "done",
        "workspace_id": workspace_id,
        "canal_id": canal_id,
        "conversation_id": conversation_id,
        "contact_id": contact_id,
        "session_id": session_id,
        "snapshot": snapshot,
    }


def _load_canal_row(db: Session, *, workspace_id: str, canal_id: str) -> dict[str, Any] | None:
    row = db.execute(
        text("""
            SELECT id, workspace_id, tipo, nome, config, status, numero_telefone, conectado_em,
                   evolution_instance_id, connection_status
            FROM public.canais_entrada
            WHERE id = CAST(:canal_id AS uuid)
              AND workspace_id = CAST(:workspace_id AS uuid)
            LIMIT 1
        """),
        {"workspace_id": workspace_id, "canal_id": canal_id},
    ).mappings().first()
    return dict(row) if row else None


def _load_conversation_row(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    conversation_id: str,
) -> dict[str, Any] | None:
    row = db.execute(
        text("""
            SELECT id, contato_id, workspace_id, canal_id, status, ultima_mensagem, ultima_msg_at,
                   last_inbound_at, last_outbound_at, nao_lidas
            FROM public.crm_whatsapp_conversas
            WHERE id = CAST(:conversation_id AS uuid)
              AND workspace_id = CAST(:workspace_id AS uuid)
              AND canal_id = CAST(:canal_id AS uuid)
            LIMIT 1
        """),
        {
            "workspace_id": workspace_id,
            "canal_id": canal_id,
            "conversation_id": conversation_id,
        },
    ).mappings().first()
    return dict(row) if row else None


def _load_contact_row(
    db: Session,
    *,
    workspace_id: str,
    contact_id: str,
) -> dict[str, Any] | None:
    row = db.execute(
        text("""
            SELECT id, workspace_id, nome, telefone, avatar_url, avatar_fetched_at, last_message_at,
                   perfil_json, updated_at
            FROM public.crm_whatsapp_contatos
            WHERE id = CAST(:contact_id AS uuid)
              AND workspace_id = CAST(:workspace_id AS uuid)
            LIMIT 1
        """),
        {
            "workspace_id": workspace_id,
            "contact_id": contact_id,
        },
    ).mappings().first()
    return dict(row) if row else None


def _apply_contact_enrichment(
    db: Session,
    *,
    contact_id: str,
    snapshot: dict[str, Any],
) -> None:
    contact = snapshot.get("contact") if isinstance(snapshot.get("contact"), dict) else {}
    last_activity_at = snapshot.get("last_interaction_at") or snapshot.get("last_message_in_at") or snapshot.get("last_message_out_at")
    avatar_url = _clean_text(contact.get("avatar_url"))
    name = _clean_text(contact.get("name"))
    phone = _normalize_phone(contact.get("phone"))
    metadata_snapshot = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"), default=str)

    db.execute(
        text("""
            UPDATE public.crm_whatsapp_contatos
            SET nome = COALESCE(:nome, nome),
                telefone = COALESCE(:telefone, telefone),
                avatar_url = COALESCE(:avatar_url, avatar_url),
                avatar_fetched_at = CASE
                    WHEN :avatar_url IS NOT NULL
                         AND (avatar_url IS DISTINCT FROM :avatar_url OR avatar_fetched_at IS NULL)
                        THEN NOW()
                    ELSE avatar_fetched_at
                END,
                last_message_at = COALESCE(:last_message_at, last_message_at),
                perfil_json = jsonb_set(
                    COALESCE(perfil_json, '{}'::jsonb),
                    '{metadata}',
                    COALESCE(perfil_json->'metadata', '{}'::jsonb) || jsonb_build_object('helena_session', CAST(:snapshot AS jsonb)),
                    true
                ),
                updated_at = NOW()
            WHERE id = CAST(:contact_id AS uuid)
        """),
        {
            "contact_id": contact_id,
            "nome": name,
            "telefone": phone,
            "avatar_url": avatar_url,
            "last_message_at": _coerce_datetime(last_activity_at),
            "snapshot": metadata_snapshot,
        },
    )


def _apply_conversation_enrichment(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    conversation_id: str,
    snapshot: dict[str, Any],
) -> None:
    conversation = snapshot.get("conversation") if isinstance(snapshot.get("conversation"), dict) else {}
    status_value = _map_helena_session_status(snapshot.get("status"))
    unread_count = _coerce_int(snapshot.get("unread_count"))
    last_message_text = _clean_text(conversation.get("last_message_text"))
    last_interaction_at = _coerce_datetime(snapshot.get("last_interaction_at"))
    last_message_in_at = _coerce_datetime(snapshot.get("last_message_in_at"))
    last_message_out_at = _coerce_datetime(snapshot.get("last_message_out_at"))
    if last_interaction_at is None:
        last_interaction_at = last_message_in_at or last_message_out_at

    db.execute(
        text("""
            UPDATE public.crm_whatsapp_conversas
            SET ultima_mensagem = COALESCE(:ultima_mensagem, ultima_mensagem),
                ultima_msg_at = COALESCE(:ultima_msg_at, ultima_msg_at),
                last_inbound_at = COALESCE(:last_inbound_at, last_inbound_at),
                last_outbound_at = COALESCE(:last_outbound_at, last_outbound_at),
                nao_lidas = COALESCE(:nao_lidas, nao_lidas),
                status = COALESCE(:status, status),
                updated_at = NOW()
            WHERE id = CAST(:conversation_id AS uuid)
              AND workspace_id = CAST(:workspace_id AS uuid)
              AND canal_id = CAST(:canal_id AS uuid)
        """),
        {
            "workspace_id": workspace_id,
            "canal_id": canal_id,
            "conversation_id": conversation_id,
            "ultima_mensagem": last_message_text,
            "ultima_msg_at": last_interaction_at,
            "last_inbound_at": last_message_in_at,
            "last_outbound_at": last_message_out_at,
            "nao_lidas": unread_count,
            "status": status_value,
        },
    )


def _build_helena_session_snapshot(payload: dict[str, Any], *, session_id: str) -> dict[str, Any]:
    contact = {
        "name": _first_non_empty(
            payload,
            (
                ("contactDetails", "name"),
                ("contactDetails", "displayName"),
                ("contact", "name"),
                ("contact", "displayName"),
                ("contact", "fullName"),
                ("response", "contactDetails", "name"),
                ("response", "contact", "name"),
                ("data", "contactDetails", "name"),
                ("data", "contact", "name"),
                ("session", "contactDetails", "name"),
                ("session", "contact", "name"),
                ("name",),
                ("displayName",),
            ),
        ),
        "phone": _normalize_phone(
            _first_non_empty(
                payload,
                (
                    ("contactDetails", "phonenumber"),
                    ("contactDetails", "phoneNumber"),
                    ("contactDetails", "phone"),
                    ("contact", "phonenumber"),
                    ("contact", "phoneNumber"),
                    ("contact", "phone"),
                    ("response", "contactDetails", "phonenumber"),
                    ("response", "contact", "phone"),
                    ("data", "contactDetails", "phonenumber"),
                    ("data", "contact", "phone"),
                    ("session", "contactDetails", "phonenumber"),
                    ("session", "contact", "phone"),
                    ("phonenumber",),
                    ("phoneNumber",),
                    ("phone",),
                    ("telephone",),
                ),
            ),
        ),
        "avatar_url": _clean_text(
            _first_non_empty(
                payload,
                (
                    ("contactDetails", "pictureUrl"),
                    ("contactDetails", "avatarUrl"),
                    ("contactDetails", "avatar"),
                    ("contact", "pictureUrl"),
                    ("contact", "avatarUrl"),
                    ("contact", "avatar"),
                    ("response", "contactDetails", "pictureUrl"),
                    ("response", "contact", "pictureUrl"),
                    ("data", "contactDetails", "pictureUrl"),
                    ("data", "contact", "pictureUrl"),
                    ("session", "contactDetails", "pictureUrl"),
                    ("session", "contact", "pictureUrl"),
                    ("pictureUrl",),
                    ("avatarUrl",),
                    ("avatar",),
                ),
            )
        ),
    }

    conversation_last_message_text = _clean_text(
        _first_non_empty(
            payload,
            (
                ("lastMessageText",),
                ("conversation", "lastMessageText"),
                ("conversation", "lastMessage", "text"),
                ("session", "lastMessageText"),
                ("session", "conversation", "lastMessageText"),
                ("response", "lastMessageText"),
                ("data", "lastMessageText"),
                ("latestMessage", "text"),
                ("lastMessage", "text"),
            ),
        )
    )

    status = _clean_text(
        _first_non_empty(
            payload,
            (
                ("status",),
                ("sessionStatus",),
                ("conversation", "status"),
                ("classificationDetails", "status"),
                ("classification", "status"),
                ("response", "status"),
                ("data", "status"),
            ),
        )
    )

    last_interaction_at = _coerce_datetime(
        _first_non_empty(
            payload,
            (
                ("lastInteractionDate",),
                ("conversation", "lastInteractionDate"),
                ("session", "lastInteractionDate"),
                ("conversation", "updatedAt"),
                ("updatedAt",),
                ("lastUpdatedAt",),
                ("lastActivityAt",),
                ("response", "lastInteractionDate"),
                ("data", "lastInteractionDate"),
            ),
        )
    )

    last_message_in_at = _coerce_datetime(
        _first_non_empty(
            payload,
            (
                ("lastMessageIn",),
                ("conversation", "lastMessageIn"),
                ("session", "lastMessageIn"),
                ("response", "lastMessageIn"),
                ("data", "lastMessageIn"),
            ),
        )
    )
    last_message_out_at = _coerce_datetime(
        _first_non_empty(
            payload,
            (
                ("lastMessageOut",),
                ("conversation", "lastMessageOut"),
                ("session", "lastMessageOut"),
                ("response", "lastMessageOut"),
                ("data", "lastMessageOut"),
            ),
        )
    )
    unread_count = _coerce_int(
        _first_non_empty(
            payload,
            (
                ("unreadCount",),
                ("conversation", "unreadCount"),
                ("session", "unreadCount"),
                ("response", "unreadCount"),
                ("data", "unreadCount"),
            ),
        )
    )

    snapshot: dict[str, Any] = {
        "session_id": session_id,
        "status": status,
        "contact": contact,
        "conversation": {
            "last_message_text": conversation_last_message_text,
        },
        "last_interaction_at": last_interaction_at.isoformat() if last_interaction_at else None,
        "last_message_in_at": last_message_in_at.isoformat() if last_message_in_at else None,
        "last_message_out_at": last_message_out_at.isoformat() if last_message_out_at else None,
        "unread_count": unread_count,
    }

    if not snapshot["status"]:
        snapshot.pop("status", None)
    if not any(contact.values()):
        snapshot.pop("contact", None)
    if not any(snapshot["conversation"].values()):
        snapshot.pop("conversation", None)
    if snapshot.get("last_interaction_at") is None:
        snapshot.pop("last_interaction_at", None)
    if snapshot.get("last_message_in_at") is None:
        snapshot.pop("last_message_in_at", None)
    if snapshot.get("last_message_out_at") is None:
        snapshot.pop("last_message_out_at", None)
    if snapshot.get("unread_count") is None:
        snapshot.pop("unread_count", None)

    return snapshot


def _map_helena_session_status(raw_status: Any) -> str | None:
    if raw_status is None:
        return None
    status_raw = str(raw_status).strip().upper()
    if not status_raw:
        return None
    if status_raw in HELENA_ACTIVE_STATUSES:
        return "em_atendimento"
    if status_raw in HELENA_CLOSED_STATUSES:
        return "resolvido"
    return None


def _first_non_empty(payload: Any, paths: tuple[tuple[str, ...], ...]) -> Any:
    for path in paths:
        value = _get_path(payload, path)
        if _has_value(value):
            return value
    return None


def _get_path(payload: Any, path: tuple[str, ...]) -> Any:
    current = payload
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set, dict)):
        return bool(value)
    return True


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text_value = str(value).strip()
    return text_value or None


def _normalize_phone(value: Any) -> str | None:
    if value is None:
        return None
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    return digits or None


def _coerce_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, (int, float)):
        dt = datetime.fromtimestamp(float(value), tz=timezone.utc)
    else:
        text_value = str(value).strip()
        if not text_value:
            return None
        normalized = text_value.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(normalized)
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None
