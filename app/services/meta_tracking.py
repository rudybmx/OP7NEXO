from __future__ import annotations

from typing import Any
from urllib.parse import parse_qsl, urlparse


def _first_text(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        if isinstance(value, (dict, list, tuple, set)):
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _parse_tracking_query(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}

    text = raw.strip()
    if not text:
        return {}

    candidates: list[str] = []
    parsed = urlparse(text)

    if parsed.query:
        candidates.append(parsed.query)
    if parsed.fragment and "=" in parsed.fragment:
        candidates.append(parsed.fragment)
    if "=" in text:
        candidates.append(text.lstrip("?&"))
    if parsed.path and "=" in parsed.path:
        candidates.append(parsed.path.lstrip("?&"))

    out: dict[str, str] = {}
    for candidate in candidates:
        for key, value in parse_qsl(candidate, keep_blank_values=True):
            key_norm = key.strip().lower()
            if not key_norm.startswith("utm_") or key_norm in out:
                continue
            value_norm = value.strip()
            if value_norm:
                out[key_norm] = value_norm
    return out


def extrair_tracking_info(
    raw_payload: dict[str, Any] | None,
    *,
    headline_fallback: str | None = None,
    destination_fallback: str | None = None,
    url_tags_fallback: str | None = None,
) -> dict[str, str | None]:
    creative = raw_payload or {}
    story_spec = creative.get("object_story_spec") or {}
    link_data = story_spec.get("link_data") or {}
    photo_data = story_spec.get("photo_data") or {}
    video_data = story_spec.get("video_data") or {}
    template_data = story_spec.get("template_data") or {}
    child_attachments = [c for c in (link_data.get("child_attachments") or []) if isinstance(c, dict)]
    first_child = child_attachments[0] if child_attachments else {}

    headline = _first_text(
        headline_fallback,
        link_data.get("name"),
        link_data.get("message"),
        template_data.get("name"),
        photo_data.get("name"),
        video_data.get("name"),
        *[c.get("name") for c in child_attachments],
        *[c.get("description") for c in child_attachments],
        creative.get("headline"),
        creative.get("name"),
    )

    destination_url = _first_text(
        destination_fallback,
        link_data.get("link"),
        link_data.get("website_url"),
        video_data.get("link"),
        template_data.get("link"),
        photo_data.get("link"),
        *[c.get("link") for c in child_attachments],
    )

    url_tags = _first_text(url_tags_fallback, creative.get("url_tags"))
    tracking_params: dict[str, str] = {}
    card_links = [c.get("link") for c in child_attachments if c.get("link")]
    for source in (url_tags, destination_url, *card_links):
        for key, value in _parse_tracking_query(source).items():
            if key not in tracking_params:
                tracking_params[key] = value

    return {
        "headline": headline,
        "destination_url": destination_url,
        "url_tags": url_tags,
        "utm_source": tracking_params.get("utm_source"),
        "utm_campaign": tracking_params.get("utm_campaign"),
        "utm_medium": tracking_params.get("utm_medium"),
        "utm_content": tracking_params.get("utm_content"),
        "utm_term": tracking_params.get("utm_term"),
    }
