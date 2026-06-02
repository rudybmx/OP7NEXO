from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.models.canal_entrada import CanalEntrada

logger = logging.getLogger(__name__)

HELENA_CHAT_DEFAULT_BASE_URL = "https://api.helena.run/chat"
HELENA_CHAT_SEND_PATH = "/v1/message/send"
HELENA_CHAT_SESSION_PATH = "/v2/session"


class HelenaChatError(Exception):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _get_field(container: Any, key: str) -> Any:
    if isinstance(container, dict):
        return container.get(key)
    return getattr(container, key, None)


def _has_any_field(container: Any, keys: tuple[str, ...]) -> bool:
    if isinstance(container, dict):
        return any(key in container for key in keys)
    return any(hasattr(container, key) for key in keys)


def _resolve_config_container(source: CanalEntrada | dict[str, Any] | Any) -> Any:
    if isinstance(source, CanalEntrada):
        config = source.config
        if config is not None:
            return config
        return {}

    if isinstance(source, dict):
        if _has_any_field(source, ("webhook", "api_token_ref", "api_base_url", "from_phone", "helena")):
            return source
        nested_config = source.get("config")
        if nested_config is not None:
            return nested_config
        return {}

    config = getattr(source, "config", None)
    if config is not None:
        return config

    if _has_any_field(source, ("webhook", "api_token_ref", "api_base_url", "from_phone", "helena")):
        return source

    return {}


def _webhook_config(source: CanalEntrada | dict[str, Any] | Any) -> Any:
    config = _resolve_config_container(source)
    webhook = _get_field(config, "webhook")
    if webhook is not None:
        return webhook

    if _has_any_field(config, ("api_token_ref", "api_base_url", "from_phone", "helena")):
        return config

    return {}


def _helena_config(source: CanalEntrada | dict[str, Any] | Any) -> Any:
    webhook = _webhook_config(source)
    helena = _get_field(webhook, "helena")
    if helena is not None:
        return helena
    if _has_any_field(webhook, ("api_token_ref", "api_base_url", "from_phone")):
        return webhook
    return {}


def _normalize_phone(value: Any) -> str | None:
    if value is None:
        return None

    digits = "".join(ch for ch in str(value) if ch.isdigit())
    if not digits:
        return None
    return f"+{digits}"


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
                value = response.get(key)
                if value:
                    return str(value)
        for key in ("message", "error", "detail"):
            value = data.get(key)
            if value:
                return str(value)
    return resp.text


def _handle_error(resp: httpx.Response, ctx: str) -> None:
    if resp.status_code < 400:
        return
    message = _error_message(resp)
    logger.error("[helena-chat] %s — HTTP %s: %s", ctx, resp.status_code, message)
    raise HelenaChatError(f"{ctx}: {message}", status_code=502)


def _resolve_api_token(source: CanalEntrada | dict[str, Any]) -> tuple[str, str]:
    helena = _helena_config(source)
    token_ref = str(_get_field(helena, "api_token_ref") or "").strip()
    if not token_ref:
        raise HelenaChatError("Canal sem config.webhook.helena.api_token_ref", status_code=400)

    token = os.getenv(token_ref)
    if token is None or not str(token).strip():
        raise HelenaChatError(
            f"Variável de ambiente '{token_ref}' não configurada para este canal",
            status_code=503,
        )

    return token_ref, str(token).strip()


def _resolve_api_base_url(source: CanalEntrada | dict[str, Any]) -> str:
    helena = _helena_config(source)
    base_url = str(
        _get_field(helena, "api_base_url")
        or HELENA_CHAT_DEFAULT_BASE_URL
    ).strip()
    return base_url.rstrip("/")


def resolve_from_phone(source: CanalEntrada | dict[str, Any]) -> str:
    helena = _helena_config(source)
    from_phone = _normalize_phone(_get_field(helena, "from_phone"))
    if not from_phone:
        raise HelenaChatError("Canal sem config.webhook.helena.from_phone", status_code=400)
    return from_phone


def normalize_status(raw_status: Any) -> tuple[str | None, str | None]:
    if raw_status is None:
        return None, None

    status_raw = str(raw_status).strip()
    if not status_raw:
        return None, None

    status_upper = status_raw.upper()
    wa_map = {
        "PROCESSING": "processing",
        "SAVED": "saved",
        "QUEUED": "queued",
        "SENT": "sent",
        "DELIVERED": "delivered",
        "READ": "read",
        "FAILED": "failed",
    }
    human_map = {
        "PROCESSING": "processando",
        "SAVED": "salva",
        "QUEUED": "na_fila",
        "SENT": "enviada",
        "DELIVERED": "entregue",
        "READ": "lida",
        "FAILED": "falha",
    }
    return wa_map.get(status_upper, status_raw.lower()), human_map.get(status_upper, status_raw.lower())


def send_text_message(
    canal: CanalEntrada,
    *,
    to_phone: str,
    text: str,
    ref_id: str | None = None,
    timeout: float = 60.0,
) -> dict[str, Any]:
    token_ref, token = _resolve_api_token(canal)
    base_url = _resolve_api_base_url(canal)
    from_phone = resolve_from_phone(canal)
    normalized_to = _normalize_phone(to_phone)
    if not normalized_to:
        raise HelenaChatError("Número de destino inválido para Helena Chat", status_code=400)

    body: dict[str, Any] = {
        "from": from_phone,
        "to": normalized_to,
        "body": {"text": text},
    }
    if ref_id:
        body["refId"] = ref_id

    headers = {
        "Authorization": token,
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=timeout) as client:
        try:
            resp = client.post(
                f"{base_url}{HELENA_CHAT_SEND_PATH}",
                headers=headers,
                json=body,
            )
        except httpx.HTTPError as exc:
            raise HelenaChatError(f"Falha ao chamar Helena Chat: {exc}", status_code=502) from exc

    _handle_error(resp, "enviar_mensagem_texto")

    data = _json_or_text(resp)
    if not isinstance(data, dict):
        raise HelenaChatError("Resposta inválida da Helena Chat", status_code=502)

    message_id = str(data.get("id") or "").strip()
    if not message_id:
        raise HelenaChatError("Resposta da Helena Chat sem campo 'id'", status_code=502)

    normalized_status, status_label = normalize_status(data.get("status"))
    return {
        "provider": "helena_chat",
        "provider_token_ref": token_ref,
        "provider_message_id": message_id,
        "provider_session_id": str(data.get("sessionId") or "").strip() or None,
        "provider_status": str(data.get("status") or "").strip() or None,
        "provider_status_normalized": normalized_status,
        "provider_status_label": status_label,
        "provider_status_url": str(data.get("statusUrl") or "").strip() or None,
        "provider_failure_reason": str(data.get("failureReason") or "").strip() or None,
        "raw": data,
    }


def get_helena_session_by_id(
    source: CanalEntrada | dict[str, Any],
    session_id: str,
    *,
    timeout: float = 10.0,
) -> dict[str, Any]:
    session_id_clean = str(session_id or "").strip()
    if not session_id_clean:
        raise HelenaChatError("session_id inválido para consulta de sessão Helena", status_code=400)

    token_ref, token = _resolve_api_token(source)
    base_url = _resolve_api_base_url(source)
    url = f"{base_url}{HELENA_CHAT_SESSION_PATH}/{session_id_clean}"
    headers = {
        "Authorization": token,
        "Content-Type": "application/json",
    }
    params = [
        ("includeDetails", "ContactDetails"),
        ("includeDetails", "ChannelTypeDetails"),
        ("includeDetails", "ClassificationDetails"),
    ]

    with httpx.Client(timeout=timeout) as client:
        try:
            resp = client.get(url, headers=headers, params=params)
        except httpx.TimeoutException as exc:
            raise HelenaChatError(
                f"Timeout ao consultar sessão Helena {session_id_clean}",
                status_code=504,
            ) from exc
        except httpx.HTTPError as exc:
            raise HelenaChatError(
                f"Falha ao consultar sessão Helena {session_id_clean}: {exc}",
                status_code=502,
            ) from exc

    if resp.status_code == 404:
        raise HelenaChatError(
            f"Sessão Helena {session_id_clean} não encontrada",
            status_code=404,
        )

    if resp.status_code >= 400:
        message = _error_message(resp)
        logger.warning(
            "[helena-chat] consultar_sessao session_id=%s token_ref=%s — HTTP %s: %s",
            session_id_clean,
            token_ref,
            resp.status_code,
            message,
        )
        raise HelenaChatError(
            f"consultar_sessao: {message}",
            status_code=resp.status_code if resp.status_code < 500 else 502,
        )

    data = _json_or_text(resp)
    if not isinstance(data, dict):
        raise HelenaChatError("Resposta inválida da Helena Session API", status_code=502)

    return data
