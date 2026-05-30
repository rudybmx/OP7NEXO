from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.models.canal_entrada import CanalEntrada

logger = logging.getLogger(__name__)

HELENA_CHAT_DEFAULT_BASE_URL = "https://api.helena.run/chat"
HELENA_CHAT_SEND_PATH = "/v1/message/send"


class HelenaChatError(Exception):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _webhook_config(canal: CanalEntrada) -> dict[str, Any]:
    config = canal.config or {}
    webhook = config.get("webhook")
    return webhook if isinstance(webhook, dict) else {}


def _helena_config(canal: CanalEntrada) -> dict[str, Any]:
    webhook = _webhook_config(canal)
    helena = webhook.get("helena")
    return helena if isinstance(helena, dict) else {}


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


def _resolve_api_token(canal: CanalEntrada) -> tuple[str, str]:
    helena = _helena_config(canal)
    token_ref = str(helena.get("api_token_ref") or "").strip()
    if not token_ref:
        raise HelenaChatError("Canal sem config.webhook.helena.api_token_ref", status_code=400)

    token = os.getenv(token_ref)
    if token is None or not str(token).strip():
        raise HelenaChatError(
            f"Variável de ambiente '{token_ref}' não configurada para este canal",
            status_code=503,
        )

    return token_ref, str(token).strip()


def _resolve_api_base_url(canal: CanalEntrada) -> str:
    helena = _helena_config(canal)
    base_url = str(
        helena.get("api_base_url")
        or HELENA_CHAT_DEFAULT_BASE_URL
    ).strip()
    return base_url.rstrip("/")


def resolve_from_phone(canal: CanalEntrada) -> str:
    helena = _helena_config(canal)
    from_phone = _normalize_phone(helena.get("from_phone"))
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
        "Authorization": f"Bearer {token}",
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
