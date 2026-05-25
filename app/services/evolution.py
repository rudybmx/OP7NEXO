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


class EvolutionError(Exception):
    pass


def _json_or_text(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except Exception:
        return {"message": resp.text}


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
    if not isinstance(data, dict):
        data = {}

    qrcode = (
        data.get("qrcode")
        or data.get("Qrcode")
        or data.get("qrCode")
        or data.get("base64")
        or data.get("code")
    )
    if isinstance(qrcode, dict):
        qrcode = qrcode.get("base64") or qrcode.get("qrcode") or qrcode.get("code")

    code = data.get("code") or data.get("Code")
    normalized = {
        "base64": qrcode,
        "qrcode": {"base64": qrcode} if qrcode else {},
        "code": code,
        "raw": data,
    }
    return normalized


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
        normalized_participants.append(
            {
                "id": jid,
                "jid": jid,
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
    """Lista instâncias conhecidas pela Evolution."""
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{META}/instance/all", headers=HEADERS)
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
        _handle_error(legacy_resp, "estado_conexao")
        return _normalize_connection(legacy_resp.json(), fallback_name=instance_name)


def obter_qr_code(instance_name: str, instance_id: str | None = None, instance_token: str | None = None) -> dict[str, Any]:
    """Solicita o QR code para conexão."""
    with httpx.Client(timeout=30) as client:
        resp = client.get(
            f"{META}/instance/qr",
            headers=_headers(instance_id, instance_token),
        )
        if resp.status_code < 400:
            return _normalize_qrcode(resp.json())

        legacy_resp = client.get(
            f"{META}/instance/connect/{instance_name}",
            headers=_headers(None, instance_token),
        )
        _handle_error(legacy_resp, "obter_qr_code")
        return _normalize_qrcode(legacy_resp.json())


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
            headers=_headers(instance_id, instance_token),
            json=body,
        )
        if resp.status_code < 400:
            data = _json_or_text(resp)
            if isinstance(data, dict):
                return data
            return {"status": "OK", "data": data}

        legacy_resp = client.post(
            f"{META}/webhook/set/{instance_name}",
            headers=_headers(None, instance_token),
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
            headers=_headers(instance_id, instance_token),
            json=body,
        )
        if resp.status_code < 400:
            return _json_or_text(resp)

        legacy_resp = client.post(
            f"{META}/message/sendText/{instance_name}",
            headers=_headers(None, instance_token),
            json={"number": numero, "text": texto},
        )
        _handle_error(legacy_resp, "enviar_mensagem_texto")
        return _json_or_text(legacy_resp)


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
            headers=_headers(instance_id, instance_token),
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
            headers=_headers(instance_id, instance_token),
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


def buscar_foto_perfil(instance_name: str, numero: str) -> dict[str, Any] | str | None:
    """Busca a foto de perfil do contato."""
    digits = "".join(ch for ch in str(numero or "") if ch.isdigit())
    candidate = digits or str(numero or "")

    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(
                f"{META}/user/avatar",
                headers=HEADERS,
                json={"number": candidate, "preview": True},
            )
            if resp.status_code < 400:
                return _normalize_avatar(resp.json())
            if resp.status_code == 404:
                return None

            legacy_resp = client.post(
                f"{META}/chat/fetchProfilePictureUrl/{instance_name}",
                headers=HEADERS,
                json={"number": candidate},
            )
            if legacy_resp.status_code == 404:
                return None
            _handle_error(legacy_resp, f"buscar_foto_perfil {numero}")
            data = _json_or_text(legacy_resp)
            if isinstance(data, dict):
                return data.get("profilePictureUrl") or data.get("url") or None
            if isinstance(data, str):
                return data
            return None
    except Exception:
        logger.exception("[evolution] buscar_foto_perfil falhou: instance=%s numero=%s", instance_name, numero)
        return None


def buscar_grupo(instance_name: str, group_jid: str) -> dict[str, Any] | None:
    """Busca informações de um grupo pelo JID."""
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(
                f"{META}/group/info",
                headers=HEADERS,
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
                headers=HEADERS,
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
