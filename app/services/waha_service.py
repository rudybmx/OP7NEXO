"""Cliente HTTP para WAHA Plus API."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = 15.0

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
    """PUT /api/sessions/{session} — injeta webhook no config da sessão."""
    base_url, headers = _headers(cfg)
    body = {
        "config": {
            "webhooks": [
                {
                    "url": webhook_url,
                    "events": ["message", "session.status"],
                }
            ]
        }
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
