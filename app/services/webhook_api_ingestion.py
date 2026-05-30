from __future__ import annotations

import copy
import hashlib
import hmac
import json
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.canal_entrada import CanalEntrada

logger = logging.getLogger(__name__)

MAX_WEBHOOK_PAYLOAD_BYTES = 1_048_576
REPLAY_WINDOW_SECONDS = 300
WEBHOOK_INSTANCE_PREFIX = "webhook"
CRM_EXTERNO_ZAPI_PROVIDER = "crm_externo_zapi"
CRM_EXTERNO_ZAPI_PROVIDER_LABEL = "CRM externo/Z-API"


class WebhookAPIError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message

    def to_http_exception(self) -> HTTPException:
        return HTTPException(
            status_code=self.status_code,
            detail={"code": self.code, "message": self.message},
        )


@dataclass(slots=True)
class WebhookIngestionResult:
    received: bool
    status: Literal["processed", "duplicate", "ignored"]
    idempotent: bool
    event_id: str
    contato_id: str | None
    conversa_id: str | None
    mensagem_id: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "recebido": self.received,
            "status": self.status,
            "idempotent": self.idempotent,
            "event_id": self.event_id,
            "contato_id": self.contato_id,
            "conversa_id": self.conversa_id,
            "mensagem_id": self.mensagem_id,
        }


def webhook_secret_from_config(config: dict[str, Any] | None) -> str | None:
    webhook = (config or {}).get("webhook")
    if not isinstance(webhook, dict):
        return None
    secret = webhook.get("hmac_secret")
    if secret is None:
        return None
    secret_str = str(secret).strip()
    return secret_str or None


def webhook_provider_from_config(config: dict[str, Any] | None) -> str:
    webhook = (config or {}).get("webhook")
    if not isinstance(webhook, dict):
        return "generic"
    provider = webhook.get("provider")
    provider_str = str(provider).strip().lower() if provider is not None else ""
    return provider_str or "generic"


def webhook_security_mode_from_config(config: dict[str, Any] | None) -> str:
    webhook = (config or {}).get("webhook")
    if not isinstance(webhook, dict):
        return ""
    security_mode = webhook.get("security_mode")
    security_mode_str = str(security_mode).strip().lower() if security_mode is not None else ""
    return security_mode_str


def sanitize_webhook_config(config: dict[str, Any] | None) -> dict[str, Any]:
    sanitized = copy.deepcopy(config or {})
    webhook = sanitized.get("webhook")
    if isinstance(webhook, dict):
        _redact_webhook_tokens(webhook)
        webhook.pop("hmac_secret", None)
        sanitized["webhook"] = webhook
    return sanitized


def prepare_webhook_config(
    incoming_config: dict[str, Any] | None,
    *,
    existing_config: dict[str, Any] | None = None,
    generate_secret: bool = False,
    force_new_secret: bool = False,
) -> tuple[dict[str, Any], str | None, bool]:
    config = copy.deepcopy(incoming_config or {})
    webhook = dict(config.get("webhook") or {})
    _redact_webhook_tokens(webhook)
    existing_secret = webhook_secret_from_config(existing_config)
    provider = webhook_provider_from_config(config)
    if provider == "generic" and existing_config is not None:
        existing_provider = webhook_provider_from_config(existing_config)
        if existing_provider != "generic":
            provider = existing_provider
    generated = False
    secret_to_return: str | None = None

    if provider == "helena":
        webhook.pop("hmac_secret", None)
        webhook["provider"] = "helena"
        webhook.setdefault("security_mode", "provider_token")
    elif provider == CRM_EXTERNO_ZAPI_PROVIDER:
        webhook.pop("hmac_secret", None)
        webhook["provider"] = CRM_EXTERNO_ZAPI_PROVIDER
        webhook.setdefault("security_mode", "provider_token")
    elif force_new_secret:
        secret_to_return = secrets.token_hex(32)
        webhook["hmac_secret"] = secret_to_return
        generated = True
    elif existing_secret:
        webhook["hmac_secret"] = existing_secret
    elif generate_secret:
        secret_to_return = secrets.token_hex(32)
        webhook["hmac_secret"] = secret_to_return
        generated = True
    else:
        webhook.pop("hmac_secret", None)

    config["webhook"] = webhook
    return config, secret_to_return, generated


def _redact_webhook_tokens(webhook: dict[str, Any]) -> None:
    for key in ("api_token", "bearer_token", "access_token"):
        webhook.pop(key, None)
    helena = webhook.get("helena")
    if isinstance(helena, dict):
        for key in ("api_token", "bearer_token", "access_token"):
            helena.pop(key, None)
        webhook["helena"] = helena


def process_webhook_api_ingestion(
    db: Session,
    canal: CanalEntrada,
    raw_body: bytes,
    *,
    timestamp_header: str | None,
    signature_header: str | None,
) -> WebhookIngestionResult:
    if len(raw_body) > MAX_WEBHOOK_PAYLOAD_BYTES:
        raise WebhookAPIError(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "webhook_payload_too_large",
            "Payload excede 1 MB",
        )

    provider = webhook_provider_from_config(canal.config)
    if provider == "helena":
        from app.services.webhook_helena import process_helena_webhook_ingestion

        return process_helena_webhook_ingestion(db, canal, raw_body)
    if provider == CRM_EXTERNO_ZAPI_PROVIDER:
        return process_crm_externo_zapi_webhook(db, canal, raw_body)

    secret = webhook_secret_from_config(canal.config)
    if not secret:
        raise WebhookAPIError(
            status.HTTP_403_FORBIDDEN,
            "webhook_secret_missing",
            "Canal webhook sem segredo configurado",
        )

    timestamp_raw = _parse_timestamp_header(timestamp_header)
    _validate_replay_window(timestamp_raw)
    _validate_signature(secret, timestamp_raw, raw_body, signature_header)

    try:
        payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
    except Exception as exc:  # pragma: no cover - malformed body branch
        raise WebhookAPIError(
            status.HTTP_400_BAD_REQUEST,
            "webhook_payload_invalid",
            "Payload JSON inválido",
        ) from exc

    envelope = _normalize_envelope(payload)
    event_hash = _build_event_hash(canal, envelope)
    instance = f"{WEBHOOK_INSTANCE_PREFIX}:{_uuid_curto(canal.id)}"
    contact_identity = _build_contact_identity(canal, envelope)
    contato_jid = _build_contact_jid(canal, contact_identity)
    received_at = envelope["occurred_at"]
    raw_event_id, inserted_event = _insert_raw_event(
        db,
        canal=canal,
        instance=instance,
        contato_jid=contato_jid,
        envelope=envelope,
        event_hash=event_hash,
    )

    if not inserted_event:
        duplicate = _load_idempotent_result(db, event_hash)
        if duplicate is None:
            raise RuntimeError("Evento duplicado não encontrado após conflito de hash")
        logger.info(
            "[webhook-api] canal=%s event_type=%s idempotent=true",
            canal.id,
            envelope["type"],
        )
        db.commit()
        return WebhookIngestionResult(
            received=True,
            status="duplicate",
            idempotent=True,
            event_id=str(duplicate["raw_event_id"]),
            contato_id=str(duplicate["contato_id"]),
            conversa_id=str(duplicate["conversa_id"]),
            mensagem_id=str(duplicate["mensagem_id"]) if duplicate.get("mensagem_id") else None,
        )

    contato_id = _upsert_contact(
        db,
        canal=canal,
        instance=instance,
        contato_jid=contato_jid,
        contact_identity=contact_identity,
        envelope=envelope,
        received_at=received_at,
    )
    conversa_id = _upsert_conversation(
        db,
        canal=canal,
        instance=instance,
        contato_id=str(contato_id),
        contato_jid=contato_jid,
        envelope=envelope,
        received_at=received_at,
    )
    mensagem_id = _insert_message(
        db,
        canal=canal,
        raw_event_id=raw_event_id,
        contato_id=str(contato_id),
        conversa_id=str(conversa_id),
        instance=instance,
        contato_jid=contato_jid,
        envelope=envelope,
        event_hash=event_hash,
        received_at=received_at,
    )
    origin_event_id = _record_lead_origin_event(
        db,
        canal=canal,
        raw_event_id=raw_event_id,
        contato_id=str(contato_id),
        conversa_id=str(conversa_id),
        mensagem_id=str(mensagem_id) if mensagem_id else None,
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
            {"origin_event_id": origin_event_id, "contato_id": str(contato_id)},
        )

    db.commit()
    logger.info(
        "[webhook-api] canal=%s event_type=%s idempotent=false",
        canal.id,
        envelope["type"],
    )
    return WebhookIngestionResult(
        received=True,
        status="processed",
        idempotent=False,
        event_id=str(raw_event_id),
        contato_id=str(contato_id),
        conversa_id=str(conversa_id),
        mensagem_id=str(mensagem_id) if mensagem_id else None,
    )


def process_crm_externo_zapi_webhook(
    db: Session,
    canal: CanalEntrada,
    raw_body: bytes,
) -> WebhookIngestionResult:
    try:
        payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
    except Exception as exc:  # pragma: no cover - malformed body branch
        raise WebhookAPIError(
            status.HTTP_400_BAD_REQUEST,
            "webhook_payload_invalid",
            "Payload JSON inválido",
        ) from exc

    envelope = _normalize_envelope(payload)
    contact = envelope["contact"]
    has_identifiable_contact = bool(
        _normalize_phone(contact.get("phone"))
        or str(contact.get("external_id") or "").strip()
    )
    if not has_identifiable_contact:
        raise WebhookAPIError(
            status.HTTP_400_BAD_REQUEST,
            "webhook_payload_invalid",
            "Campo 'contact' deve conter ao menos 'phone' ou 'external_id'",
        )

    event_hash = _build_event_hash(canal, envelope)
    instance = f"{WEBHOOK_INSTANCE_PREFIX}:{_uuid_curto(canal.id)}"
    contact_identity = _build_contact_identity(
        canal,
        envelope,
        allow_name_only=False,
        allow_fallback=False,
    )
    contato_jid = _build_contact_jid(canal, contact_identity)
    received_at = envelope["occurred_at"]
    raw_event_id, inserted_event = _insert_raw_event(
        db,
        canal=canal,
        instance=instance,
        contato_jid=contato_jid,
        envelope=envelope,
        event_hash=event_hash,
    )

    if not inserted_event:
        duplicate = _load_idempotent_result(db, event_hash)
        if duplicate is None:
            raise RuntimeError("Evento duplicado não encontrado após conflito de hash")
        logger.info(
            "[webhook-crm-externo] canal=%s event_type=%s idempotent=true",
            canal.id,
            envelope["type"],
        )
        db.commit()
        return WebhookIngestionResult(
            received=True,
            status="duplicate",
            idempotent=True,
            event_id=str(duplicate["raw_event_id"]),
            contato_id=str(duplicate["contato_id"]),
            conversa_id=str(duplicate["conversa_id"]),
            mensagem_id=str(duplicate["mensagem_id"]) if duplicate.get("mensagem_id") else None,
        )

    contato_id = _upsert_contact(
        db,
        canal=canal,
        instance=instance,
        contato_jid=contato_jid,
        contact_identity=contact_identity,
        envelope=envelope,
        received_at=received_at,
    )
    message_text = envelope["message"].get("text") if isinstance(envelope["message"], dict) else None
    has_message_text = bool(message_text is not None and str(message_text).strip())
    existing_message_id = _load_existing_message_id(
        db,
        canal,
        instance=instance,
        remote_jid=contato_jid,
    )
    nao_lidas = 1 if has_message_text or existing_message_id is None else 0
    conversa_id = _upsert_conversation(
        db,
        canal=canal,
        instance=instance,
        contato_id=str(contato_id),
        contato_jid=contato_jid,
        envelope=envelope,
        received_at=received_at,
        nao_lidas=nao_lidas,
    )
    mensagem_id: str | None = None
    if has_message_text or existing_message_id is None:
        mensagem_id = _insert_message(
            db,
            canal=canal,
            raw_event_id=raw_event_id,
            contato_id=str(contato_id),
            conversa_id=str(conversa_id),
            instance=instance,
            contato_jid=contato_jid,
            envelope=envelope,
            event_hash=event_hash,
            received_at=received_at,
        )
    else:
        mensagem_id = existing_message_id

    origin_event_id = _record_lead_origin_event(
        db,
        canal=canal,
        raw_event_id=raw_event_id,
        contato_id=str(contato_id),
        conversa_id=str(conversa_id),
        mensagem_id=str(mensagem_id) if mensagem_id else None,
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
            {"origin_event_id": origin_event_id, "contato_id": str(contato_id)},
        )

    db.commit()
    synthetic_created = not has_message_text and existing_message_id is None
    logger.info(
        "[webhook-crm-externo] canal=%s event_type=%s idempotent=false synthetic=%s",
        canal.id,
        envelope["type"],
        synthetic_created,
    )
    return WebhookIngestionResult(
        received=True,
        status="processed",
        idempotent=False,
        event_id=str(raw_event_id) if raw_event_id else event_hash,
        contato_id=str(contato_id),
        conversa_id=str(conversa_id),
        mensagem_id=str(mensagem_id) if mensagem_id else None,
    )


def _parse_timestamp_header(timestamp_header: str | None) -> str:
    if timestamp_header is None:
        raise WebhookAPIError(
            status.HTTP_403_FORBIDDEN,
            "webhook_timestamp_invalid",
            "Timestamp ausente",
        )

    timestamp_raw = str(timestamp_header).strip()
    if not timestamp_raw:
        raise WebhookAPIError(
            status.HTTP_403_FORBIDDEN,
            "webhook_timestamp_invalid",
            "Timestamp ausente",
        )

    try:
        int(timestamp_raw)
    except ValueError as exc:
        raise WebhookAPIError(
            status.HTTP_403_FORBIDDEN,
            "webhook_timestamp_invalid",
            "Timestamp inválido",
        ) from exc

    return timestamp_raw


def _validate_replay_window(timestamp_raw: str) -> None:
    timestamp_dt = datetime.fromtimestamp(int(timestamp_raw), tz=timezone.utc)
    now = datetime.now(timezone.utc)
    delta = abs((now - timestamp_dt).total_seconds())
    if delta > REPLAY_WINDOW_SECONDS:
        raise WebhookAPIError(
            status.HTTP_403_FORBIDDEN,
            "webhook_timestamp_out_of_range",
            "Timestamp fora da janela permitida",
        )


def _validate_signature(secret: str, timestamp_raw: str, raw_body: bytes, signature_header: str | None) -> None:
    if signature_header is None:
        raise WebhookAPIError(
            status.HTTP_403_FORBIDDEN,
            "webhook_signature_invalid",
            "Assinatura inválida",
        )

    signature = str(signature_header).strip().lower()
    if not signature:
        raise WebhookAPIError(
            status.HTTP_403_FORBIDDEN,
            "webhook_signature_invalid",
            "Assinatura inválida",
        )

    message = timestamp_raw.encode("utf-8") + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise WebhookAPIError(
            status.HTTP_403_FORBIDDEN,
            "webhook_signature_invalid",
            "Assinatura inválida",
        )


def _normalize_envelope(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise WebhookAPIError(
            status.HTTP_400_BAD_REQUEST,
            "webhook_payload_invalid",
            "Payload JSON inválido",
        )

    event_type = str(payload.get("type") or "").strip()
    if not event_type:
        raise WebhookAPIError(
            status.HTTP_400_BAD_REQUEST,
            "webhook_payload_invalid",
            "Campo 'type' é obrigatório",
        )

    occurred_at_raw = payload.get("occurred_at")
    if occurred_at_raw is None:
        raise WebhookAPIError(
            status.HTTP_400_BAD_REQUEST,
            "webhook_payload_invalid",
            "Campo 'occurred_at' é obrigatório",
        )
    occurred_at = _parse_iso_datetime(str(occurred_at_raw))

    contact = payload.get("contact")
    lead = payload.get("lead")
    if not isinstance(contact, dict):
        raise WebhookAPIError(
            status.HTTP_400_BAD_REQUEST,
            "webhook_payload_invalid",
            "Campo 'contact' é obrigatório",
        )
    if not isinstance(lead, dict):
        raise WebhookAPIError(
            status.HTTP_400_BAD_REQUEST,
            "webhook_payload_invalid",
            "Campo 'lead' é obrigatório",
        )

    message = payload.get("message")
    if message is not None and not isinstance(message, dict):
        raise WebhookAPIError(
            status.HTTP_400_BAD_REQUEST,
            "webhook_payload_invalid",
            "Campo 'message' deve ser um objeto",
        )

    metadata = payload.get("metadata")
    if metadata is None:
        metadata = {}
    if not isinstance(metadata, dict):
        raise WebhookAPIError(
            status.HTTP_400_BAD_REQUEST,
            "webhook_payload_invalid",
            "Campo 'metadata' deve ser um objeto",
        )

    event_id = payload.get("event_id")
    event_id_str = str(event_id).strip() if event_id is not None else None
    if event_id_str == "":
        event_id_str = None

    return {
        "type": event_type,
        "event_id": event_id_str,
        "occurred_at": occurred_at,
        "contact": contact,
        "lead": lead,
        "message": message or {},
        "metadata": metadata,
    }


def _parse_iso_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _canonical_json(data: Any) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)


def _build_event_hash(canal: CanalEntrada, envelope: dict[str, Any]) -> str:
    if envelope.get("event_id"):
        canonical = {
            "workspace_id": str(canal.workspace_id),
            "canal_id": str(canal.id),
            "type": envelope["type"],
            "event_id": envelope["event_id"],
        }
    else:
        canonical = {
            "workspace_id": str(canal.workspace_id),
            "canal_id": str(canal.id),
            "type": envelope["type"],
            "occurred_at": envelope["occurred_at"].isoformat(),
            "contact": envelope["contact"],
            "lead": envelope["lead"],
            "message": envelope["message"],
            "metadata": envelope["metadata"],
        }
    return hashlib.sha256(_canonical_json(canonical).encode("utf-8")).hexdigest()


def _uuid_curto(value: uuid.UUID | str) -> str:
    return uuid.UUID(str(value)).hex[:8]


def _normalize_phone(phone: Any) -> str | None:
    if phone is None:
        return None
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    return digits or None


def _build_contact_identity(
    canal: CanalEntrada,
    envelope: dict[str, Any],
    *,
    allow_name_only: bool = True,
    allow_fallback: bool = True,
) -> dict[str, Any]:
    contact = envelope["contact"]
    lead = envelope["lead"]
    metadata = envelope["metadata"]
    identity: dict[str, Any] = {}

    external_id = contact.get("external_id") or metadata.get("external_id")
    if external_id is not None and str(external_id).strip():
        identity["external_id"] = str(external_id).strip()

    phone = _normalize_phone(contact.get("phone"))
    if phone:
        identity["phone"] = phone

    email = contact.get("email") or metadata.get("email")
    if email is not None and str(email).strip():
        identity["email"] = str(email).strip().lower()

    name = contact.get("name") or lead.get("name") or metadata.get("name")
    if not identity and allow_name_only and name is not None and str(name).strip():
        identity["name"] = str(name).strip()

    if not identity and allow_fallback:
        identity["fallback"] = envelope.get("event_id") or envelope["occurred_at"].isoformat()

    identity["channel_id"] = str(canal.id)
    identity["workspace_id"] = str(canal.workspace_id)
    return identity


def _build_contact_jid(canal: CanalEntrada, identity: dict[str, Any]) -> str:
    digest = hashlib.sha256(_canonical_json(identity).encode("utf-8")).hexdigest()[:16]
    return f"{WEBHOOK_INSTANCE_PREFIX}:{_uuid_curto(canal.id)}:{digest}"


def _build_contact_display_name(envelope: dict[str, Any]) -> str | None:
    contact = envelope["contact"]
    lead = envelope["lead"]
    metadata = envelope["metadata"]
    for key in ("name",):
        value = contact.get(key) or lead.get(key) or metadata.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def _build_contact_profile(envelope: dict[str, Any]) -> dict[str, Any]:
    contact = envelope["contact"]
    lead = envelope["lead"]
    metadata = envelope["metadata"]
    profile: dict[str, Any] = {
        "external_id": contact.get("external_id") or metadata.get("external_id"),
        "provider": metadata.get("provider"),
        "lead_source": lead.get("source"),
        "lead_status": lead.get("status"),
    }
    if contact.get("phone"):
        profile["phone"] = _normalize_phone(contact.get("phone"))
    if contact.get("email"):
        profile["email"] = str(contact.get("email")).strip().lower()
    if metadata:
        profile["metadata"] = metadata
    return profile


def _build_tracking_values(envelope: dict[str, Any]) -> dict[str, Any]:
    lead = envelope["lead"]
    metadata = envelope["metadata"]
    source = metadata.get("provider") or lead.get("source") or "webhook"
    medium = metadata.get("utm_medium") or metadata.get("medium")
    campaign = lead.get("campaign") or metadata.get("utm_campaign") or metadata.get("campaign")
    origin_label = metadata.get("provider_label") or lead.get("origin") or lead.get("source") or metadata.get("provider") or "Webhook/API"
    return {
        "source": str(source) if source is not None else None,
        "medium": str(medium) if medium is not None else None,
        "campaign": str(campaign) if campaign is not None else None,
        "origin_label": str(origin_label) if origin_label is not None else None,
        "meta_ad_id": metadata.get("meta_ad_id"),
        "meta_ctwa_clid": metadata.get("meta_ctwa_clid"),
        "meta_headline": metadata.get("meta_headline") or metadata.get("headline"),
        "meta_source_url": metadata.get("meta_source_url") or metadata.get("source_url"),
        "referral_json": _extract_referral_json(envelope),
    }


def _extract_referral_json(envelope: dict[str, Any]) -> str | None:
    metadata = envelope["metadata"]
    lead = envelope["lead"]
    for candidate in (
        metadata.get("referral"),
        metadata.get("referral_json"),
        lead.get("referral"),
        lead.get("referral_json"),
    ):
        if candidate:
            return _canonical_json(candidate) if isinstance(candidate, (dict, list)) else json.dumps(candidate)
    return None


def _build_message_content(envelope: dict[str, Any]) -> tuple[str, str]:
    message = envelope["message"] or {}
    text_value = message.get("text")
    if text_value is not None and str(text_value).strip():
        return str(text_value).strip(), "text"

    contact_name = _build_contact_display_name(envelope)
    lead = envelope["lead"]
    metadata = envelope["metadata"]
    source = lead.get("origin") or lead.get("source") or metadata.get("provider") or "Webhook/API"
    provider_label = "Webhook/API"
    if metadata.get("provider") == "helena":
        provider_label = metadata.get("provider_label") or metadata.get("provider") or provider_label
    suffix = f" - {contact_name}" if contact_name else ""
    return f"[{provider_label}] Lead recebido{suffix} ({source})", "lead"


def _insert_raw_event(
    db: Session,
    *,
    canal: CanalEntrada,
    instance: str,
    contato_jid: str | None,
    envelope: dict[str, Any],
    event_hash: str,
) -> tuple[str | None, bool]:
    row = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_eventos (
                workspace_id, canal_id, event, event_type, event_hash, instance,
                remote_jid, payload, recebido_em, processing_status, processed_at,
                retry_count, error_message, ativo
            )
            VALUES (
                CAST(:workspace_id AS uuid), CAST(:canal_id AS uuid), :event, :event_type, :event_hash, :instance,
                :remote_jid, CAST(:payload AS jsonb), :recebido_em, :processing_status, :processed_at,
                0, NULL, true
            )
            ON CONFLICT (event_hash) WHERE event_hash IS NOT NULL DO NOTHING
            RETURNING id
        """),
        {
            "workspace_id": str(canal.workspace_id),
            "canal_id": str(canal.id),
            "event": "webhook",
            "event_type": envelope["type"],
            "event_hash": event_hash,
            "instance": instance,
            "remote_jid": contato_jid,
            "payload": _canonical_json(envelope),
            "recebido_em": datetime.now(timezone.utc),
            "processing_status": "done",
            "processed_at": datetime.now(timezone.utc),
        },
    ).fetchone()
    if row:
        return str(row[0]), True
    existing = db.execute(
        text("""
            SELECT id
            FROM public.crm_whatsapp_eventos
            WHERE event_hash = :event_hash
            LIMIT 1
        """),
        {"event_hash": event_hash},
    ).fetchone()
    return (str(existing[0]), False) if existing else (None, False)


def _load_idempotent_result(db: Session, event_hash: str) -> dict[str, Any] | None:
    row = db.execute(
        text("""
            SELECT lo.raw_event_id, lo.contato_id, lo.conversa_id, lo.mensagem_id
            FROM public.crm_lead_origin_events lo
            JOIN public.crm_whatsapp_eventos e ON e.id = lo.raw_event_id
            WHERE e.event_hash = :event_hash
            ORDER BY lo.created_at DESC
            LIMIT 1
        """),
        {"event_hash": event_hash},
    ).mappings().first()
    if row:
        return dict(row)

    row = db.execute(
        text("""
            SELECT m.raw_event_id AS raw_event_id, m.contato_id, m.conversa_id, m.id AS mensagem_id
            FROM public.crm_whatsapp_mensagens m
            JOIN public.crm_whatsapp_eventos e ON e.id = m.raw_event_id
            WHERE e.event_hash = :event_hash
            ORDER BY m.created_at DESC
            LIMIT 1
        """),
        {"event_hash": event_hash},
    ).mappings().first()
    return dict(row) if row else None


def _load_existing_message_id(
    db: Session,
    canal: CanalEntrada,
    *,
    instance: str,
    remote_jid: str | None,
) -> str | None:
    if not remote_jid:
        return None
    row = db.execute(
        text("""
            SELECT id
            FROM public.crm_whatsapp_mensagens
            WHERE workspace_id = CAST(:workspace_id AS uuid)
              AND canal_id = CAST(:canal_id AS uuid)
              AND instance = :instance
              AND remote_jid = :remote_jid
            ORDER BY created_at DESC
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


def _upsert_contact(
    db: Session,
    *,
    canal: CanalEntrada,
    instance: str,
    contato_jid: str,
    contact_identity: dict[str, Any],
    envelope: dict[str, Any],
    received_at: datetime,
) -> str:
    display_name = _build_contact_display_name(envelope)
    tracking = _build_tracking_values(envelope)
    profile = _build_contact_profile(envelope)
    row = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_contatos (
                workspace_id, jid, telefone, nome, push_name, origem, perfil_json,
                campanha_origem, utm_source, utm_medium, utm_campaign,
                primeira_conversa_at, last_message_at, created_at, updated_at
            )
            VALUES (
                CAST(:workspace_id AS uuid), :jid, :telefone, :nome, :push_name, 'webhook', CAST(:perfil_json AS jsonb),
                :campanha_origem, :utm_source, :utm_medium, :utm_campaign,
                :primeira_conversa_at, :last_message_at, NOW(), NOW()
            )
            ON CONFLICT (workspace_id, jid) DO UPDATE SET
                telefone = COALESCE(NULLIF(EXCLUDED.telefone, ''), public.crm_whatsapp_contatos.telefone),
                nome = COALESCE(NULLIF(EXCLUDED.nome, ''), public.crm_whatsapp_contatos.nome),
                push_name = COALESCE(NULLIF(EXCLUDED.push_name, ''), public.crm_whatsapp_contatos.push_name),
                origem = COALESCE(public.crm_whatsapp_contatos.origem, EXCLUDED.origem),
                perfil_json = COALESCE(public.crm_whatsapp_contatos.perfil_json, EXCLUDED.perfil_json),
                campanha_origem = COALESCE(public.crm_whatsapp_contatos.campanha_origem, EXCLUDED.campanha_origem),
                utm_source = COALESCE(public.crm_whatsapp_contatos.utm_source, EXCLUDED.utm_source),
                utm_medium = COALESCE(public.crm_whatsapp_contatos.utm_medium, EXCLUDED.utm_medium),
                utm_campaign = COALESCE(public.crm_whatsapp_contatos.utm_campaign, EXCLUDED.utm_campaign),
                last_message_at = COALESCE(EXCLUDED.last_message_at, public.crm_whatsapp_contatos.last_message_at),
                updated_at = NOW()
            RETURNING id
        """),
        {
            "workspace_id": str(canal.workspace_id),
            "jid": contato_jid,
            "telefone": _normalize_phone(envelope["contact"].get("phone")),
            "nome": display_name,
            "push_name": display_name,
            "perfil_json": _canonical_json(profile),
            "campanha_origem": tracking["campaign"],
            "utm_source": tracking["source"],
            "utm_medium": tracking["medium"],
            "utm_campaign": tracking["campaign"],
            "primeira_conversa_at": received_at,
            "last_message_at": received_at,
        },
    ).fetchone()
    if not row:
        existing = db.execute(
            text("""
                SELECT id
                FROM public.crm_whatsapp_contatos
                WHERE workspace_id = CAST(:workspace_id AS uuid)
                  AND jid = :jid
                LIMIT 1
            """),
            {"workspace_id": str(canal.workspace_id), "jid": contato_jid},
        ).fetchone()
        if not existing:
            raise RuntimeError("Contato não encontrado após upsert")
        return str(existing[0])
    return str(row[0])


def _upsert_conversation(
    db: Session,
    *,
    canal: CanalEntrada,
    instance: str,
    contato_id: str,
    contato_jid: str,
    envelope: dict[str, Any],
    received_at: datetime,
    nao_lidas: int = 1,
) -> str:
    tracking = _build_tracking_values(envelope)
    message_content, _message_type = _build_message_content(envelope)
    existing = db.execute(
        text("""
            SELECT id, status
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
            "remote_jid": contato_jid,
        },
    ).fetchone()

    if existing and str(existing[1]) != "resolvido":
        row = db.execute(
            text("""
                UPDATE public.crm_whatsapp_conversas
                SET ultima_mensagem = :ultima_mensagem,
                    ultima_direcao = 'entrada',
                    ultima_msg_at = :ultima_msg_at,
                    last_inbound_at = :last_inbound_at,
                    nao_lidas = nao_lidas + :nao_lidas,
                    campanha = COALESCE(public.crm_whatsapp_conversas.campanha, :campanha),
                    lead_status = COALESCE(public.crm_whatsapp_conversas.lead_status, :lead_status),
                    updated_at = NOW()
                WHERE id = CAST(:conversa_id AS uuid)
                RETURNING id
            """),
            {
                "conversa_id": str(existing[0]),
                "ultima_mensagem": message_content[:500],
                "ultima_msg_at": received_at,
                "last_inbound_at": received_at,
                "nao_lidas": nao_lidas,
                "campanha": tracking["campaign"],
                "lead_status": envelope["lead"].get("status") or "novo",
            },
        ).fetchone()
        return str(row[0]) if row else str(existing[0])

    row = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_conversas (
                workspace_id, contato_id, canal_id, instance, remote_jid, is_group, group_name, status,
                nao_lidas, ultima_mensagem, ultima_direcao, ultima_msg_at, last_inbound_at,
                campanha, lead_status, created_at, updated_at
            )
            VALUES (
                CAST(:workspace_id AS uuid), CAST(:contato_id AS uuid), CAST(:canal_id AS uuid), :instance, :remote_jid,
                false, NULL, 'nova',
                :nao_lidas, :ultima_mensagem, 'entrada', :ultima_msg_at, :last_inbound_at,
                :campanha, :lead_status, NOW(), NOW()
            )
            RETURNING id
        """),
        {
            "workspace_id": str(canal.workspace_id),
            "contato_id": contato_id,
            "canal_id": str(canal.id),
            "instance": instance,
            "remote_jid": contato_jid,
            "nao_lidas": nao_lidas,
            "ultima_mensagem": message_content[:500],
            "ultima_msg_at": received_at,
            "last_inbound_at": received_at,
            "campanha": tracking["campaign"],
            "lead_status": envelope["lead"].get("status") or "novo",
        },
    ).fetchone()
    if not row:
        raise RuntimeError("Conversa não encontrada após insert")
    return str(row[0])


def _insert_message(
    db: Session,
    *,
    canal: CanalEntrada,
    raw_event_id: str,
    contato_id: str,
    conversa_id: str,
    instance: str,
    contato_jid: str,
    envelope: dict[str, Any],
    event_hash: str,
    received_at: datetime,
) -> str:
    message_content, message_type = _build_message_content(envelope)
    message_hash = hashlib.sha256(
        _canonical_json(
            {
                "event_hash": event_hash,
                "message": message_content,
                "message_type": message_type,
                "instance": instance,
                "remote_jid": contato_jid,
            }
        ).encode("utf-8")
    ).hexdigest()
    payload_json = _canonical_json(envelope)
    row = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_mensagens (
                workspace_id, conversa_id, canal_id, raw_event_id, contato_id,
                evolution_msg_id, message_hash, instance, remote_jid, direcao,
                from_me, remetente_tipo, remetente_nome, conteudo, message_type,
                wa_status, payload, recebida_em, participant_jid, participant_name,
                is_mentioned, created_at, updated_at, ativo
            )
            VALUES (
                CAST(:workspace_id AS uuid), CAST(:conversa_id AS uuid), CAST(:canal_id AS uuid), CAST(:raw_event_id AS uuid), CAST(:contato_id AS uuid),
                NULL, :message_hash, :instance, :remote_jid, 'entrada',
                false, 'contato', :remetente_nome, :conteudo, :message_type,
                NULL, CAST(:payload AS jsonb), :recebida_em, NULL, NULL,
                false, NOW(), NOW(), true
            )
            ON CONFLICT DO NOTHING
            RETURNING id
        """),
        {
            "workspace_id": str(canal.workspace_id),
            "conversa_id": conversa_id,
            "canal_id": str(canal.id),
            "raw_event_id": raw_event_id,
            "contato_id": contato_id,
            "message_hash": message_hash,
            "instance": instance,
            "remote_jid": contato_jid,
            "remetente_nome": _build_contact_display_name(envelope),
            "conteudo": message_content,
            "message_type": message_type,
            "payload": payload_json,
            "recebida_em": received_at,
        },
    ).fetchone()
    if row:
        return str(row[0])

    existing = db.execute(
        text("""
            SELECT id
            FROM public.crm_whatsapp_mensagens
            WHERE workspace_id = CAST(:workspace_id AS uuid)
              AND canal_id = CAST(:canal_id AS uuid)
              AND message_hash = :message_hash
            LIMIT 1
        """),
        {
            "workspace_id": str(canal.workspace_id),
            "canal_id": str(canal.id),
            "message_hash": message_hash,
        },
    ).fetchone()
    if not existing:
        raise RuntimeError("Mensagem não encontrada após insert")
    return str(existing[0])


def _record_lead_origin_event(
    db: Session,
    *,
    canal: CanalEntrada,
    raw_event_id: str,
    contato_id: str,
    conversa_id: str,
    mensagem_id: str | None,
    envelope: dict[str, Any],
) -> str | None:
    tracking = _build_tracking_values(envelope)
    if not any(tracking.values()):
        return None

    row = db.execute(
        text("""
            INSERT INTO public.crm_lead_origin_events (
                workspace_id, canal_id, contato_id, conversa_id, mensagem_id, raw_event_id,
                source, medium, campaign, origin_label, meta_ad_id, meta_ctwa_clid,
                meta_headline, meta_source_url, referral_json, raw_payload, created_at
            )
            VALUES (
                CAST(:workspace_id AS uuid), CAST(:canal_id AS uuid), CAST(:contato_id AS uuid), CAST(:conversa_id AS uuid),
                CAST(:mensagem_id AS uuid), CAST(:raw_event_id AS uuid),
                :source, :medium, :campaign, :origin_label, :meta_ad_id, :meta_ctwa_clid,
                :meta_headline, :meta_source_url, CAST(:referral_json AS jsonb), CAST(:raw_payload AS jsonb), NOW()
            )
            RETURNING id
        """),
        {
            "workspace_id": str(canal.workspace_id),
            "canal_id": str(canal.id),
            "contato_id": contato_id,
            "conversa_id": conversa_id,
            "mensagem_id": mensagem_id,
            "raw_event_id": raw_event_id,
            "source": tracking["source"],
            "medium": tracking["medium"],
            "campaign": tracking["campaign"],
            "origin_label": tracking["origin_label"],
            "meta_ad_id": tracking["meta_ad_id"],
            "meta_ctwa_clid": tracking["meta_ctwa_clid"],
            "meta_headline": tracking["meta_headline"],
            "meta_source_url": tracking["meta_source_url"],
            "referral_json": tracking["referral_json"],
            "raw_payload": _canonical_json(envelope),
        },
    ).fetchone()
    if not row:
        return None
    return str(row[0])
