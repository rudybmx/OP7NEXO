"""Testes — Fase 6.2: receipts/status WAHA.

Grupos:
  1. _map_waha_ack_to_status
  2. adapt_waha_to_evolution com event=message.ack
  2b. integração adapt_waha_to_evolution → normalize_receipt_event
  3. _status_allows_update (guard monotônico)
  4. _extract_waha_message_id com resp["id"] dict
"""

from __future__ import annotations

import pytest

from app.services.waha_normalizer import _map_waha_ack_to_status, adapt_waha_to_evolution
from app.services.whatsapp_normalizer import normalize_receipt_event
from app.api.canais import _extract_waha_message_id, _status_allows_update


# ---------------------------------------------------------------------------
# Grupo 1 — _map_waha_ack_to_status
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("ack,ack_name,expected", [
    (1,    None,      "sent"),
    (2,    None,      "delivered"),
    (3,    None,      "read"),
    (4,    None,      "read"),
    (-1,   None,      "failed"),
    (0,    None,      "pending"),
    (None, "READ",    "read"),
    (None, "PLAYED",  "read"),
    (None, "SERVER",  "sent"),
    (None, "DEVICE",  "delivered"),
    (None, "ERROR",   "failed"),
    (None, "PENDING", "pending"),
    (None, None,      None),
    (99,   None,      None),
    # strip + lower
    (None, " READ ",  "read"),
    (None, "  Played  ", "read"),
])
def test_map_waha_ack_to_status(ack, ack_name, expected):
    assert _map_waha_ack_to_status(ack, ack_name) == expected


# ---------------------------------------------------------------------------
# Grupo 2 — adapt_waha_to_evolution com event=message.ack
# ---------------------------------------------------------------------------

def _ack_payload(ack: int | None = 3, ack_name: str | None = "READ", msg_id: str = "3EB0TESTID001") -> dict:
    return {
        "event": "message.ack",
        "session": "op7-test",
        "payload": {
            "id": msg_id,
            "from": "5521XXXXXXXX@c.us",
            "fromMe": True,
            "ack": ack,
            "ackName": ack_name,
            "chatId": "5521XXXXXXXX@c.us",
        },
    }


def test_ack_3_retorna_messages_update_read():
    adapted = adapt_waha_to_evolution(_ack_payload(ack=3, ack_name="READ"))
    assert adapted["event"] == "messages.update"
    assert adapted["data"]["status"] == "read"
    assert adapted["data"]["key"]["id"] == "3EB0TESTID001"
    assert adapted["instance"] == "op7-test"


def test_ack_2_retorna_delivered():
    adapted = adapt_waha_to_evolution(_ack_payload(ack=2, ack_name=None))
    assert adapted["event"] == "messages.update"
    assert adapted["data"]["status"] == "delivered"


def test_ack_1_retorna_sent():
    adapted = adapt_waha_to_evolution(_ack_payload(ack=1, ack_name="SERVER"))
    assert adapted["event"] == "messages.update"
    assert adapted["data"]["status"] == "sent"


def test_ack_desconhecido_retorna_ack_unknown():
    adapted = adapt_waha_to_evolution(_ack_payload(ack=99, ack_name=None))
    assert adapted["event"] == "messages.ack_unknown"
    assert "data" not in adapted


def test_event_message_nao_regride_para_upsert():
    """Evento message normal continua retornando messages.upsert."""
    waha = {
        "event": "message",
        "session": "op7-test",
        "payload": {
            "id": "TXT001",
            "from": "5521XXXXXXXX@c.us",
            "fromMe": False,
            "body": "Olá",
            "hasMedia": False,
            "timestamp": 1_700_000_000,
        },
    }
    adapted = adapt_waha_to_evolution(waha)
    assert adapted["event"] == "messages.upsert"


# ---------------------------------------------------------------------------
# Grupo 2b — integração adapt_waha_to_evolution → normalize_receipt_event
# ---------------------------------------------------------------------------

def test_ack_pipeline_completo_read():
    waha_payload = _ack_payload(ack=3, ack_name="READ", msg_id="3EB0TESTID001")
    adapted = adapt_waha_to_evolution(waha_payload)
    assert adapted["event"] == "messages.update"

    receipt = normalize_receipt_event(adapted, adapted["event"], instance="op7-test")
    assert "3EB0TESTID001" in receipt.message_ids
    assert receipt.status == "read"


def test_ack_pipeline_completo_delivered():
    waha_payload = _ack_payload(ack=2, ack_name="DEVICE", msg_id="3EB0DEVID001")
    adapted = adapt_waha_to_evolution(waha_payload)
    receipt = normalize_receipt_event(adapted, adapted["event"], instance="op7-test")
    assert "3EB0DEVID001" in receipt.message_ids
    assert receipt.status == "delivered"


# ---------------------------------------------------------------------------
# Grupo 3 — _status_allows_update (guard monotônico)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("current,new,expected", [
    # progressões normais
    (None,        "sent",      True),
    ("pending",   "sent",      True),
    ("sent",      "delivered", True),
    ("delivered", "read",      True),
    ("pending",   "read",      True),
    # regressões bloqueadas
    ("read",      "delivered", False),
    ("read",      "sent",      False),
    ("read",      "pending",   False),
    ("delivered", "sent",      False),
    ("delivered", "pending",   False),
    # failed
    (None,        "failed",    True),
    ("pending",   "failed",    True),
    ("sent",      "failed",    True),
    ("delivered", "failed",    False),
    ("read",      "failed",    False),
    # failed não é sobrescrito
    ("failed",    "sent",      False),
    ("failed",    "delivered", False),
    ("failed",    "read",      False),
    # status desconhecido não atualiza
    (None,        "unknown_status", False),
    ("pending",   "xyz",       False),
])
def test_status_allows_update(current, new, expected):
    assert _status_allows_update(current, new) == expected, (
        f"_status_allows_update({current!r}, {new!r}) esperado {expected}"
    )


# ---------------------------------------------------------------------------
# Grupo 4 — _extract_waha_message_id com resp["id"] dict
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("resp,expected", [
    # resp["id"] como dict com campo "id" interno
    ({"id": {"id": "3EB0ABC"}},              "3EB0ABC"),
    # resp["id"] como string — caminho normal não regride
    ({"id": "3EB0ABC"},                      "3EB0ABC"),
    # fallback por key.id
    ({"key": {"id": "3EB0XYZ"}},             "3EB0XYZ"),
    # resp["id"] como dict vazio — não extrai nada por esse caminho
    ({"id": {}},                             ""),
    # resposta vazia
    ({},                                     ""),
    # key.id (string) tem prioridade sobre dict fallback — key.id está antes no candidates
    ({"id": {"id": "DICT_ID"}, "key": {"id": "KEY_ID"}}, "KEY_ID"),
    # resp["id"] dict sem campo "id" mas key presente
    ({"id": {"other": "x"}, "key": {"id": "KEY_FALLBACK"}}, "KEY_FALLBACK"),
])
def test_extract_waha_message_id(resp, expected):
    assert _extract_waha_message_id(resp) == expected, (
        f"_extract_waha_message_id({resp}) esperado {expected!r}"
    )
