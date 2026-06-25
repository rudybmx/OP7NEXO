"""Dedup de conversas BR pela variante do 9º dígito (prevenção).

Testa os helpers puros (_br_jid_candidates, _canonical_br_jid) e o fluxo de
roteamento inbound não-LID (_resolve_existing_br_conversation) com db mockado.
Padrão mock-first do projeto (ver test_canais_evolution.py)."""
from __future__ import annotations

import uuid

from app.services.whatsapp_crm_persistence import (
    _br_jid_candidates,
    _canonical_br_jid,
    _resolve_existing_br_conversation,
)

WS = str(uuid.uuid4())
CANAL = str(uuid.uuid4())


# --------------------------------------------------------------------------- #
# _br_jid_candidates                                                          #
# --------------------------------------------------------------------------- #

def test_candidates_12_digit_mobile_adds_13_variant():
    cands = _br_jid_candidates("554391996849@s.whatsapp.net")  # 12 díg, 5º=9 → celular
    assert "554391996849@s.whatsapp.net" in cands
    assert "5543991996849@s.whatsapp.net" in cands


def test_candidates_13_digit_mobile_adds_12_variant():
    cands = _br_jid_candidates("5543991996849@s.whatsapp.net")  # 13 díg
    assert "5543991996849@s.whatsapp.net" in cands
    assert "554391996849@s.whatsapp.net" in cands


def test_candidates_landline_12_digit_no_variant():
    # fixo (5º díg=3): NÃO fabricar 9 → sem variante
    assert _br_jid_candidates("554133334444@s.whatsapp.net") == ["554133334444@s.whatsapp.net"]


def test_candidates_non_br_unchanged():
    assert _br_jid_candidates("12025551234@s.whatsapp.net") == ["12025551234@s.whatsapp.net"]


def test_candidates_group_unchanged():
    assert _br_jid_candidates("120363163409972131@g.us") == ["120363163409972131@g.us"]


def test_candidates_no_duplicates():
    # quando a forma "exata" coincide com um candidato gerado, não repete
    cands = _br_jid_candidates("554391996849@s.whatsapp.net")
    assert len(cands) == len(set(cands))


# --------------------------------------------------------------------------- #
# _canonical_br_jid                                                           #
# --------------------------------------------------------------------------- #

def test_canonical_12_digit_mobile_to_13():
    assert _canonical_br_jid("554391996849@s.whatsapp.net") == "5543991996849@s.whatsapp.net"


def test_canonical_13_digit_mobile_kept():
    assert _canonical_br_jid("5543991996849@s.whatsapp.net") == "5543991996849@s.whatsapp.net"


def test_canonical_bare_12_digit_mobile():
    assert _canonical_br_jid("554391996849") == "5543991996849@s.whatsapp.net"


def test_canonical_bare_13_digit_mobile():
    assert _canonical_br_jid("5543991996849") == "5543991996849@s.whatsapp.net"


def test_canonical_landline_bare_only_suffix_no_9():
    # fixo bare: adiciona sufixo, NÃO inventa 9
    assert _canonical_br_jid("554133334444") == "554133334444@s.whatsapp.net"


def test_canonical_landline_suffixed_unchanged():
    assert _canonical_br_jid("554133334444@s.whatsapp.net") == "554133334444@s.whatsapp.net"


def test_canonical_group_preserved():
    assert _canonical_br_jid("120363163409972131@g.us") == "120363163409972131@g.us"


def test_canonical_lid_preserved():
    assert _canonical_br_jid("35210880090140@lid") == "35210880090140@lid"


def test_canonical_broadcast_preserved():
    assert _canonical_br_jid("status@broadcast") == "status@broadcast"


def test_canonical_non_br_suffixed_unchanged():
    assert _canonical_br_jid("12025551234@s.whatsapp.net") == "12025551234@s.whatsapp.net"


def test_canonical_empty_unchanged():
    assert _canonical_br_jid("") == ""


# --------------------------------------------------------------------------- #
# _resolve_existing_br_conversation (db mockado)                             #
# --------------------------------------------------------------------------- #

class _FakeResult:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class _FakeDb:
    """db.execute(stmt, params).fetchone() → linha conforme params['jid'].

    active_jids: {jid: contato_id} representa conversas ATIVAS existentes. A query
    "exact" (SELECT 1) e a "por candidato" (SELECT ct.id) usam ambas params['jid']."""

    def __init__(self, active_jids: dict):
        self.active_jids = active_jids
        self.queried_jids: list[str] = []

    def execute(self, _stmt, params):
        jid = params.get("jid")
        self.queried_jids.append(jid)
        if jid in self.active_jids:
            return _FakeResult((self.active_jids[jid],))
        return _FakeResult(None)


def test_resolve_skips_non_suffixed_jid():
    db = _FakeDb({})
    jid, contato = _resolve_existing_br_conversation(
        db, workspace_id=WS, canal_id=CANAL, remote_jid="35210880090140@lid"
    )
    assert (jid, contato) == ("35210880090140@lid", None)
    assert db.queried_jids == []  # nem consulta o banco


def test_resolve_landline_returns_original():
    db = _FakeDb({})
    jid, contato = _resolve_existing_br_conversation(
        db, workspace_id=WS, canal_id=CANAL, remote_jid="554133334444@s.whatsapp.net"
    )
    assert (jid, contato) == ("554133334444@s.whatsapp.net", None)
    assert db.queried_jids == []  # sem variante → não consulta


def test_resolve_routes_to_existing_variant():
    # chega 13 díg; já existe conversa ativa na forma 12 díg → roteia p/ ela
    contato = str(uuid.uuid4())
    db = _FakeDb({"554391996849@s.whatsapp.net": contato})
    jid, got = _resolve_existing_br_conversation(
        db, workspace_id=WS, canal_id=CANAL, remote_jid="5543991996849@s.whatsapp.net"
    )
    assert jid == "554391996849@s.whatsapp.net"
    assert got == contato


def test_resolve_prefers_exact_when_exact_active():
    # chega 13 díg; a própria 13 díg já tem conversa ativa → NÃO desvia p/ variante
    db = _FakeDb({
        "5543991996849@s.whatsapp.net": "exact",
        "554391996849@s.whatsapp.net": "variant",
    })
    jid, got = _resolve_existing_br_conversation(
        db, workspace_id=WS, canal_id=CANAL, remote_jid="5543991996849@s.whatsapp.net"
    )
    assert jid == "5543991996849@s.whatsapp.net"
    assert got is None  # deixa o fluxo normal (upsert) cuidar


def test_resolve_no_match_returns_original():
    # chega 13 díg; nenhuma conversa ativa em nenhuma forma → cria normal (JID original)
    db = _FakeDb({})
    jid, got = _resolve_existing_br_conversation(
        db, workspace_id=WS, canal_id=CANAL, remote_jid="5543991996849@s.whatsapp.net"
    )
    assert jid == "5543991996849@s.whatsapp.net"
    assert got is None
