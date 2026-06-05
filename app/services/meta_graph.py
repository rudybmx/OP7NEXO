"""Meta Graph API client with centralized throttling and safe logging."""

from __future__ import annotations

import json
import logging
import random
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

RATE_LIMIT_CODES = {17, 4, 80000, 80004}
USAGE_HEADERS = (
    "x-app-usage",
    "x-ad-account-usage",
    "x-business-use-case-usage",
    "x-fb-ads-insights-throttle",
)


class MetaRateLimitError(RuntimeError):
    """Temporary Meta Graph API rate-limit condition."""

    def __init__(
        self,
        message: str,
        *,
        endpoint: str | None = None,
        error_code: int | None = None,
        cooldown_seconds: float = 0.0,
        usage_percent: int | None = None,
    ) -> None:
        super().__init__(message)
        self.endpoint = endpoint
        self.error_code = error_code
        self.cooldown_seconds = cooldown_seconds
        self.usage_percent = usage_percent


@dataclass
class MetaRequestContext:
    provider: str = "meta"
    workspace_id: str | None = None
    company_id: str | None = None
    ad_account_id: str | None = None


def mask_ad_account_id(value: str | None) -> str | None:
    if not value:
        return None
    raw = str(value)
    prefix = "act_"
    body = raw[len(prefix):] if raw.startswith(prefix) else raw
    if len(body) <= 6:
        masked = body[:2] + "***"
    else:
        masked = body[:4] + "***" + body[-2:]
    return prefix + masked if raw.startswith(prefix) else masked


def graph_endpoint(url: str) -> str:
    parsed = urlparse(url)
    return parsed.path or url


def sanitize_params(params: dict[str, Any] | None) -> dict[str, Any] | None:
    if not params:
        return params
    safe = dict(params)
    for key in list(safe.keys()):
        if key.lower() in {"access_token", "appsecret_proof"}:
            safe[key] = "***"
    return safe


def meta_error_payload(resp: httpx.Response) -> tuple[dict[str, Any], str]:
    try:
        body = resp.json()
        err = body.get("error", {}) if isinstance(body, dict) else {}
    except Exception:
        err = {}
    message = str(err.get("message") or resp.text[:200] or "").strip()
    return err, message


def is_rate_limit_response(resp: httpx.Response) -> bool:
    if resp.status_code == 429:
        return True
    err, message = meta_error_payload(resp)
    try:
        code = int(err.get("code") or 0)
    except (TypeError, ValueError):
        code = 0
    if code in RATE_LIMIT_CODES:
        return True
    normalized = message.lower()
    return any(
        snippet in normalized
        for snippet in (
            "too many calls",
            "reduce the amount",
            "request limit reached",
            "application request limit",
            "user request limit",
        )
    )


def extract_usage_percent(resp: httpx.Response) -> int | None:
    values: list[int] = []
    for header in USAGE_HEADERS:
        raw = resp.headers.get(header)
        if not raw:
            continue
        values.extend(_usage_values(raw))
    return max(values) if values else None


def _usage_values(raw: str) -> list[int]:
    try:
        payload = json.loads(raw)
    except Exception:
        return []

    values: list[int] = []

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                key_norm = str(key).lower()
                if (
                    key_norm in {"call_count", "total_cputime", "total_time"}
                    or key_norm.endswith("_util_pct")
                    or key_norm.endswith("_pct")
                ):
                    try:
                        values.append(int(float(child)))
                    except (TypeError, ValueError):
                        pass
                else:
                    walk(child)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(payload)
    return values


class MetaGraphClient:
    def __init__(
        self,
        client: httpx.Client,
        *,
        context: MetaRequestContext | None = None,
        sleep=time.sleep,
        rng: random.Random | None = None,
    ) -> None:
        self.client = client
        self.context = context or MetaRequestContext()
        self.sleep = sleep
        self.rng = rng or random.Random()
        self.last_usage_percent: int | None = None
        self.last_cooldown_seconds = 0.0
        self.rate_limit_retries = 0
        self._request_count: int = 0

    @property
    def request_count(self) -> int:
        return self._request_count

    def get(self, url: str, params: dict[str, Any] | None = None, **kwargs: Any) -> httpx.Response:
        self._request_count += 1
        endpoint = graph_endpoint(url)
        max_retries = max(settings.META_SYNC_RATE_LIMIT_MAX_RETRIES, 0)
        attempt = 0
        while True:
            if self.last_cooldown_seconds > 0:
                self._log_throttle(endpoint, attempt, self.last_cooldown_seconds)
                self.sleep(self.last_cooldown_seconds)
                self.last_cooldown_seconds = 0.0

            try:
                resp = self.client.get(url, params=params, **kwargs)
            except httpx.HTTPError:
                if attempt >= max_retries:
                    raise
                cooldown = self._backoff_seconds(attempt)
                self._log_throttle(endpoint, attempt + 1, cooldown)
                self.sleep(cooldown)
                attempt += 1
                continue

            self._update_usage(resp, endpoint)
            if not is_rate_limit_response(resp):
                return resp

            err, message = meta_error_payload(resp)
            error_code = _safe_int(err.get("code")) or resp.status_code
            if attempt >= max_retries:
                cooldown = self._backoff_seconds(attempt)
                raise MetaRateLimitError(
                    message or "Meta Graph API rate limit",
                    endpoint=endpoint,
                    error_code=error_code,
                    cooldown_seconds=cooldown,
                    usage_percent=self.last_usage_percent,
                )

            cooldown = self._backoff_seconds(attempt)
            self.last_cooldown_seconds = 0.0
            self.rate_limit_retries += 1
            self._log_rate_limit(endpoint, error_code, attempt + 1, cooldown)
            self.sleep(cooldown)
            attempt += 1

    def paginate(
        self,
        url: str,
        params: dict[str, Any],
        *,
        raise_on_terminal: bool = True,
    ) -> list[dict[str, Any]]:
        resultados: list[dict[str, Any]] = []
        current_url: str | None = url
        current_params: dict[str, Any] | None = params
        page = 0

        while current_url:
            page += 1
            resp = self.get(current_url, params=current_params) if current_params is not None else self.get(current_url)
            if resp.status_code != 200:
                err, message = meta_error_payload(resp)
                if raise_on_terminal:
                    log.error(
                        "Meta API erro provider=meta endpoint=%s error_code=%s message=%s",
                        graph_endpoint(url),
                        err.get("code") or resp.status_code,
                        message,
                    )
                else:
                    log.warning(
                        "Meta API warning provider=meta endpoint=%s error_code=%s message=%s",
                        graph_endpoint(url),
                        err.get("code") or resp.status_code,
                        message,
                    )
                break

            data = resp.json()
            resultados.extend(data.get("data", []))
            log.info(
                "Meta pagination provider=meta endpoint=%s page=%d rows=%d",
                graph_endpoint(url),
                page,
                len(resultados),
            )
            current_url = data.get("paging", {}).get("next")
            current_params = None

        return resultados

    def _update_usage(self, resp: httpx.Response, endpoint: str) -> None:
        usage = extract_usage_percent(resp)
        if usage is None:
            self.last_cooldown_seconds = max(settings.META_SYNC_REQUEST_DELAY_SECONDS, 0.0)
            return
        self.last_usage_percent = usage
        if usage >= settings.META_SYNC_USAGE_HARD_THRESHOLD_PERCENT:
            self.last_cooldown_seconds = settings.META_SYNC_RATE_LIMIT_MAX_DELAY_SECONDS
        elif usage >= settings.META_SYNC_USAGE_SOFT_THRESHOLD_PERCENT:
            span = max(settings.META_SYNC_USAGE_HARD_THRESHOLD_PERCENT - settings.META_SYNC_USAGE_SOFT_THRESHOLD_PERCENT, 1)
            ratio = min(max((usage - settings.META_SYNC_USAGE_SOFT_THRESHOLD_PERCENT) / span, 0.0), 1.0)
            self.last_cooldown_seconds = settings.META_SYNC_RATE_LIMIT_BASE_DELAY_SECONDS * (1 + ratio * 4)
        else:
            self.last_cooldown_seconds = max(settings.META_SYNC_REQUEST_DELAY_SECONDS, 0.0)
        if usage >= settings.META_SYNC_USAGE_SOFT_THRESHOLD_PERCENT:
            log.info(
                "Meta usage high provider=meta workspace_id=%s company_id=%s ad_account_id=%s endpoint=%s usage_percent=%s cooldown_seconds=%.2f",
                self.context.workspace_id,
                self.context.company_id,
                mask_ad_account_id(self.context.ad_account_id),
                endpoint,
                usage,
                self.last_cooldown_seconds,
            )

    def _backoff_seconds(self, attempt: int) -> float:
        base = max(settings.META_SYNC_RATE_LIMIT_BASE_DELAY_SECONDS, 0.0)
        cap = max(settings.META_SYNC_RATE_LIMIT_MAX_DELAY_SECONDS, base)
        delay = min(base * (2 ** max(attempt, 0)), cap)
        jitter = self.rng.uniform(0, max(delay * 0.2, 0.1)) if delay else 0.0
        return min(delay + jitter, cap)

    def _log_throttle(self, endpoint: str, retry_count: int, cooldown: float) -> None:
        log.info(
            "Meta throttle provider=meta workspace_id=%s company_id=%s ad_account_id=%s endpoint=%s retry_count=%s cooldown_seconds=%.2f usage_percent=%s",
            self.context.workspace_id,
            self.context.company_id,
            mask_ad_account_id(self.context.ad_account_id),
            endpoint,
            retry_count,
            cooldown,
            self.last_usage_percent,
        )

    def _log_rate_limit(self, endpoint: str, error_code: int, retry_count: int, cooldown: float) -> None:
        log.warning(
            "Meta rate limit provider=meta workspace_id=%s company_id=%s ad_account_id=%s endpoint=%s error_code=%s retry_count=%s cooldown_seconds=%.2f usage_percent=%s",
            self.context.workspace_id,
            self.context.company_id,
            mask_ad_account_id(self.context.ad_account_id),
            endpoint,
            error_code,
            retry_count,
            cooldown,
            self.last_usage_percent,
        )


def _safe_int(value: Any) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None
