from __future__ import annotations

import hashlib
import json
import logging
import re
import unicodedata
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.canal_entrada import CanalEntrada
from app.services.webhook_api_ingestion import (
    WebhookAPIError,
    WebhookIngestionResult,
    _build_contact_jid,
    _canonical_json,
    _insert_message,
    _insert_raw_event,
    _load_idempotent_result,
    _normalize_phone,
    _parse_iso_datetime,
    _record_lead_origin_event,
    _upsert_contact,
    _upsert_conversation,
)

logger = logging.getLogger(__name__)

HELENA_PROVIDER = "helena"
HELENA_PROVIDER_LABEL = "Helena CRM"

HELENA_MESSAGE_EVENT_TYPES = {
    "MESSAGE_RECEIVED",
    "MESSAGE_SENT",
    "MESSAGE_UPDATED",
}

HELENA_CONTACT_EVENT_TYPES = {
    "CONTACT_CREATE",
    "CONTACT_CREATED",
    "CONTACT_UPDATE",
    "CONTACT_TAG_CHANGED",
    "ATTENDANCE_CREATED",
    "ATTENDANCE_UPDATED",
    "ATTENDANCE_CLOSED",
    "CONVERSATION_CREATED",
    "CONVERSATION_UPDATED",
}

HELENA_TEMPLATE_EVENT_TYPES = {
    "TEMPLATE_NEW",
    "TEMPLATE_UPDATE",
}

HELENA_KNOWN_EVENT_TYPES = HELENA_MESSAGE_EVENT_TYPES | HELENA_CONTACT_EVENT_TYPES | HELENA_TEMPLATE_EVENT_TYPES

HELENA_EVENT_ALIASES = {
    "ATENDIMENTO_CRIADO": "ATTENDANCE_CREATED",
    "ATENDIMENTO_ALTERADO": "ATTENDANCE_UPDATED",
    "ATENDIMENTO_CONCLUIDO": "ATTENDANCE_CLOSED",
    "MENSAGEM_RECEBIDA": "MESSAGE_RECEIVED",
    "MENSAGEM_ENVIADA": "MESSAGE_SENT",
    "MENSAGEM_ATUALIZADA": "MESSAGE_UPDATED",
    "CONTATO_CRIADO": "CONTACT_CREATE",
    "CONTATO_CREATE": "CONTACT_CREATE",
    "CONTATO_UPDATE": "CONTACT_UPDATE",
    "CONTATO_ALTERADO": "CONTACT_UPDATE",
    "CONTATO_ETIQUETA_ALTERADA": "CONTACT_TAG_CHANGED",
    "CONVERSA_CRIADA": "CONVERSATION_CREATED",
    "CONVERSA_ALTERADA": "CONVERSATION_UPDATED",
}


def process_helena_webhook_ingestion(
    db: Session,
    canal: CanalEntrada,
    raw_body: bytes,
) -> WebhookIngestionResult:
    try:
        payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
    except Exception as exc:  # pragma: no cover - malformed body branch
        raise WebhookAPIError(
            400,
            "webhook_payload_invalid",
            "Payload JSON inválido",
        ) from exc

    envelope = _normalize_envelope(payload)
    event_type = envelope["type"]
    contact_identity = _build_primary_identity(canal, envelope["contact"])
    contact_jid = _build_contact_jid(canal, contact_identity) if contact_identity else None
    event_hash = _build_event_hash(event_type, envelope["content"])
    received_at = envelope["occurred_at"]
    instance = f"helena:{_uuid_curto(canal.id)}"

    raw_event_id, inserted_event = _insert_raw_event(
        db,
        canal=canal,
        instance=instance,
        contato_jid=contact_jid,
        envelope=envelope,
        event_hash=event_hash,
    )

    if not inserted_event:
        duplicate = _load_idempotent_result(db, event_hash)
        if duplicate is None:
            duplicate = {"raw_event_id": _load_raw_event_id(db, event_hash)}
        logger.info("[webhook-helena] canal=%s event_type=%s idempotent=true", canal.id, event_type)
        db.commit()
        return WebhookIngestionResult(
            received=True,
            status="duplicate",
            idempotent=True,
            event_id=str(duplicate["raw_event_id"]) if duplicate.get("raw_event_id") else "",
            contato_id=str(duplicate["contato_id"]) if duplicate.get("contato_id") else None,
            conversa_id=str(duplicate["conversa_id"]) if duplicate.get("conversa_id") else None,
            mensagem_id=str(duplicate["mensagem_id"]) if duplicate.get("mensagem_id") else None,
        )

    if event_type not in HELENA_KNOWN_EVENT_TYPES:
        db.commit()
        logger.info("[webhook-helena] canal=%s event_type=%s ignored=true", canal.id, event_type)
        return WebhookIngestionResult(
            received=True,
            status="ignored",
            idempotent=False,
            event_id=str(raw_event_id) if raw_event_id else event_hash,
            contato_id=None,
            conversa_id=None,
            mensagem_id=None,
        )

    if contact_identity is None:
        db.commit()
        logger.info("[webhook-helena] canal=%s event_type=%s ignored=true no_identity", canal.id, event_type)
        return WebhookIngestionResult(
            received=True,
            status="ignored",
            idempotent=False,
            event_id=str(raw_event_id) if raw_event_id else event_hash,
            contato_id=None,
            conversa_id=None,
            mensagem_id=None,
        )

    existing_message = _load_existing_message(db, canal, instance=instance, remote_jid=contact_jid)
    message_text = envelope["message"].get("text")
    should_create_message = bool(message_text) or event_type in HELENA_MESSAGE_EVENT_TYPES or (
        event_type in HELENA_CONTACT_EVENT_TYPES and not existing_message
    )

    contact_id = _upsert_contact(
        db,
        canal=canal,
        instance=instance,
        contato_jid=contact_jid,
        contact_identity=contact_identity,
        envelope=envelope,
        received_at=received_at,
    )

    conversation_id: str | None = None
    message_id: str | None = None
    if should_create_message:
        conversation_id = _upsert_conversation(
            db,
            canal=canal,
            instance=instance,
            contato_id=str(contact_id),
            contato_jid=contact_jid,
            envelope=envelope,
            received_at=received_at,
        )
        message_id = _insert_message(
            db,
            canal=canal,
            raw_event_id=str(raw_event_id),
            contato_id=str(contact_id),
            conversa_id=str(conversation_id),
            instance=instance,
            contato_jid=contact_jid,
            envelope=envelope,
            event_hash=event_hash,
            received_at=received_at,
        )
    else:
        conversation_id = _load_existing_conversation_id(db, canal, instance=instance, remote_jid=contact_jid)

    origin_event_id = _record_lead_origin_event(
        db,
        canal=canal,
        raw_event_id=str(raw_event_id),
        contato_id=str(contact_id),
        conversa_id=conversation_id,
        mensagem_id=str(message_id) if message_id else None,
        envelope=envelope,
    )
    if origin_event_id:
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_contatos
                SET last_origin_event_id = :origin_event_id,
                    updated_at = NOW()
                WHERE id = CAST(:contato_id AS uuid)
            """),
            {"origin_event_id": origin_event_id, "contato_id": str(contact_id)},
        )

    db.commit()
    logger.info(
        "[webhook-helena] canal=%s event_type=%s idempotent=false synthetic=%s",
        canal.id,
        event_type,
        bool(message_id) and not bool(message_text),
    )
    return WebhookIngestionResult(
        received=True,
        status="processed",
        idempotent=False,
        event_id=str(raw_event_id) if raw_event_id else event_hash,
        contato_id=str(contact_id),
        conversa_id=str(conversation_id) if conversation_id else None,
        mensagem_id=str(message_id) if message_id else None,
    )


def _normalize_envelope(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise WebhookAPIError(400, "webhook_payload_invalid", "Payload JSON inválido")

    event_type_raw = payload.get("eventType")
    if event_type_raw is None or not str(event_type_raw).strip():
        raise WebhookAPIError(400, "webhook_payload_invalid", "Campo 'eventType' é obrigatório")
    event_type = _normalize_event_type(str(event_type_raw))

    occurred_at_raw = payload.get("date")
    if occurred_at_raw is None or not str(occurred_at_raw).strip():
        raise WebhookAPIError(400, "webhook_payload_invalid", "Campo 'date' é obrigatório")
    occurred_at = _parse_iso_datetime(str(occurred_at_raw))

    content = payload.get("content")
    if not isinstance(content, dict):
        raise WebhookAPIError(400, "webhook_payload_invalid", "Campo 'content' é obrigatório")

    contact_identity = _build_primary_identity(None, content, include_display_name=True)
    display_name = _build_display_name(content)
    text_value = _extract_text(content)
    utm = _extract_utm(content.get("utm"))
    raw_provider_metadata = content.get("metadata")
    tags = content.get("tags") if isinstance(content.get("tags"), list) else []
    tags_id = content.get("tagsId") if isinstance(content.get("tagsId"), list) else []
    custom_fields = content.get("customFieldValues") if isinstance(content.get("customFieldValues"), dict) else {}
    origin = content.get("origin")
    provider_company_id = content.get("companyId")

    envelope = {
        "type": event_type,
        "event_id": None,
        "occurred_at": occurred_at,
        "content": content,
        "contact": {
            "external_id": content.get("id"),
            "name": display_name,
            "phone": _normalize_phone(content.get("phonenumber") or content.get("phone")),
            "email": _clean_str(content.get("email")),
        },
        "lead": {
            "name": display_name,
            "status": _clean_str(content.get("status")),
            "source": _clean_str(origin) or HELENA_PROVIDER,
            "origin": _clean_str(origin),
            "campaign": _extract_campaign(utm, content),
        },
        "message": {
            "text": text_value,
        },
        "metadata": {
            "provider": HELENA_PROVIDER,
            "provider_label": HELENA_PROVIDER_LABEL,
            "provider_event_type": str(event_type_raw).strip(),
            "provider_company_id": _clean_str(provider_company_id),
            "provider_identity": contact_identity,
            "tags": tags,
            "tags_id": tags_id,
            "custom_field_values": custom_fields,
            "raw_provider_metadata": raw_provider_metadata,
            "utm": utm,
            "utm_source": utm.get("source") if isinstance(utm, dict) else None,
            "utm_medium": utm.get("medium") if isinstance(utm, dict) else None,
            "utm_campaign": utm.get("campaign") if isinstance(utm, dict) else None,
            "raw_provider_payload": payload,
        },
    }
    return envelope


def _normalize_event_type(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.upper().strip()
    normalized = re.sub(r"[^A-Z0-9]+", "_", normalized).strip("_")
    return HELENA_EVENT_ALIASES.get(normalized, normalized)


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _build_primary_identity(
    canal: CanalEntrada | None,
    content: dict[str, Any],
    *,
    include_display_name: bool = False,
) -> dict[str, Any] | None:
    identity: dict[str, Any] = {}
    external_id = _clean_str(content.get("id"))
    phone = _normalize_phone(content.get("phonenumber") or content.get("phone"))
    email = _clean_str(content.get("email"))

    if external_id:
        identity["external_id"] = external_id
    elif phone:
        identity["phone"] = phone
    elif email:
        identity["email"] = email.lower()
    else:
        return None

    if canal is not None:
        identity["channel_id"] = str(canal.id)
        identity["workspace_id"] = str(canal.workspace_id)
    if include_display_name:
        display_name = _build_display_name(content)
        if display_name:
            identity["name"] = display_name
    return identity


def _build_display_name(content: dict[str, Any]) -> str | None:
    for key in ("name", "email", "phonenumberFormatted", "phonenumber", "id"):
        value = _clean_str(content.get(key))
        if value:
            return value
    return None


def _extract_text(content: dict[str, Any]) -> str | None:
    candidates = (
        "text",
        "message",
        "body",
        "messageText",
        "caption",
        "description",
        "content",
        "note",
    )
    for key in candidates:
        value = content.get(key)
        text = _search_text(value)
        if text:
            return text
    return None


def _search_text(value: Any) -> str | None:
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    if isinstance(value, dict):
        for key in ("text", "body", "message", "messageText", "caption", "content", "value"):
            candidate = _search_text(value.get(key))
            if candidate:
                return candidate
        for child in value.values():
            candidate = _search_text(child)
            if candidate:
                return candidate
    elif isinstance(value, list):
        for item in value:
            candidate = _search_text(item)
            if candidate:
                return candidate
    return None


def _extract_utm(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return {
        "source": _clean_str(value.get("source") or value.get("utm_source")),
        "medium": _clean_str(value.get("medium") or value.get("utm_medium")),
        "campaign": _clean_str(value.get("campaign") or value.get("utm_campaign")),
        "content": _clean_str(value.get("content") or value.get("utm_content")),
        "term": _clean_str(value.get("term") or value.get("utm_term")),
    }


def _build_event_hash(event_type: str, content: dict[str, Any]) -> str:
    canonical = {
        "provider": HELENA_PROVIDER,
        "event_type": event_type,
        "content": content,
    }
    return hashlib.sha256(_canonical_json(canonical).encode("utf-8")).hexdigest()


def _load_existing_message(db: Session, canal: CanalEntrada, *, instance: str, remote_jid: str | None) -> bool:
    if not remote_jid:
        return False
    row = db.execute(
        text("""
            SELECT id
            FROM public.crm_whatsapp_mensagens
            WHERE workspace_id = CAST(:workspace_id AS uuid)
              AND canal_id = CAST(:canal_id AS uuid)
              AND instance = :instance
              AND remote_jid = :remote_jid
            LIMIT 1
        """),
        {
            "workspace_id": str(canal.workspace_id),
            "canal_id": str(canal.id),
            "instance": instance,
            "remote_jid": remote_jid,
        },
    ).fetchone()
    return bool(row)


def _load_existing_conversation_id(db: Session, canal: CanalEntrada, *, instance: str, remote_jid: str | None) -> str | None:
    if not remote_jid:
        return None
    row = db.execute(
        text("""
            SELECT id
            FROM public.crm_whatsapp_conversas
            WHERE workspace_id = CAST(:workspace_id AS uuid)
              AND canal_id = CAST(:canal_id AS uuid)
              AND instance = :instance
              AND remote_jid = :remote_jid
              AND ativo = true
            ORDER BY updated_at DESC
            LIMIT 1
        """),
        {
            "workspace_id": str(canal.workspace_id),
            "canal_id": str(canal.id),
            "instance": instance,
            "remote_jid": remote_jid,
        },
    ).fetchone()
    return str(row[0]) if row else None


def _load_raw_event_id(db: Session, event_hash: str) -> str | None:
    row = db.execute(
        text("""
            SELECT id
            FROM public.crm_whatsapp_eventos
            WHERE event_hash = :event_hash
            LIMIT 1
        """),
        {"event_hash": event_hash},
    ).fetchone()
    return str(row[0]) if row else None


def _uuid_curto(value: Any) -> str:
    return _build_uuid_short(value)


def _build_uuid_short(value: Any) -> str:
    import uuid as _uuid

    return _uuid.UUID(str(value)).hex[:8]


def _extract_campaign(utm: dict[str, Any], content: dict[str, Any]) -> str | None:
    return utm.get("campaign") or _clean_str(content.get("campaign"))
