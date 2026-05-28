"""Health checks e persistencia de tokens Meta."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.models.meta_token import MetaToken

log = logging.getLogger(__name__)

META_API_VERSION = "v21.0"
META_BASE = f"https://graph.facebook.com/{META_API_VERSION}"
TOKEN_HEALTH_TIMEOUT_SECONDS = 20.0

TOKEN_HEALTH_OK = "ok"
TOKEN_HEALTH_EXPIRED = "expired"
TOKEN_HEALTH_PERMISSION_ERROR = "permission_error"
TOKEN_HEALTH_INVALID = "invalid"
TOKEN_HEALTH_NETWORK_ERROR = "network_error"
TOKEN_HEALTH_UNKNOWN = "unknown"


@dataclass(slots=True)
class MetaTokenHealthResult:
    status: str
    http_status: int | None
    error: str | None
    checked_at: datetime


def _safe_int(value: Any) -> int | None:
    try:
        if value in {None, ""}:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _extrair_erro_meta(resp: httpx.Response) -> tuple[int | None, int | None, str]:
    try:
        payload = resp.json()
    except Exception:
        payload = {}

    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            code = _safe_int(error.get("code"))
            subcode = _safe_int(error.get("error_subcode"))
            message = str(
                error.get("message")
                or error.get("error_user_msg")
                or error.get("error_user_title")
                or resp.text
                or ""
            ).strip()
            return code, subcode, message or f"HTTP {resp.status_code}"

    texto = str(resp.text or "").strip()
    return None, None, texto or f"HTTP {resp.status_code}"


def _classificar_erro_meta(resp: httpx.Response) -> tuple[str, str]:
    code, subcode, message = _extrair_erro_meta(resp)
    lower = message.lower()

    if (
        resp.status_code == 429
        or resp.status_code >= 500
        or code in {4, 17, 32, 613}
        or "rate limit" in lower
        or "temporarily unavailable" in lower
    ):
        return TOKEN_HEALTH_NETWORK_ERROR, message

    if subcode in {463, 467} or "expired" in lower or "session has expired" in lower:
        return TOKEN_HEALTH_EXPIRED, message

    if (
        resp.status_code == 403
        or code in {10, 200}
        or "permission" in lower
        or "not authorized" in lower
        or "requires business management" in lower
    ):
        return TOKEN_HEALTH_PERMISSION_ERROR, message

    if (
        resp.status_code == 401
        or code == 190
        or "invalid oauth access token" in lower
        or "invalid access token" in lower
        or "oauthexception" in lower
    ):
        if "expired" in lower or subcode in {463, 467}:
            return TOKEN_HEALTH_EXPIRED, message
        return TOKEN_HEALTH_INVALID, message

    return TOKEN_HEALTH_UNKNOWN, message


def verificar_token_meta(
    token: str,
    *,
    timeout_seconds: float = TOKEN_HEALTH_TIMEOUT_SECONDS,
) -> MetaTokenHealthResult:
    checked_at = datetime.now(tz=timezone.utc)
    url = f"{META_BASE}/me/adaccounts"
    params = {
        "fields": "id,name,account_status",
        "limit": 1,
        "access_token": token,
    }

    try:
        with httpx.Client(timeout=timeout_seconds) as client:
            resp = client.get(url, params=params)
    except httpx.RequestError as exc:
        return MetaTokenHealthResult(
            status=TOKEN_HEALTH_NETWORK_ERROR,
            http_status=None,
            error=str(exc),
            checked_at=checked_at,
        )

    if 200 <= resp.status_code < 300:
        return MetaTokenHealthResult(
            status=TOKEN_HEALTH_OK,
            http_status=resp.status_code,
            error=None,
            checked_at=checked_at,
        )

    status, error = _classificar_erro_meta(resp)
    return MetaTokenHealthResult(
        status=status,
        http_status=resp.status_code,
        error=error,
        checked_at=checked_at,
    )


def aplicar_resultado_health(token_row: MetaToken, result: MetaTokenHealthResult) -> None:
    token_row.last_checked_at = result.checked_at
    token_row.last_check_status = result.status
    token_row.last_check_http_status = result.http_status
    token_row.last_check_error = result.error


def checar_tokens_ativos(db: Session) -> dict[str, int]:
    tokens = (
        db.query(MetaToken)
        .filter(MetaToken.ativo.is_(True))
        .order_by(MetaToken.nome)
        .all()
    )
    summary: dict[str, int] = {
        TOKEN_HEALTH_OK: 0,
        TOKEN_HEALTH_EXPIRED: 0,
        TOKEN_HEALTH_PERMISSION_ERROR: 0,
        TOKEN_HEALTH_INVALID: 0,
        TOKEN_HEALTH_NETWORK_ERROR: 0,
        TOKEN_HEALTH_UNKNOWN: 0,
        "total": len(tokens),
    }

    for token_row in tokens:
        token_nome = token_row.nome
        result = verificar_token_meta(token_row.token)
        aplicar_resultado_health(token_row, result)
        try:
            db.commit()
        except Exception:
            db.rollback()
            log.exception("Falha ao salvar health do token Meta %s (%s)", token_nome, token_row.id)
            continue

        summary[result.status] = summary.get(result.status, 0) + 1
        log.info("Health token Meta %s (%s): %s", token_nome, token_row.id, result.status)

    return summary
