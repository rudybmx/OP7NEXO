from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

MEDIA_MESSAGE_KEYS = (
    "imageMessage",
    "videoMessage",
    "audioMessage",
    "documentMessage",
    "stickerMessage",
    "ptvMessage",
)

MESSAGE_EVENT_TYPES = {
    "MESSAGE",
    "MESSAGES_UPSERT",
    "MESSAGE_UPSERT",
    "MESSAGE_RECEIVED",
}

RECEIPT_EVENT_TYPES = {
    "RECEIPT",
    "READ_RECEIPT",
    "READRECEIPT",
    "MESSAGES_UPDATE",
    "MESSAGE_STATUS",
}

CONNECTION_EVENT_TYPES = {
    "CONNECTION_UPDATE",
    "CONNECTED",
    "LOGGEDOUT",
    "LOGGED_OUT",
    "DISCONNECTED",
    "QRCODE",
    "QR_CODE",
}


class WhatsAppMediaPayload(BaseModel):
    base64: str | None = None
    url: str | None = None
    mimetype: str = "application/octet-stream"
    filename: str | None = None
    caption: str | None = None
    is_media: bool = False


class WhatsAppMessageEvent(BaseModel):
    event_type: str
    instance: str | None = None
    remote_jid: str = ""
    participant_jid: str = ""
    sender_jid: str = ""
    sender_pn: str = ""
    from_me: bool = False
    evolution_msg_id: str = ""
    push_name: str = ""
    message_type: str = "conversation"
    text: str = ""
    mentioned_jids: list[str] = Field(default_factory=list)
    media: WhatsAppMediaPayload = Field(default_factory=WhatsAppMediaPayload)
    received_at: datetime
    received_at_source: Literal["payload", "fallback"] = "fallback"
    is_group: bool = False
    is_lid: bool = False
    raw: dict[str, Any] = Field(default_factory=dict)

    def is_channel_mentioned(self, channel_phone: str | None) -> bool:
        channel_digits = _digits(channel_phone)
        if not channel_digits:
            return False
        for jid in self.mentioned_jids:
            mentioned_digits = _digits(str(jid).split("@", 1)[0])
            if mentioned_digits and (channel_digits in mentioned_digits or mentioned_digits in channel_digits):
                return True
        return False


class WhatsAppReceiptEvent(BaseModel):
    event_type: str
    instance: str | None = None
    remote_jid: str = ""
    message_ids: list[str] = Field(default_factory=list)
    status: str = ""
    received_at: datetime
    raw: dict[str, Any] = Field(default_factory=dict)


class WhatsAppConnectionEvent(BaseModel):
    event_type: str
    instance: str | None = None
    state: Literal["connected", "connecting", "disconnected", "unknown"] = "unknown"
    number: str | None = None
    qr_code: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


def normalize_event_type(event: str | None) -> str:
    return str(event or "").upper().replace(".", "_").replace("-", "_").strip()


def payload_root(payload: dict[str, Any] | None) -> dict[str, Any]:
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, dict):
            return data
        return payload
    return {}


def payload_info(payload: dict[str, Any] | None) -> dict[str, Any]:
    root = payload_root(payload)
    info = root.get("Info")
    return info if isinstance(info, dict) else {}


def payload_message(payload: dict[str, Any] | None) -> dict[str, Any]:
    root = payload_root(payload)
    for key in ("Message", "message"):
        message = root.get(key)
        if isinstance(message, dict):
            return message
    return {}


def normalize_message_type(payload: dict[str, Any] | None, fallback: str = "conversation") -> str:
    info = payload_info(payload)
    message = payload_message(payload)

    for key in ("conversation", "extendedTextMessage", *MEDIA_MESSAGE_KEYS):
        if key in message:
            return key

    raw_type = str(
        info.get("Type")
        or info.get("type")
        or info.get("MediaType")
        or info.get("mediaType")
        or fallback
        or ""
    ).strip().lower()
    mapping = {
        "text": "conversation",
        "conversation": "conversation",
        "extendedtext": "extendedTextMessage",
        "extendedtextmessage": "extendedTextMessage",
        "media": "media",
        "image": "imageMessage",
        "imagemessage": "imageMessage",
        "video": "videoMessage",
        "videomessage": "videoMessage",
        "audio": "audioMessage",
        "audiomessage": "audioMessage",
        "document": "documentMessage",
        "documentmessage": "documentMessage",
        "sticker": "stickerMessage",
        "stickermessage": "stickerMessage",
        "ptv": "ptvMessage",
        "ptvmessage": "ptvMessage",
    }
    if raw_type in mapping:
        return mapping[raw_type]
    if raw_type.endswith("message"):
        return raw_type
    return fallback or "conversation"


def normalize_media_payload(payload: dict[str, Any] | None) -> WhatsAppMediaPayload:
    info = payload_info(payload)
    message = payload_message(payload)
    root = payload_root(payload)
    candidates: list[dict[str, Any]] = [message, root, info]

    media_nodes: list[dict[str, Any]] = []
    for media_key in MEDIA_MESSAGE_KEYS:
        media = message.get(media_key)
        if isinstance(media, dict):
            media_nodes.append(media)
    candidates.extend(media_nodes)

    def pick(*keys: str) -> Any:
        for candidate in candidates:
            for key in keys:
                value = candidate.get(key)
                if value not in (None, ""):
                    return value
        return None

    base64_value = pick("base64", "Base64", "data", "mediaBase64")
    url = pick("mediaUrl", "mediaURL", "url", "Url", "downloadUrl", "downloadURL")
    caption = pick("caption", "Caption", "text", "body")
    message_type = normalize_message_type(payload)
    return WhatsAppMediaPayload(
        base64=str(base64_value) if base64_value not in (None, "") else None,
        url=str(url) if url not in (None, "") else None,
        mimetype=str(pick("mimetype", "mimeType", "mime_type", "contentType") or "application/octet-stream"),
        filename=_optional_str(pick("fileName", "filename", "name", "file_name")),
        caption=_optional_str(caption),
        is_media=message_type in (*MEDIA_MESSAGE_KEYS, "media") or bool(base64_value or url),
    )


def normalize_message_event(
    payload: dict[str, Any] | None,
    event: str | None = None,
    *,
    instance: str | None = None,
) -> WhatsAppMessageEvent:
    root = payload_root(payload)
    info = payload_info(payload)
    key = root.get("key") if isinstance(root.get("key"), dict) else {}
    message = payload_message(payload)

    if info:
        remote_jid = _first_str(info, "Chat", "chat", "RemoteJid", "remoteJid", "jid")
        participant_jid = _first_str(info, "SenderAlt", "Sender", "sender", "Participant", "participant")
        from_me = bool(info.get("IsFromMe", info.get("fromMe", False)))
        evolution_msg_id = _first_str(info, "ID", "Id", "id") or _first_str(root, "id", "ID")
        push_name = _first_str(info, "PushName", "pushName") or _first_str(root, "pushName")
        timestamp_raw = info.get("Timestamp") or root.get("timestamp") or root.get("messageTimestamp")
    else:
        remote_jid = _first_str(key, "remoteJid", "remoteJID") or _first_str(root, "remoteJid")
        participant_jid = _first_str(key, "participant") or _first_str(root, "participant")
        from_me = bool(key.get("fromMe", False))
        evolution_msg_id = _first_str(key, "id", "ID") or _first_str(root, "id", "ID")
        push_name = _first_str(root, "pushName")
        timestamp_raw = root.get("messageTimestamp") or root.get("timestamp")

    event_type = normalize_event_type(event or _first_str(root, "event", "type"))
    message_type = normalize_message_type(root, fallback=str(root.get("messageType") or "conversation"))
    media = normalize_media_payload(root)
    text = _extract_text(message, info, media)
    mentioned_jids = _extract_mentions(message, root)
    sender_pn = (
        _first_str(root, "senderPn", "senderPN")
        or _first_str(info, "SenderPn", "SenderPN", "senderPn", "senderPN")
        or _first_str(key, "senderPn", "senderPN")
    )
    is_group = bool(info.get("IsGroup")) or "@g.us" in remote_jid
    sender_jid = participant_jid if is_group and participant_jid else remote_jid

    return WhatsAppMessageEvent(
        event_type=event_type,
        instance=instance or _instance_from_payload(payload),
        remote_jid=remote_jid,
        participant_jid=participant_jid,
        sender_jid=sender_jid,
        sender_pn=sender_pn,
        from_me=from_me,
        evolution_msg_id=evolution_msg_id,
        push_name=push_name,
        message_type=message_type,
        text=text,
        mentioned_jids=mentioned_jids,
        media=media,
        received_at=_parse_timestamp(timestamp_raw),
        received_at_source=_parse_timestamp_source(timestamp_raw),
        is_group=is_group,
        is_lid="@lid" in remote_jid,
        raw=root,
    )


def normalize_receipt_event(
    payload: dict[str, Any] | None,
    event: str | None = None,
    *,
    instance: str | None = None,
) -> WhatsAppReceiptEvent:
    root = payload_root(payload)
    info = payload_info(payload)
    key = root.get("key") if isinstance(root.get("key"), dict) else {}
    event_type = normalize_event_type(event or _first_str(root, "event", "type"))
    status_raw = root.get("status") or root.get("Status") or root.get("receiptStatus") or root.get("ReceiptStatus") or root.get("state") or root.get("State")
    status_value = _status_from_raw(status_raw)
    if not status_value:
        if event_type in {"READ_RECEIPT", "READRECEIPT"}:
            status_value = "read"
        elif event_type in {"RECEIPT", "MESSAGES_UPDATE", "MESSAGE_STATUS"}:
            status_value = "delivered"
        elif event_type == "FAILED":
            status_value = "failed"

    message_ids: list[str] = []
    for value in (key.get("id"), root.get("id"), root.get("ID"), info.get("ID"), info.get("Id")):
        _append_message_id(message_ids, value)
    for field in ("MessageIDs", "messageIds", "messageIDs", "messagesIds", "messagesIDs", "ids", "Ids"):
        value = root.get(field)
        if isinstance(value, list):
            for item in value:
                _append_message_id(message_ids, item)
        else:
            _append_message_id(message_ids, value)

    remote_jid = _first_str(info, "Chat", "chat", "RemoteJid", "remoteJid", "jid") or _first_str(key, "remoteJid") or _first_str(root, "remoteJid")
    status_map = {
        "sent": "sent",
        "delivered": "delivered",
        "read": "read",
        "failed": "failed",
        "pending": "pending",
        "received": "delivered",
        "seen": "read",
    }
    normalized_status = status_map.get(status_value, status_value)
    return WhatsAppReceiptEvent(
        event_type=event_type,
        instance=instance or _instance_from_payload(payload),
        remote_jid=remote_jid,
        message_ids=list(dict.fromkeys(message_ids)),
        status=normalized_status,
        received_at=_parse_timestamp(root.get("timestamp") or root.get("messageTimestamp") or info.get("Timestamp")),
        raw=root,
    )


def normalize_connection_event(
    payload: dict[str, Any] | None,
    event: str | None = None,
    *,
    instance: str | None = None,
) -> WhatsAppConnectionEvent:
    root = payload_root(payload)
    info = payload_info(payload)
    source = info or root
    event_type = normalize_event_type(event or _first_str(root, "event", "type"))
    state_value = str(
        source.get("state")
        or source.get("State")
        or source.get("status")
        or source.get("Status")
        or ""
    ).lower()
    if state_value in {"open", "connected", "connect"}:
        state = "connected"
    elif state_value in {"connecting", "qrcode", "qr_code", "pairing"}:
        state = "connecting"
    elif state_value in {"close", "closed", "disconnected", "loggedout", "logged_out", "logout"}:
        state = "disconnected"
    elif source.get("Connected") is True:
        state = "connected"
    elif source.get("LoggedIn") is True:
        state = "connecting"
    else:
        state = "unknown"

    if event_type == "CONNECTED":
        state = "connected"
    elif event_type in {"LOGGEDOUT", "LOGGED_OUT", "DISCONNECTED"}:
        state = "disconnected"
    elif event_type in {"QRCODE", "QR_CODE"} and state == "unknown":
        state = "connecting"

    return WhatsAppConnectionEvent(
        event_type=event_type,
        instance=instance or _instance_from_payload(payload),
        state=state,
        number=_extract_number(root),
        qr_code=_extract_qr_code(root),
        raw=root,
    )


def build_evolution_media_signature(media: WhatsAppMediaPayload) -> dict[str, Any]:
    signature: dict[str, Any] = {
        "is_media": media.is_media,
        "mimetype": media.mimetype,
    }
    if media.filename:
        signature["filename"] = media.filename
    if media.caption:
        signature["caption"] = media.caption
    if media.url:
        signature["url"] = media.url
    if media.base64:
        signature["base64_sha256"] = hashlib.sha256(media.base64.encode("utf-8")).hexdigest()
    return signature


def build_evolution_message_signature(message: WhatsAppMessageEvent) -> dict[str, Any]:
    signature: dict[str, Any] = {
        "remote_jid": message.remote_jid or "",
        "participant_jid": message.participant_jid or "",
        "sender_jid": message.sender_jid or "",
        "from_me": message.from_me,
        "message_type": message.message_type,
        "text": message.text,
        "mentioned_jids": sorted(dict.fromkeys(message.mentioned_jids)),
        "is_group": message.is_group,
        "is_lid": message.is_lid,
        "media": build_evolution_media_signature(message.media),
    }
    if message.received_at_source == "payload":
        signature["received_at"] = message.received_at.isoformat()
    return signature


def build_evolution_receipt_signature(receipt: WhatsAppReceiptEvent) -> dict[str, Any]:
    return {
        "remote_jid": receipt.remote_jid or "",
        "status": receipt.status,
        "message_ids": sorted(dict.fromkeys(receipt.message_ids)),
    }


def build_evolution_connection_signature(connection: WhatsAppConnectionEvent) -> dict[str, Any]:
    return {
        "state": connection.state,
        "number": connection.number or "",
        "qr_code": connection.qr_code or "",
    }


def build_evolution_event_signature(
    payload: dict[str, Any] | None,
    event: str | None = None,
    *,
    instance: str | None = None,
) -> dict[str, Any]:
    event_type = normalize_event_type(event or (payload.get("event") if isinstance(payload, dict) else None))
    if event_type in RECEIPT_EVENT_TYPES:
        receipt = normalize_receipt_event(payload, event_type, instance=instance)
        return {
            "kind": "receipt",
            "event_type": receipt.event_type,
            "instance": instance or receipt.instance or "",
            "signature": build_evolution_receipt_signature(receipt),
        }
    if event_type in CONNECTION_EVENT_TYPES:
        connection = normalize_connection_event(payload, event_type, instance=instance)
        return {
            "kind": "connection",
            "event_type": connection.event_type,
            "instance": instance or connection.instance or "",
            "signature": build_evolution_connection_signature(connection),
        }
    if event_type in MESSAGE_EVENT_TYPES:
        message = normalize_message_event(payload, event_type, instance=instance)
        return {
            "kind": "message",
            "event_type": message.event_type,
            "instance": instance or message.instance or "",
            "signature": build_evolution_message_signature(message),
        }

    return {
        "kind": "raw",
        "event_type": event_type,
        "instance": instance or _instance_from_payload(payload) or "",
        "signature": payload_root(payload),
    }


def _extract_text(message: dict[str, Any], info: dict[str, Any], media: WhatsAppMediaPayload) -> str:
    for key in ("conversation", "text", "body", "caption", "message", "content", "messageText"):
        value = message.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    extended = message.get("extendedTextMessage")
    if isinstance(extended, dict):
        text = extended.get("text")
        if isinstance(text, str) and text.strip():
            return text.strip()

    for media_key in MEDIA_MESSAGE_KEYS:
        media_node = message.get(media_key)
        if isinstance(media_node, dict):
            text = media_node.get("caption") or media_node.get("text")
            if isinstance(text, str) and text.strip():
                return text.strip()

    for key in ("Caption", "Text", "caption", "text"):
        value = info.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    if media.is_media:
        return "[mídia]"
    return "[mídia]"


def _extract_mentions(message: dict[str, Any], root: dict[str, Any]) -> list[str]:
    mentions: list[str] = []

    def collect(context: Any) -> None:
        if not isinstance(context, dict):
            return
        value = context.get("mentionedJid") or context.get("mentionedJids") or context.get("mentioned_jid")
        if isinstance(value, list):
            mentions.extend(str(item) for item in value if item)
        elif value:
            mentions.append(str(value))

    collect(message.get("contextInfo"))
    collect(message.get("ContextInfo"))
    extended = message.get("extendedTextMessage")
    if isinstance(extended, dict):
        collect(extended.get("contextInfo"))
        collect(extended.get("ContextInfo"))
    for media_key in MEDIA_MESSAGE_KEYS:
        media_node = message.get(media_key)
        if isinstance(media_node, dict):
            collect(media_node.get("contextInfo"))
            collect(media_node.get("ContextInfo"))
    collect(root.get("contextInfo"))
    return list(dict.fromkeys(mentions))


def _extract_number(payload: object) -> str | None:
    if isinstance(payload, dict):
        for key in (
            "number",
            "Number",
            "phone",
            "Phone",
            "phoneNumber",
            "PhoneNumber",
            "owner",
            "Owner",
            "jid",
            "JID",
        ):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value.split("@", 1)[0]
        for nested in payload.values():
            number = _extract_number(nested)
            if number:
                return number
    elif isinstance(payload, list):
        for item in payload:
            number = _extract_number(item)
            if number:
                return number
    return None


def _extract_qr_code(payload: object) -> str | None:
    if isinstance(payload, dict):
        for key in ("base64", "qrcode", "qrCode", "qr_code", "code", "pairingCode"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
        for key in ("qrcode", "qrCode", "qr_code", "QR", "Qr"):
            nested = payload.get(key)
            found = _extract_qr_code(nested)
            if found:
                return found
        for nested in payload.values():
            found = _extract_qr_code(nested)
            if found:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = _extract_qr_code(item)
            if found:
                return found
    return None


def _append_message_id(message_ids: list[str], value: object) -> None:
    if isinstance(value, dict):
        candidate = value.get("id") or value.get("ID") or value.get("messageId") or value.get("messageID")
        if candidate:
            message_ids.append(str(candidate))
    elif isinstance(value, str) and value:
        message_ids.append(value)
    elif value not in (None, ""):
        message_ids.append(str(value))


def _parse_timestamp(value: Any) -> datetime:
    return _parse_timestamp_with_source(value)[0]


def _parse_timestamp_source(value: Any) -> Literal["payload", "fallback"]:
    return _parse_timestamp_with_source(value)[1]


def _parse_timestamp_with_source(value: Any) -> tuple[datetime, Literal["payload", "fallback"]]:
    if isinstance(value, datetime):
        return (value if value.tzinfo else value.replace(tzinfo=timezone.utc), "payload")
    if isinstance(value, str):
        if value.isdigit():
            return datetime.fromtimestamp(int(value), tz=timezone.utc), "payload"
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")), "payload"
        except ValueError:
            return datetime.now(timezone.utc), "fallback"
    if isinstance(value, (int, float)) and value:
        timestamp = value / 1000 if value > 10_000_000_000 else value
        return datetime.fromtimestamp(timestamp, tz=timezone.utc), "payload"
    return datetime.now(timezone.utc), "fallback"


def _first_str(source: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = source.get(key)
        if value not in (None, ""):
            return str(value)
    return ""


def _optional_str(value: Any) -> str | None:
    if value in (None, ""):
        return None
    return str(value)


def _status_from_raw(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("status") or value.get("Status") or value.get("state") or value.get("State") or "").lower()
    if isinstance(value, str):
        return value.lower()
    if value not in (None, ""):
        return str(value).lower()
    return ""


def _instance_from_payload(payload: dict[str, Any] | None) -> str | None:
    if not isinstance(payload, dict):
        return None
    value = payload.get("instanceName") or payload.get("instance") or payload.get("instance_id")
    return str(value) if value else None


def _digits(value: str | None) -> str:
    return re.sub(r"\D", "", str(value or ""))
