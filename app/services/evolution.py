"""Serviço de integração com Evolution Go / Evolution API."""

from __future__ import annotations

import logging
import uuid
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

META = settings.EVOLUTION_API_URL.rstrip("/")
API_KEY = settings.EVOLUTION_API_KEY
HEADERS = {"apikey": API_KEY, "Content-Type": "application/json"}
DEFAULT_SUBSCRIBE_EVENTS = ["ALL"]
# === Retry / Circuit Breaker ===

import time as _time
import random as _random

MAX_RETRIES = 3
BASE_DELAY_SECONDS = 1.0
MAX_DELAY_SECONDS = 30.0
RETRYABLE_STATUSES = {429, 500, 502, 503, 504}
QR_CODE_RETRIES = 4
QR_CODE_BASE_DELAY_SECONDS = 1.0
QR_CODE_MAX_DELAY_SECONDS = 5.0
QR_CODE_HTTP_TIMEOUT_SECONDS = 10


def _should_retry(status_code: int) -> bool:
    return status_code in RETRYABLE_STATUSES


def _retry_with_backoff(func, *args, **kwargs):
    last_exc = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = func(*args, **kwargs)
            if resp.status_code < 400:
                return resp
            if _should_retry(resp.status_code) and attempt < MAX_RETRIES:
                delay = min(BASE_DELAY_SECONDS * (2 ** attempt) + _random.uniform(0, 1), MAX_DELAY_SECONDS)
                logger.warning(
                    "[evolution] retry %d/%d apos HTTP %s, aguardando %.1fs",
                    attempt + 1, MAX_RETRIES, resp.status_code, delay,
                )
                _time.sleep(delay)
                continue
            return resp
        except Exception as exc:
            last_exc = exc
            if attempt < MAX_RETRIES:
                delay = min(BASE_DELAY_SECONDS * (2 ** attempt) + _random.uniform(0, 1), MAX_DELAY_SECONDS)
                logger.warning(
                    "[evolution] retry %d/%d apos excecao %s, aguardando %.1fs",
                    attempt + 1, MAX_RETRIES, type(exc).__name__, delay,
                )
                _time.sleep(delay)
                continue
            raise
    raise last_exc


class EvolutionError(Exception):
    pass


def _json_or_text(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except Exception:
        return {"message": resp.text}


def _nested_value(data: Any, path: tuple[str, ...]) -> Any:
    current = data
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def extract_evolution_message_id(payload: Any) -> str | None:
    """Extrai o id da mensagem em formatos conhecidos da Evolution."""
    if not isinstance(payload, dict):
        return None

    candidate_paths: tuple[tuple[str, ...], ...] = (
        ("key", "id"),
        ("key", "ID"),
        ("message", "key", "id"),
        ("message", "key", "ID"),
        ("message", "id"),
        ("message", "ID"),
        ("data", "Info", "ID"),
        ("data", "Info", "Id"),
        ("data", "Info", "id"),
        ("data", "key", "id"),
        ("data", "key", "ID"),
        ("data", "id"),
        ("data", "messageId"),
        ("data", "messageID"),
        ("response", "key", "id"),
        ("response", "message", "key", "id"),
        ("response", "messageId"),
        ("response", "messageID"),
        ("response", "id"),
        ("messageId",),
        ("messageID",),
        ("id",),
        ("ID",),
    )

    for path in candidate_paths:
        value = _nested_value(payload, path)
        if isinstance(value, str):
            value = value.strip()
            if value:
                return value
    return None


def _error_message(resp: httpx.Response) -> str:
    data = _json_or_text(resp)
    if isinstance(data, dict):
        response = data.get("response")
        if isinstance(response, dict):
            for key in ("message", "error", "detail"):
                msg = response.get(key)
                if msg:
                    return str(msg)
        for key in ("message", "error", "detail"):
            msg = data.get(key)
            if msg:
                return str(msg)
    return resp.text


def _handle_error(resp: httpx.Response, ctx: str) -> None:
    if resp.status_code >= 400:
        msg = _error_message(resp)
        logger.error("[evolution] %s — HTTP %s: %s", ctx, resp.status_code, msg)
        raise EvolutionError(f"{ctx}: {msg}")


def _headers(instance_id: str | None = None, instance_token: str | None = None) -> dict[str, str]:
    headers = dict(HEADERS)
    if instance_id:
        headers["instanceId"] = str(instance_id)
    if instance_token:
        headers["instanceToken"] = str(instance_token)
    return headers


def _send_headers(instance_id: str | None = None, instance_token: str | None = None) -> dict[str, str]:
    headers = _headers(instance_id, instance_token)
    if instance_token:
        headers["apikey"] = str(instance_token)
    return headers


def _unwrap_payload(payload: Any) -> Any:
    if isinstance(payload, dict):
        for key in ("data", "response"):
            value = payload.get(key)
            if value not in (None, ""):
                return value
    return payload


def _payload_list(payload: Any) -> list[Any]:
    data = _unwrap_payload(payload)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("instances", "items", "results", "list"):
            value = data.get(key)
            if isinstance(value, list):
                return value
    return []


def _instance_status_label(connected: Any, logged_in: Any, fallback: str = "close") -> str:
    if connected is True:
        return "open"
    if logged_in is True:
        return "connecting"
    return fallback


def _looks_like_qr_text(value: str) -> bool:
    bruto = value.strip()
    if not bruto:
        return False
    if bruto.startswith("data:image") or bruto.startswith("http://") or bruto.startswith("https://"):
        return True
    if bruto.startswith("iVBOR"):
        return True
    return len(bruto) > 80 and any(ch in bruto for ch in ("=", "/", "+"))


def _normalize_qr_image_value(value: Any) -> str | None:
    if isinstance(value, dict):
        for key in ("Qrcode", "qrcode", "qrCode", "qr_code", "base64", "base64Qr", "base64Qrcode"):
            nested = value.get(key)
            if nested is not None:
                normalized = _normalize_qr_image_value(nested)
                if normalized:
                    return normalized
        for nested in value.values():
            if isinstance(nested, (dict, list)):
                normalized = _normalize_qr_image_value(nested)
                if normalized:
                    return normalized
        return None
    if isinstance(value, list):
        for item in value:
            normalized = _normalize_qr_image_value(item)
            if normalized:
                return normalized
        return None
    if isinstance(value, str):
        bruto = value.strip()
        if not bruto:
            return None
        if bruto.startswith("data:image") or bruto.startswith("http://") or bruto.startswith("https://"):
            return bruto
        if _looks_like_qr_text(bruto):
            return f"data:image/png;base64,{bruto}"
    return None


def _normalize_qr_code_value(value: Any) -> str | None:
    if isinstance(value, dict):
        for key in ("Code", "code", "pairingCode", "pairing_code"):
            nested = value.get(key)
            if isinstance(nested, str):
                text = nested.strip()
                if text:
                    return text
            elif nested is not None:
                normalized = _normalize_qr_code_value(nested)
                if normalized:
                    return normalized
        for nested in value.values():
            if isinstance(nested, (dict, list)):
                normalized = _normalize_qr_code_value(nested)
                if normalized:
                    return normalized
        return None
    if isinstance(value, list):
        for item in value:
            normalized = _normalize_qr_code_value(item)
            if normalized:
                return normalized
        return None
    if isinstance(value, str):
        text = value.strip()
        return text or None
    return None


def _normalize_instance(raw: Any, fallback_name: str | None = None) -> dict[str, Any]:
    data = _unwrap_payload(raw)
    if not isinstance(data, dict):
        return {}

    instance_id = data.get("id") or data.get("instanceId") or data.get("instance_id")
    token = data.get("token") or data.get("instanceToken") or data.get("instance_token")
    name = data.get("name") or data.get("instanceName") or data.get("instance_name") or fallback_name
    connected = data.get("connected")
    logged_in = data.get("loggedIn") or data.get("logged_in")
    status = data.get("status") or data.get("state")
    if isinstance(status, str):
        status_map = {
            "connected": "open",
            "open": "open",
            "disconnected": "close",
            "closed": "close",
            "close": "close",
            "loggedout": "close",
            "logged_out": "close",
            "logout": "close",
            "qrcode": "connecting",
            "qr_code": "connecting",
            "pairing": "connecting",
            "connecting": "connecting",
        }
        status = status_map.get(status.lower(), status.lower())
    if not status:
        status = _instance_status_label(connected, logged_in)

    qrcode = data.get("qrcode") or data.get("Qrcode") or data.get("qrCode")
    webhook = data.get("webhook") or data.get("webhookUrl")

    normalized = {
        "id": instance_id,
        "instance_id": instance_id,
        "name": name,
        "instance_name": name,
        "token": token,
        "instance_token": token,
        "connected": connected,
        "loggedIn": logged_in,
        "status": status,
        "qrcode": qrcode,
        "webhook": webhook,
        "raw": data,
    }
    return normalized


def _normalize_instance_list(payload: Any) -> list[dict[str, Any]]:
    instances: list[dict[str, Any]] = []
    for item in _payload_list(payload):
        normalized = _normalize_instance(item)
        if normalized:
            instances.append(normalized)
    return instances


def _normalize_connection(payload: Any, fallback_name: str | None = None) -> dict[str, Any]:
    data = _unwrap_payload(payload)
    if not isinstance(data, dict):
        data = {}

    instance_data = data.get("instance") if isinstance(data.get("instance"), dict) else {}
    connected = data.get("Connected")
    if connected is None and isinstance(instance_data, dict):
        connected = instance_data.get("connected")
    if connected is None and isinstance(instance_data, dict):
        state_probe = str(instance_data.get("state") or "").lower()
        connected = state_probe in {"open", "connected"}
    logged_in = data.get("LoggedIn")
    if logged_in is None and isinstance(instance_data, dict):
        logged_in = instance_data.get("loggedIn")
    state = data.get("state") or data.get("status")
    if isinstance(instance_data, dict) and instance_data.get("state"):
        state = instance_data.get("state")
    if isinstance(state, str):
        state_map = {
            "connected": "open",
            "open": "open",
            "disconnected": "close",
            "closed": "close",
            "close": "close",
            "loggedout": "close",
            "logged_out": "close",
            "logout": "close",
            "qrcode": "connecting",
            "qr_code": "connecting",
            "pairing": "connecting",
            "connecting": "connecting",
        }
        state = state_map.get(state.lower(), state.lower())
    if not state:
        state = _instance_status_label(connected, logged_in)

    normalized_instance = {
        "state": state,
        "connected": connected,
        "loggedIn": logged_in,
        "name": data.get("Name") or data.get("name") or (instance_data.get("name") if isinstance(instance_data, dict) else None) or fallback_name,
        "jid": data.get("jid") or data.get("JID") or data.get("number") or data.get("phone"),
        "raw": data,
    }

    return {
        "state": state,
        "instance": normalized_instance,
        "connected": connected,
        "loggedIn": logged_in,
        "name": normalized_instance["name"],
        "jid": normalized_instance["jid"],
        "raw": data,
    }


def _normalize_qrcode(payload: Any) -> dict[str, Any]:
    data = _unwrap_payload(payload)
    if isinstance(data, str):
        qrcode = _normalize_qr_image_value(data)
        pairing_code = None
    else:
        if not isinstance(data, dict):
            data = {}
        qrcode = _normalize_qr_image_value(data)
        pairing_code = _normalize_qr_code_value(data)
    normalized = {
        "qr_code": qrcode,
        "base64": qrcode,
        "qrcode": {"base64": qrcode} if qrcode else {},
        "code": pairing_code,
        "pairing_code": pairing_code,
        "status": "READY" if qrcode else ("PAIRING_CODE" if pairing_code else "NOT_READY"),
        "raw": data,
    }
    return normalized


def _fetch_qrcode_once(instance_name: str, instance_id: str | None = None, instance_token: str | None = None) -> dict[str, Any]:
    with httpx.Client(timeout=QR_CODE_HTTP_TIMEOUT_SECONDS) as client:
        resp = client.get(
            f"{META}/instance/qr",
            headers=_send_headers(instance_id, instance_token),
        )
        if resp.status_code < 400:
            try:
                payload = resp.json()
            except Exception:
                payload = resp.text
            return _normalize_qrcode(payload)
        legacy_resp = client.get(
            f"{META}/instance/connect/{instance_name}",
            headers=_send_headers(None, instance_token),
        )
        if legacy_resp.status_code < 400:
            try:
                payload = legacy_resp.json()
            except Exception:
                payload = legacy_resp.text
            return _normalize_qrcode(payload)
        if legacy_resp.status_code not in {404, 204}:
            _handle_error(legacy_resp, "obter_qr_code")
        return {
            "qr_code": None,
            "base64": None,
            "qrcode": {},
            "code": None,
            "pairing_code": None,
            "status": "NOT_READY",
            "raw": {"status": "NOT_READY"},
        }


def _normalize_contact_entry(entry: dict[str, Any]) -> dict[str, Any]:
    jid = (
        entry.get("jid")
        or entry.get("JID")
        or entry.get("remoteJid")
        or entry.get("RemoteJID")
        or entry.get("id")
        or entry.get("query")
    )
    verified = entry.get("verifiedName") or entry.get("VerifiedName")
    push_name = entry.get("pushName") or entry.get("PushName") or entry.get("notify") or entry.get("Notify")
    name = entry.get("name") or entry.get("Name") or verified or push_name or jid
    return {
        "jid": jid,
        "remoteJid": entry.get("remoteJid") or entry.get("RemoteJID") or jid,
        "lid": entry.get("lid") or entry.get("LID") or entry.get("lidJid"),
        "name": name,
        "verifiedName": verified,
        "pushName": push_name,
        "notify": entry.get("notify") or entry.get("Notify") or push_name,
        "query": entry.get("query") or entry.get("Query") or jid,
        "isInWhatsapp": entry.get("isInWhatsapp") or entry.get("IsInWhatsapp"),
        "raw": entry,
    }


def _normalize_avatar(payload: Any) -> dict[str, Any]:
    data = _unwrap_payload(payload)
    if isinstance(data, dict):
        avatar = data.get("avatar") or data.get("Avatar") or data.get("url") or data.get("Url") or data.get("base64")
        mime = data.get("mimeType") or data.get("mimetype") or data.get("MimeType") or "image/jpeg"
        if isinstance(avatar, dict):
            avatar = avatar.get("base64") or avatar.get("url")
        return {
            "url": avatar if isinstance(avatar, str) and avatar.startswith("http") else None,
            "base64": avatar if isinstance(avatar, str) and not avatar.startswith("http") else None,
            "mime_type": mime,
            "raw": data,
        }
    if isinstance(data, str):
        return {"url": data if data.startswith("http") else None, "base64": data if not data.startswith("http") else None, "mime_type": "image/jpeg", "raw": data}
    return {}


def _normalize_group_entry(entry: dict[str, Any]) -> dict[str, Any]:
    participants = entry.get("participants") or entry.get("Participants") or []
    normalized_participants = []
    for participant in participants if isinstance(participants, list) else []:
        if not isinstance(participant, dict):
            continue
        jid = participant.get("jid") or participant.get("JID") or participant.get("id") or participant.get("remoteJid")
        phone_jid = participant.get("PhoneNumber") or participant.get("phoneNumber") or participant.get("phone_number") or ""
        normalized_participants.append(
            {
                "id": jid,
                "jid": jid,
                "phone_jid": str(phone_jid),
                "admin": participant.get("admin") or participant.get("Admin") or participant.get("isAdmin") or participant.get("IsAdmin"),
                "raw": participant,
            }
        )
    group_jid = entry.get("jid") or entry.get("JID") or entry.get("id") or entry.get("groupJid")
    subject = entry.get("subject") or entry.get("Subject") or entry.get("name") or entry.get("Name") or group_jid
    picture = entry.get("pictureUrl") or entry.get("PictureUrl") or entry.get("picture") or entry.get("Picture")
    return {
        "id": group_jid,
        "jid": group_jid,
        "subject": subject,
        "name": subject,
        "pictureUrl": picture,
        "participants": normalized_participants,
        "raw": entry,
    }


def _normalize_group_payload(payload: Any) -> dict[str, Any] | None:
    data = _unwrap_payload(payload)
    if isinstance(data, dict):
        return _normalize_group_entry(data)
    if isinstance(data, list) and data:
        first = data[0]
        if isinstance(first, dict):
            return _normalize_group_entry(first)
    return None


def _is_legacy_schema_error(resp: httpx.Response) -> bool:
    msg = _error_message(resp).lower()
    return any(
        token in msg
        for token in (
            "instancename",
            "integration",
            "unknown field",
            "missing field",
            "cannot unmarshal",
            "name",
        )
    )


def _is_duplicate_instance_error(resp: httpx.Response) -> bool:
    msg = _error_message(resp).lower()
    return resp.status_code in {400, 409, 422} and any(
        token in msg
        for token in (
            "already exists",
            "duplicate",
            "exists",
            "conflict",
        )
    )


def listar_instancias() -> list[dict[str, Any]]:
    """Lista instancias conhecidas pela Evolution."""
    def _call():
        with httpx.Client(timeout=30) as client:
            return client.get(f"{META}/instance/all", headers=HEADERS)
    resp = _retry_with_backoff(_call)
    if resp.status_code == 404:
        return []
    _handle_error(resp, "listar_instancias")
    return _normalize_instance_list(resp.json())

def obter_instancia(instance_name: str, instance_id: str | None = None) -> dict[str, Any] | None:
    """Busca uma instância pelo nome ou ID."""
    wanted_name = (instance_name or "").strip().lower()
    wanted_id = str(instance_id or "").strip()
    for instance in listar_instancias():
        current_name = str(instance.get("instance_name") or instance.get("name") or "").strip().lower()
        current_id = str(instance.get("instance_id") or instance.get("id") or "").strip()
        if wanted_id and current_id == wanted_id:
            return instance
        if wanted_name and current_name == wanted_name:
            return instance
    return None


def criar_instancia(instance_name: str, token: str | None = None, proxy: dict[str, Any] | None = None) -> dict[str, Any]:
    """Cria uma nova instância na Evolution Go."""
    instance_token = token or str(uuid.uuid4())
    body: dict[str, Any] = {"name": instance_name, "token": instance_token}
    if proxy:
        body["proxy"] = proxy

    with httpx.Client(timeout=30) as client:
        resp = client.post(f"{META}/instance/create", headers=_headers(None, instance_token), json=body)
        if resp.status_code < 400:
            normalized = _normalize_instance(resp.json(), fallback_name=instance_name)
            if not normalized.get("instance_id"):
                existing = obter_instancia(instance_name)
                if existing:
                    return existing
            if not normalized.get("instance_token"):
                normalized["instance_token"] = instance_token
                normalized["token"] = instance_token
            return normalized

        if _is_duplicate_instance_error(resp):
            existing = obter_instancia(instance_name)
            if existing:
                return existing

        if _is_legacy_schema_error(resp):
            legacy_resp = client.post(
                f"{META}/instance/create",
                headers=_headers(None, instance_token),
                json={"instanceName": instance_name, "integration": "WHATSAPP-BAILEYS"},
            )
            if legacy_resp.status_code < 400:
                normalized = _normalize_instance(legacy_resp.json(), fallback_name=instance_name)
                if not normalized.get("instance_token"):
                    normalized["instance_token"] = instance_token
                    normalized["token"] = instance_token
                if not normalized.get("instance_id"):
                    existing = obter_instancia(instance_name)
                    if existing:
                        return existing
                return normalized
            if _is_duplicate_instance_error(legacy_resp):
                existing = obter_instancia(instance_name)
                if existing:
                    return existing
            _handle_error(legacy_resp, "criar_instancia (legacy)")

        _handle_error(resp, "criar_instancia")


def deletar_instancia(instance_name: str, instance_id: str | None = None, instance_token: str | None = None) -> dict[str, Any]:
    """Deleta uma instância na Evolution."""
    existing = obter_instancia(instance_name)
    resolved_instance_id = instance_id or (str(existing.get("instance_id")) if existing and existing.get("instance_id") else None)
    target = resolved_instance_id or instance_name
    with httpx.Client(timeout=30) as client:
        resp = client.delete(
            f"{META}/instance/delete/{target}",
            headers=_headers(resolved_instance_id, instance_token),
        )
        if resp.status_code == 404:
            logger.warning("[evolution] instância %s não encontrada para deletar", target)
            return {"status": "NOT_FOUND"}
        if resp.status_code < 400:
            data = _json_or_text(resp)
            return data if isinstance(data, dict) else {"status": "OK", "data": data}
        if target != instance_name:
            legacy_resp = client.delete(
                f"{META}/instance/delete/{instance_name}",
                headers=_headers(resolved_instance_id, instance_token),
            )
            if legacy_resp.status_code == 404:
                return {"status": "NOT_FOUND"}
            _handle_error(legacy_resp, "deletar_instancia (legacy)")
            return _json_or_text(legacy_resp)
        _handle_error(resp, "deletar_instancia")


def desconectar_instancia(instance_name: str, instance_id: str | None = None, instance_token: str | None = None) -> dict[str, Any]:
    """Desconecta a instância sem removê-la."""
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{META}/instance/disconnect",
            headers=_headers(instance_id, instance_token),
        )
        if resp.status_code == 404:
            logger.warning("[evolution] instância %s não encontrada para desconectar", instance_name)
            return {"status": "NOT_FOUND"}
        if resp.status_code < 400:
            return _json_or_text(resp)

        legacy_resp = client.delete(
            f"{META}/instance/logout/{instance_name}",
            headers=_headers(None, instance_token),
        )
        if legacy_resp.status_code == 404:
            return {"status": "NOT_FOUND"}
        if legacy_resp.status_code == 400:
            logger.info("[evolution] instância %s não estava conectada para desconectar", instance_name)
            return {"status": "NOT_CONNECTED"}
        _handle_error(legacy_resp, "desconectar_instancia (legacy)")
        return _json_or_text(legacy_resp)


def logout_instancia(instance_name: str, instance_id: str | None = None, instance_token: str | None = None) -> dict[str, Any]:
    """Realiza logout completo da instância."""
    with httpx.Client(timeout=30) as client:
        resp = client.delete(
            f"{META}/instance/logout",
            headers=_headers(instance_id, instance_token),
        )
        if resp.status_code == 404:
            logger.warning("[evolution] instância %s não encontrada para logout", instance_name)
            return {"status": "NOT_FOUND"}
        if resp.status_code < 400:
            return _json_or_text(resp)

        legacy_resp = client.delete(
            f"{META}/instance/logout/{instance_name}",
            headers=_headers(None, instance_token),
        )
        if legacy_resp.status_code == 404:
            return {"status": "NOT_FOUND"}
        if legacy_resp.status_code == 400:
            logger.info("[evolution] instância %s não estava conectada para logout", instance_name)
            return {"status": "NOT_CONNECTED"}
        _handle_error(legacy_resp, "logout_instancia (legacy)")
        return _json_or_text(legacy_resp)


def estado_conexao(instance_name: str, instance_id: str | None = None, instance_token: str | None = None) -> dict[str, Any]:
    """Retorna o estado atual da conexão."""
    with httpx.Client(timeout=15) as client:
        resp = client.get(
            f"{META}/instance/status",
            headers=_headers(instance_id, instance_token),
        )
        if resp.status_code < 400:
            return _normalize_connection(resp.json(), fallback_name=instance_name)

        legacy_resp = client.get(
            f"{META}/instance/connectionState/{instance_name}",
            headers=_headers(None, instance_token),
        )
        if legacy_resp.status_code < 400:
            return _normalize_connection(legacy_resp.json(), fallback_name=instance_name)

    instance = obter_instancia(instance_name, instance_id=instance_id)
    if instance:
        status = str(instance.get("status") or "").lower()
        connected = instance.get("connected")
        logged_in = instance.get("loggedIn")
        if status in {"open", "connected"}:
            state = "open"
        elif status in {"connecting", "qrcode", "qr_code", "pairing"}:
            state = "connecting"
        elif status in {"close", "closed", "disconnected", "loggedout", "logged_out", "logout"}:
            state = "close"
        else:
            state = _instance_status_label(connected, logged_in, fallback=status or "close")
        return {
            "state": state,
            "instance": {
                "state": state,
                "connected": connected,
                "loggedIn": logged_in,
                "name": instance.get("instance_name") or instance.get("name") or instance_name,
                "jid": instance.get("jid") or instance.get("number") or instance.get("phone"),
                "raw": instance.get("raw") or instance,
            },
            "connected": connected,
            "loggedIn": logged_in,
            "name": instance.get("instance_name") or instance.get("name") or instance_name,
            "jid": instance.get("jid") or instance.get("number") or instance.get("phone"),
            "raw": instance.get("raw") or instance,
        }

    _handle_error(legacy_resp, "estado_conexao")
    return _normalize_connection(legacy_resp.json(), fallback_name=instance_name)


def obter_qr_code(
    instance_name: str,
    instance_id: str | None = None,
    instance_token: str | None = None,
    *,
    retries: int = QR_CODE_RETRIES,
) -> dict[str, Any]:
    """Solicita o QR code para conexão."""
    attempts = max(1, int(retries))
    delay = QR_CODE_BASE_DELAY_SECONDS
    last_result: dict[str, Any] = {
        "qr_code": None,
        "base64": None,
        "qrcode": {},
        "code": None,
        "pairing_code": None,
        "status": "NOT_READY",
        "raw": {},
    }

    for attempt in range(attempts):
        result = _fetch_qrcode_once(instance_name, instance_id=instance_id, instance_token=instance_token)
        if result.get("qr_code") or result.get("base64") or result.get("pairing_code") or result.get("code"):
            return result
        last_result = result
        if attempt < attempts - 1:
            logger.info(
                "[evolution] QR ainda indisponível para %s (tentativa %d/%d)",
                instance_name,
                attempt + 1,
                attempts,
            )
            _time.sleep(delay)
            delay = min(delay * 1.5, QR_CODE_MAX_DELAY_SECONDS)

    return last_result


def _connect_instance(
    instance_name: str,
    webhook_url: str,
    *,
    instance_id: str | None = None,
    instance_token: str | None = None,
    subscribe: list[str] | None = None,
    immediate: bool = True,
    phone: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "webhookUrl": webhook_url,
        "subscribe": subscribe or DEFAULT_SUBSCRIBE_EVENTS,
        "immediate": immediate,
    }
    if phone:
        body["phone"] = phone

    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{META}/instance/connect",
            headers=_send_headers(instance_id, instance_token),
            json=body,
        )
        if resp.status_code < 400:
            data = _json_or_text(resp)
            if isinstance(data, dict):
                return data
            return {"status": "OK", "data": data}

        legacy_resp = client.post(
            f"{META}/webhook/set/{instance_name}",
            headers=_send_headers(None, instance_token),
            json={
                "webhook": {
                    "enabled": True,
                    "url": webhook_url,
                    "events": [
                        "CONNECTION_UPDATE",
                        "MESSAGES_UPSERT",
                        "MESSAGES_UPDATE",
                    ],
                }
            },
        )
        if legacy_resp.status_code == 404:
            return {"status": "NOT_FOUND"}
        _handle_error(legacy_resp, "configurar_webhook")
        return _json_or_text(legacy_resp)


def conectar_instancia(
    instance_name: str,
    webhook_url: str,
    *,
    instance_id: str | None = None,
    instance_token: str | None = None,
    subscribe: list[str] | None = None,
    immediate: bool = True,
    phone: str | None = None,
) -> dict[str, Any]:
    """Inicia a conexão da instância, já configurando o webhook novo."""
    return _connect_instance(
        instance_name,
        webhook_url,
        instance_id=instance_id,
        instance_token=instance_token,
        subscribe=subscribe,
        immediate=immediate,
        phone=phone,
    )


def configurar_webhook(
    instance_name: str,
    webhook_url: str,
    *,
    instance_id: str | None = None,
    instance_token: str | None = None,
    subscribe: list[str] | None = None,
    immediate: bool = False,
    phone: str | None = None,
) -> dict[str, Any]:
    """Configura o webhook da instância na Evolution Go."""
    return _connect_instance(
        instance_name,
        webhook_url,
        instance_id=instance_id,
        instance_token=instance_token,
        subscribe=subscribe,
        immediate=immediate,
        phone=phone,
    )


def remover_webhook(instance_name: str, instance_id: str | None = None, instance_token: str | None = None) -> dict[str, Any]:
    """Remove o webhook da instância."""
    with httpx.Client(timeout=15) as client:
        resp = client.delete(
            f"{META}/webhook/delete/{instance_name}",
            headers=_headers(instance_id, instance_token),
        )
        if resp.status_code == 404:
            return {"status": "NOT_FOUND"}
        _handle_error(resp, "remover_webhook")
        return _json_or_text(resp)


def baixar_midia(instance_name: str, message_id: str, instance_id: str | None = None, instance_token: str | None = None) -> dict[str, Any]:
    """Baixa mídia da Evolution por ID de mensagem."""
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{META}/message/getBase64FromMediaMessage/{instance_name}",
            headers=_headers(instance_id, instance_token),
            json={
                "message": {
                    "key": {"id": message_id},
                }
            },
        )
        if resp.status_code == 404:
            logger.warning("[evolution] mídia não encontrada para msg_id=%s", message_id)
            return {"found": False}
        _handle_error(resp, f"baixar_midia {message_id}")
        data = _json_or_text(resp)
        if not isinstance(data, dict):
            return {"found": False}
        return {
            "found": True,
            "base64": data.get("base64"),
            "mimetype": data.get("mimetype") or data.get("mimeType"),
            "file_length": data.get("fileLength") or data.get("file_length"),
            "caption": data.get("caption"),
            "raw": data,
        }


def enviar_mensagem_texto(
    instance_name: str,
    numero: str,
    texto: str,
    instance_id: str | None = None,
    instance_token: str | None = None,
) -> dict[str, Any]:
    """Envia mensagem de texto via Evolution Go."""
    body = {
        "number": numero,
        "text": texto,
        "id": str(uuid.uuid4()),
    }
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{META}/send/text",
            headers=_send_headers(instance_id, instance_token),
            json=body,
        )
        _handle_error(resp, "enviar_mensagem_texto")
        return _json_or_text(resp)


def enviar_mensagem_midia(
    instance_name: str,
    numero: str,
    tipo: str,
    media_url: str,
    caption: str | None = None,
    file_name: str | None = None,
    instance_id: str | None = None,
    instance_token: str | None = None,
) -> dict[str, Any]:
    """Envia mensagem de mídia via Evolution Go."""
    body: dict[str, Any] = {
        "number": numero,
        "url": media_url,
        "type": tipo,
        "id": str(uuid.uuid4()),
    }
    if caption:
        body["caption"] = caption
    if file_name:
        body["filename"] = file_name

    with httpx.Client(timeout=120) as client:
        resp = client.post(
            f"{META}/send/media",
            headers=_send_headers(instance_id, instance_token),
            json=body,
        )
        if resp.status_code < 400:
            return _json_or_text(resp)

        endpoint_map = {
            "image": "/message/sendImage/{instance}",
            "audio": "/message/sendAudio/{instance}",
            "video": "/message/sendVideo/{instance}",
            "document": "/message/sendDocument/{instance}",
        }
        endpoint = endpoint_map.get(tipo, "/message/sendMedia/{instance}")
        endpoint = endpoint.replace("{instance}", instance_name)

        legacy_body: dict[str, Any] = {"number": numero, "media": media_url}
        if caption:
            legacy_body["caption"] = caption
        if file_name and tipo == "document":
            legacy_body["fileName"] = file_name

        legacy_resp = client.post(f"{META}{endpoint}", headers=_headers(None, instance_token), json=legacy_body)
        _handle_error(legacy_resp, f"enviar_mensagem_midia {tipo}")
        return _json_or_text(legacy_resp)


def enviar_template_hsm(
    instance_name: str,
    numero: str,
    template_name: str,
    language: str = "pt_BR",
    components: list | None = None,
    instance_id: str | None = None,
    instance_token: str | None = None,
) -> dict[str, Any]:
    """Envia template HSM via a rota legada, com fallback compatível."""
    body: dict[str, Any] = {
        "number": numero,
        "template": template_name,
        "language": language,
    }
    if components:
        body["components"] = components

    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{META}/message/sendTemplate/{instance_name}",
            headers=_send_headers(instance_id, instance_token),
            json=body,
        )
        _handle_error(resp, f"enviar_template_hsm {template_name}")
        return _json_or_text(resp)


# ── Enriquecimento de contatos e grupos ───────────────────────────────


def buscar_contato(instance_name: str, jid: str) -> list[dict[str, Any]]:
    """Busca contato(s) sincronizados na instância. Retorna lista vazia se não encontrar."""
    digits = "".join(ch for ch in str(jid or "") if ch.isdigit())
    candidate = digits or str(jid or "")

    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(
                f"{META}/user/check",
                headers=HEADERS,
                json={"number": [candidate]},
            )
            if resp.status_code < 400:
                data = _json_or_text(resp)
                contacts = _payload_list(data)
                if isinstance(data, dict) and isinstance(data.get("Users"), list):
                    contacts = data.get("Users")
                normalized = []
                for item in contacts:
                    if isinstance(item, dict):
                        normalized.append(_normalize_contact_entry(item))
                if normalized:
                    return normalized

            legacy_resp = client.post(
                f"{META}/chat/findContacts/{instance_name}",
                headers=HEADERS,
                json={"where": {"id": jid}},
            )
            if legacy_resp.status_code == 404:
                return []
            _handle_error(legacy_resp, f"buscar_contato {jid}")
            data = _json_or_text(legacy_resp)
            if isinstance(data, list):
                return [_normalize_contact_entry(item) for item in data if isinstance(item, dict)]
            if isinstance(data, dict):
                return [_normalize_contact_entry(data)] if data else []
            return []
    except Exception:
        logger.exception("[evolution] buscar_contato falhou: instance=%s jid=%s", instance_name, jid)
        return []


def buscar_foto_perfil(
    instance_name: str,
    numero: str,
    *,
    token: str | None = None,
    raise_on_transient: bool = False,
) -> dict[str, Any] | str | None:
    """Busca a foto de perfil do contato.

    Retorna dict ({url|base64|mime_type}) ou str (url) quando há foto, ou ``None``
    quando o contato não tem foto (HTTP 404 — resposta definitiva).

    Com ``raise_on_transient=True``, erros transitórios/de config (timeout, rede,
    401, 5xx) **levantam exceção** em vez de virarem ``None``. Assim o job de avatar
    distingue "sem foto" de "falha" e re-tenta sem gravar ``avatar_fetched_at``
    (que envenenaria o contato por 7 dias). O comportamento default (False) mantém
    a semântica antiga: qualquer falha vira ``None``.
    """
    digits = "".join(ch for ch in str(numero or "") if ch.isdigit())
    candidate = digits or str(numero or "")
    headers = {"apikey": token, "Content-Type": "application/json"} if token else HEADERS

    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(
                f"{META}/user/avatar",
                headers=headers,
                json={"number": candidate, "preview": True},
            )
            if resp.status_code < 400:
                return _normalize_avatar(resp.json())
            if resp.status_code == 404:
                return None

            legacy_resp = client.post(
                f"{META}/chat/fetchProfilePictureUrl/{instance_name}",
                headers=headers,
                json={"number": candidate},
            )
            if legacy_resp.status_code == 404:
                return None
            if legacy_resp.status_code >= 400:
                # Ambos endpoints falharam (ex.: 401 token inválido, 5xx) — não é
                # "sem foto"; tratar como transitório quando o chamador pedir.
                if raise_on_transient:
                    raise EvolutionError(
                        f"buscar_foto_perfil {numero}: user/avatar={resp.status_code} legacy={legacy_resp.status_code}"
                    )
                _handle_error(legacy_resp, f"buscar_foto_perfil {numero}")
            data = _json_or_text(legacy_resp)
            if isinstance(data, dict):
                return data.get("profilePictureUrl") or data.get("url") or None
            if isinstance(data, str):
                return data
            return None
    except Exception:
        logger.exception("[evolution] buscar_foto_perfil falhou: instance=%s numero=%s", instance_name, numero)
        if raise_on_transient:
            raise
        return None


def buscar_grupo(instance_name: str, group_jid: str, *, token: str | None = None) -> dict[str, Any] | None:
    """Busca informações de um grupo pelo JID."""
    headers = {"apikey": token, "Content-Type": "application/json"} if token else HEADERS
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(
                f"{META}/group/info",
                headers=headers,
                json={"groupJid": group_jid},
            )
            if resp.status_code < 400:
                group = _normalize_group_payload(resp.json())
                if group:
                    return group
            if resp.status_code == 404:
                return None

            legacy_resp = client.get(
                f"{META}/group/findGroupInfos/{instance_name}",
                headers=headers,
                params={"groupJid": group_jid},
            )
            if legacy_resp.status_code == 404:
                return None
            _handle_error(legacy_resp, f"buscar_grupo {group_jid}")
            return _normalize_group_payload(legacy_resp.json())
    except Exception:
        logger.exception("[evolution] buscar_grupo falhou: instance=%s group=%s", instance_name, group_jid)
        return None


def listar_participantes_grupo(instance_name: str, group_jid: str) -> list[dict[str, Any]]:
    """Lista participantes de um grupo."""
    grupo = buscar_grupo(instance_name, group_jid)
    if grupo:
        participants = grupo.get("participants", [])
        if isinstance(participants, list) and participants:
            return participants

    try:
        with httpx.Client(timeout=15) as client:
            resp = client.get(
                f"{META}/group/participants/{instance_name}",
                headers=HEADERS,
                params={"groupJid": group_jid},
            )
            if resp.status_code == 404:
                return []
            _handle_error(resp, f"listar_participantes_grupo {group_jid}")
            data = _json_or_text(resp)
            participants = data.get("participants", []) if isinstance(data, dict) else []
            normalized = []
            for item in participants if isinstance(participants, list) else []:
                if not isinstance(item, dict):
                    continue
                jid = item.get("id") or item.get("jid") or item.get("JID")
                normalized.append({"id": jid, "jid": jid, "admin": item.get("admin") or item.get("isAdmin") or item.get("IsAdmin"), "raw": item})
            return normalized
    except Exception:
        logger.exception("[evolution] listar_participantes_grupo falhou: instance=%s group=%s", instance_name, group_jid)
        return []
