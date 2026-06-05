from __future__ import annotations

from sqlalchemy import column

from app.services.whatsapp_jid_filters import is_ignored_whatsapp_jid, visible_whatsapp_jid_clause


def test_is_ignored_whatsapp_jid_matches_channel_and_status_updates():
    assert is_ignored_whatsapp_jid("120363163409972131@newsletter") is True
    assert is_ignored_whatsapp_jid("120363153099910322@broadcast") is True
    assert is_ignored_whatsapp_jid("status@broadcast") is True
    assert is_ignored_whatsapp_jid("5511999999999@s.whatsapp.net") is False
    assert is_ignored_whatsapp_jid("35210880090140@lid") is False


def test_visible_whatsapp_jid_clause_expresses_channel_exclusions():
    clause = visible_whatsapp_jid_clause(column("remote_jid"))
    compiled = str(clause.compile(compile_kwargs={"literal_binds": True})).lower()

    assert "newsletter" in compiled
    assert "broadcast" in compiled
    assert "status@broadcast" in compiled
