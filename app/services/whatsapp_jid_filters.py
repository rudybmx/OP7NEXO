from __future__ import annotations

from sqlalchemy import func, or_

IGNORED_WHATSAPP_JID_SUFFIXES = ("@newsletter", "@broadcast")
IGNORED_WHATSAPP_JIDS = {"status@broadcast"}


def is_ignored_whatsapp_jid(value: str | None) -> bool:
    text = str(value or "").strip().lower()
    if not text:
        return False
    return text in IGNORED_WHATSAPP_JIDS or text.endswith(IGNORED_WHATSAPP_JID_SUFFIXES)


def visible_whatsapp_jid_clause(column):
    normalized = func.lower(func.trim(func.coalesce(column, "")))
    return ~or_(
        normalized == "status@broadcast",
        normalized.like("%@newsletter"),
        normalized.like("%@broadcast"),
    )
