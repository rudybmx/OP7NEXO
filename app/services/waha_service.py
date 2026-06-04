"""Cliente HTTP para WAHA Plus API."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = 15.0
OP7_WAHA_WEBHOOK_EVENTS = ["message", "message.any", "message.ack", "session.status"]

# Mapeamento de status WAHA → connection_status interno
STATUS_MAP: dict[str, str] = {
    "STOPPED": "disconnected",
    "FAILED": "disconnected",
    "STARTING": "connecting",
    "SCAN_QR_CODE": "connecting",
    "WORKING": "connected",
}


class WahaError(Exception):
    pass


def _extract_profile_picture_url(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None

    for key in ("profilePictureURL", "url", "picture", "profile_picture_url"):
        value = payload.get(key)
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned:
                return cleaned
    return None


def _headers(cfg: dict) -> tuple[str, dict[str, str]]:
    """Retorna (base_url, headers) a partir do config do canal."""
    base_url = str(cfg.get("api_base_url", "")).rstrip("/")
    api_key_ref = cfg.get("api_key_ref", "")
    if not base_url:
        raise WahaError("config.waha.api_base_url não configurada")
    api_key = os.getenv(api_key_ref, "")
    if not api_key:
        raise WahaError(f"Env var '{api_key_ref}' não encontrada ou vazia")
    return base_url, {"X-Api-Key": api_key, "Content-Type": "application/json"}


def estado_sessao(session: str, cfg: dict) -> dict[str, Any]:
    """GET /api/sessions/{session}"""
    base_url, headers = _headers(cfg)
    try:
        resp = httpx.get(f"{base_url}/api/sessions/{session}", headers=headers, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        raise WahaError(
            f"WAHA sessions/{session}: {exc.response.status_code} {exc.response.text[:200]}"
        ) from exc
    except httpx.RequestError as exc:
        raise WahaError(f"WAHA sessions/{session}: {exc}") from exc


def criar_sessao(session: str, cfg: dict) -> dict[str, Any]:
    """POST /api/sessions — cria sessão. 422 = já existe (ignorado)."""
    base_url, headers = _headers(cfg)
    try:
        resp = httpx.post(
            f"{base_url}/api/sessions",
            headers=headers,
            json={"name": session, "config": {}},
            timeout=_TIMEOUT,
        )
        if resp.status_code == 422:
            return {"name": session, "status": "existing"}
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        raise WahaError(
            f"WAHA POST sessions: {exc.response.status_code} {exc.response.text[:200]}"
        ) from exc
    except httpx.RequestError as exc:
        raise WahaError(f"WAHA POST sessions: {exc}") from exc


def iniciar_sessao(session: str, cfg: dict) -> dict[str, Any]:
    """POST /api/sessions/{session}/start"""
    base_url, headers = _headers(cfg)
    try:
        resp = httpx.post(
            f"{base_url}/api/sessions/{session}/start",
            headers=headers,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except httpx.HTTPStatusError as exc:
        raise WahaError(
            f"WAHA sessions/{session}/start: {exc.response.status_code} {exc.response.text[:200]}"
        ) from exc
    except httpx.RequestError as exc:
        raise WahaError(f"WAHA sessions/{session}/start: {exc}") from exc


def configurar_webhook(session: str, webhook_url: str, cfg: dict) -> dict[str, Any]:
    """PUT /api/sessions/{session} — faz upsert do webhook OP7NEXO da sessão."""
    base_url, headers = _headers(cfg)
    current_config: dict[str, Any] = {}
    try:
        state = estado_sessao(session, cfg)
        current_config = state.get("config") if isinstance(state.get("config"), dict) else {}
    except WahaError:
        current_config = {}

    webhooks = current_config.get("webhooks")
    if not isinstance(webhooks, list):
        webhooks = []

    webhook_path = "/webhook/waha/"
    updated = False
    next_webhooks: list[dict[str, Any]] = []
    for item in webhooks:
        if not isinstance(item, dict):
            next_webhooks.append(item)
            continue
        item_url = str(item.get("url") or "")
        if webhook_path in item_url:
            next_item = {**item, "url": webhook_url, "events": OP7_WAHA_WEBHOOK_EVENTS}
            next_webhooks.append(next_item)
            updated = True
        else:
            next_webhooks.append(item)

    if not updated:
        next_webhooks.append({"url": webhook_url, "events": OP7_WAHA_WEBHOOK_EVENTS})

    next_config = {**current_config, "webhooks": next_webhooks}
    body = {
        "config": next_config
    }
    try:
        resp = httpx.put(
            f"{base_url}/api/sessions/{session}",
            headers=headers,
            json=body,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except httpx.HTTPStatusError as exc:
        raise WahaError(
            f"WAHA PUT sessions/{session}: {exc.response.status_code} {exc.response.text[:200]}"
        ) from exc
    except httpx.RequestError as exc:
        raise WahaError(f"WAHA PUT sessions/{session}: {exc}") from exc


def obter_qr(session: str, cfg: dict) -> dict[str, Any] | None:
    """GET /api/{session}/auth/qr
    WAHA Plus retorna PNG binário (image/png); versões mais antigas retornam JSON.
    Normaliza sempre para {'data': '<base64>'}.
    """
    import base64 as _b64
    base_url, headers = _headers(cfg)
    try:
        resp = httpx.get(
            f"{base_url}/api/{session}/auth/qr",
            headers=headers,
            timeout=_TIMEOUT,
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()

        content_type = resp.headers.get("content-type", "")
        # PNG detectado por Content-Type ou assinatura de bytes (magic bytes \x89PNG)
        if "image/" in content_type or resp.content[:4] == b"\x89PNG":
            return {"data": _b64.b64encode(resp.content).decode("ascii")}

        # Fallback: resposta JSON (versões antigas do WAHA)
        return resp.json()

    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return None
        raise WahaError(
            f"WAHA {session}/auth/qr: {exc.response.status_code} {exc.response.text[:200]}"
        ) from exc
    except httpx.RequestError as exc:
        raise WahaError(f"WAHA {session}/auth/qr: {exc}") from exc


def enviar_mensagem_texto(session: str, cfg: dict, chat_id: str, texto: str) -> dict[str, Any]:
    """POST /api/sendText — envia mensagem de texto via WAHA Plus."""
    base_url, headers = _headers(cfg)
    body = {"session": session, "chatId": chat_id, "text": texto}
    try:
        resp = httpx.post(
            f"{base_url}/api/sendText",
            headers=headers,
            json=body,
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except httpx.HTTPStatusError as exc:
        raise WahaError(
            f"WAHA sendText: {exc.response.status_code} {exc.response.text[:200]}"
        ) from exc
    except httpx.RequestError as exc:
        raise WahaError(f"WAHA sendText: {exc}") from exc


def baixar_midia(url: str, cfg: dict) -> tuple[bytes, str]:
    """GET autenticado para download de mídia WAHA. Retorna (conteúdo, content_type)."""
    _, headers = _headers(cfg)
    try:
        with httpx.Client(timeout=60, follow_redirects=True) as client:
            resp = client.get(url, headers={"X-Api-Key": headers["X-Api-Key"]})
            resp.raise_for_status()
            content_type = (
                resp.headers.get("content-type", "application/octet-stream")
                .split(";")[0]
                .strip()
            )
            return resp.content, content_type
    except httpx.HTTPStatusError as exc:
        raise WahaError(
            f"WAHA baixar_midia: {exc.response.status_code} {exc.response.text[:200]}"
        ) from exc
    except httpx.RequestError as exc:
        raise WahaError(f"WAHA baixar_midia: {exc}") from exc


def buscar_mensagem(
    session: str,
    cfg: dict,
    *,
    chat_id: str,
    message_id: str,
    download_media: bool = True,
    timeout: float = 20.0,
) -> dict[str, Any]:
    """GET /api/{session}/chats/{chatId}/messages/{messageId}?downloadMedia=true."""
    from urllib.parse import quote

    base_url, headers = _headers(cfg)
    chat_id_encoded = quote(str(chat_id or "all"), safe="")
    message_id_encoded = quote(str(message_id), safe="")
    try:
        resp = httpx.get(
            f"{base_url}/api/{session}/chats/{chat_id_encoded}/messages/{message_id_encoded}",
            headers=headers,
            params={"downloadMedia": "true" if download_media else "false"},
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except httpx.HTTPStatusError as exc:
        raise WahaError(
            f"WAHA chats/messages: status={exc.response.status_code} body={exc.response.text[:200]}"
        ) from exc
    except httpx.RequestError as exc:
        raise WahaError(f"WAHA chats/messages: {type(exc).__name__}") from exc


def enviar_mensagem_midia(
    session: str,
    cfg: dict,
    chat_id: str,
    tipo: str,
    media_url: str,
    mimetype: str,
    filename: str | None = None,
    caption: str | None = None,
) -> dict[str, Any]:
    """POST /api/sendImage (imagem), /api/sendVideo (vídeo) ou /api/sendFile (documento) via WAHA Plus."""
    base_url, headers = _headers(cfg)
    if tipo == "image":
        endpoint = "/api/sendImage"
    elif tipo == "video":
        endpoint = "/api/sendVideo"
    else:
        endpoint = "/api/sendFile"
    file_body: dict[str, Any] = {"url": media_url, "mimetype": mimetype}
    if filename:
        file_body["filename"] = filename
    body: dict[str, Any] = {"session": session, "chatId": chat_id, "file": file_body}
    if caption:
        body["caption"] = caption
    try:
        resp = httpx.post(
            f"{base_url}{endpoint}",
            headers=headers,
            json=body,
            timeout=60.0,
        )
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except httpx.HTTPStatusError as exc:
        raise WahaError(
            f"WAHA {endpoint}: {exc.response.status_code} {exc.response.text[:200]}"
        ) from exc
    except httpx.RequestError as exc:
        raise WahaError(f"WAHA {endpoint}: {exc}") from exc


def buscar_avatar_chat(session: str, jid: str, cfg: dict, timeout: float = 5.0, refresh: bool = False) -> str | None:
    """GET /api/contacts/profile-picture → profilePictureURL str ou None."""
    base_url, headers = _headers(cfg)
    params: dict[str, str] = {
        "contactId": str(jid),
        "session": session,
    }
    if refresh:
        params["refresh"] = "True"
    try:
        resp = httpx.get(
            f"{base_url}/api/contacts/profile-picture",
            headers=headers,
            params=params,
            timeout=timeout,
        )
        if resp.status_code in (404, 204):
            return None
        resp.raise_for_status()
        if not resp.content:
            return None
        try:
            return _extract_profile_picture_url(resp.json())
        except ValueError as exc:
            raise WahaError("WAHA contacts/profile-picture: resposta JSON inválida") from exc
    except httpx.HTTPStatusError as exc:
        raise WahaError(
            f"WAHA contacts/profile-picture: status={exc.response.status_code} body={exc.response.text[:150]}"
        ) from exc
    except httpx.RequestError as exc:
        raise WahaError(f"WAHA contacts/profile-picture: {type(exc).__name__}") from exc


def buscar_nome_grupo(session: str, group_jid: str, cfg: dict, timeout: float = 5.0) -> str | None:
    """GET /api/{session}/groups/{group_jid} → subject str ou None."""
    from urllib.parse import quote

    base_url, headers = _headers(cfg)
    jid_encoded = quote(str(group_jid), safe="")
    try:
        resp = httpx.get(
            f"{base_url}/api/{session}/groups/{jid_encoded}",
            headers=headers,
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json().get("subject") or None
    except httpx.HTTPStatusError as exc:
        raise WahaError(
            f"WAHA groups: status={exc.response.status_code} body={exc.response.text[:150]}"
        ) from exc
    except httpx.RequestError as exc:
        raise WahaError(f"WAHA groups: {type(exc).__name__}") from exc


def buscar_lid_phone(session: str, lid_number: str, cfg: dict, timeout: float = 5.0) -> str | None:
    """GET /api/{session}/lids/{lid_number} → telefone '55XXXXXXXXXX' ou None.
    lid_number = parte numérica do JID @lid sem sufixo (ex: '108701612544046').
    Requer NOWEB Store ativo na sessão.
    """
    base_url, headers = _headers(cfg)
    try:
        resp = httpx.get(
            f"{base_url}/api/{session}/lids/{lid_number}",
            headers=headers,
            timeout=timeout,
        )
        resp.raise_for_status()
        if not resp.content:
            return None
        data = resp.json()
        pn = (data.get("pn") or "").split("@")[0]
        return pn if pn else None
    except httpx.HTTPStatusError as exc:
        raise WahaError(
            f"WAHA lids: status={exc.response.status_code} endpoint=lids/{{lid}}"
        ) from exc
    except httpx.RequestError as exc:
        raise WahaError(f"WAHA lids: {type(exc).__name__}") from exc


def parar_sessao(session: str, cfg: dict) -> dict[str, Any]:
    """POST /api/sessions/{session}/stop"""
    base_url, headers = _headers(cfg)
    try:
        resp = httpx.post(
            f"{base_url}/api/sessions/{session}/stop",
            headers=headers,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json() if resp.content else {}
    except httpx.HTTPStatusError as exc:
        raise WahaError(
            f"WAHA sessions/{session}/stop: {exc.response.status_code} {exc.response.text[:200]}"
        ) from exc
    except httpx.RequestError as exc:
        raise WahaError(f"WAHA sessions/{session}/stop: {exc}") from exc
