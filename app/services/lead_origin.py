from __future__ import annotations

import json
import re
from typing import Any


EMPTY_LEAD_ORIGIN: dict[str, Any] = {
    "campanha_origem": None,
    "utm_source": None,
    "utm_medium": None,
    "utm_campaign": None,
    "meta_ad_id": None,
    "meta_ctwa_clid": None,
    "meta_headline": None,
    "meta_body": None,
    "meta_source_url": None,
    "meta_media_type": None,
    "meta_image_url": None,
    "meta_referral_json": None,
    "source": None,
}


def extract_lead_origin(data: dict[str, Any], message: dict[str, Any] | None, msg_text: str) -> dict[str, Any]:
    origin = dict(EMPTY_LEAD_ORIGIN)
    referral = _find_referral(data, message or {})
    if isinstance(referral, dict):
        origin["meta_ad_id"] = referral.get("source_id")
        origin["meta_ctwa_clid"] = referral.get("ctwa_clid")
        origin["meta_headline"] = referral.get("headline")
        origin["meta_body"] = referral.get("body")
        origin["meta_source_url"] = referral.get("source_url")
        origin["meta_media_type"] = referral.get("media_type")
        origin["meta_image_url"] = referral.get("image_url")
        origin["meta_referral_json"] = json.dumps(referral)
        origin["utm_source"] = "meta_ads"
        origin["utm_medium"] = "cpc"
        origin["campanha_origem"] = referral.get("headline") or referral.get("source_id") or "Meta Ads"
        origin["source"] = "meta_referral"
        return origin

    for pattern, kind in (
        (r"(?i)vim?\s+(?:pela\s+)?campanha[:\s]+([^\n]+?)(?:\s*$|\s+\n)", "campanha"),
        (r"(?i)campanha[:\s]+([^\n]+?)(?:\s*$|\s+\n)", "campanha"),
        (r"(?i)vi\s+(?:no|pelo)\s+(?:anúncio|ad|link)\s+([^\n]+?)(?:\s*$|\s+\n)", "anuncio"),
        (r"(?i)origem[:\s]+([^\n]+?)(?:\s*$|\s+\n)", "origem"),
    ):
        match = re.search(pattern, msg_text or "")
        if match:
            value = match.group(1).strip()
            origin["utm_source"] = "whatsapp"
            origin["utm_medium"] = "cpc" if kind == "anuncio" else "organic"
            origin["utm_campaign"] = value
            origin["campanha_origem"] = value
            origin["source"] = "message_text"
            return origin
    return origin


def has_lead_origin(origin: dict[str, Any]) -> bool:
    return any(
        origin.get(key)
        for key in (
            "campanha_origem",
            "utm_source",
            "utm_campaign",
            "meta_ad_id",
            "meta_ctwa_clid",
            "meta_referral_json",
        )
    )


def _find_referral(data: dict[str, Any], message: dict[str, Any]) -> Any:
    for path in ("referral", "message.referral", "context.referral", "data.referral"):
        ptr: Any = data
        for part in path.split("."):
            if isinstance(ptr, dict):
                ptr = ptr.get(part)
            else:
                ptr = None
                break
        if ptr:
            return ptr
    return message.get("referral") if isinstance(message, dict) else None
