from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import waha_service


def test_configurar_webhook_preserva_config_e_faz_upsert_op7(monkeypatch):
    captured = {}

    def fake_headers(cfg):
        return "http://waha:3000", {"X-Api-Key": "redacted", "Content-Type": "application/json"}

    def fake_estado_sessao(session, cfg):
        return {
            "name": session,
            "status": "WORKING",
            "config": {
                "noweb": {"store": {"enabled": True, "fullSync": False}},
                "webhooks": [
                    {"url": "https://third.example/webhook", "events": ["message"]},
                    {
                        "url": "http://op7nexo-api:8000/webhook/waha/old-token",
                        "events": ["message"],
                    },
                ],
            },
        }

    def fake_put(url, headers, json, timeout):
        captured["url"] = url
        captured["json"] = json
        return SimpleNamespace(content=b"{}", raise_for_status=lambda: None, json=lambda: {"ok": True})

    monkeypatch.setattr(waha_service, "_headers", fake_headers)
    monkeypatch.setattr(waha_service, "estado_sessao", fake_estado_sessao)
    monkeypatch.setattr(waha_service.httpx, "put", fake_put)

    result = waha_service.configurar_webhook(
        "op7-session",
        "http://op7nexo-api:8000/webhook/waha/new-token",
        {"api_base_url": "http://waha:3000", "api_key_ref": "WAHA_API_KEY"},
    )

    assert result == {"ok": True}
    assert captured["url"] == "http://waha:3000/api/sessions/op7-session"
    config = captured["json"]["config"]
    assert config["noweb"]["store"] == {"enabled": True, "fullSync": False}
    assert config["webhooks"][0] == {"url": "https://third.example/webhook", "events": ["message"]}
    assert config["webhooks"][1] == {
        "url": "http://op7nexo-api:8000/webhook/waha/new-token",
        "events": ["message", "message.any", "message.ack", "session.status"],
    }


@pytest.mark.parametrize(
    ("mimetype", "expected_convert"),
    [
        ("audio/ogg; codecs=opus", False),
        ("audio/webm", True),
    ],
)
def test_enviar_mensagem_voz_define_convert_e_endpoint(monkeypatch, mimetype, expected_convert):
    captured = {}

    def fake_headers(cfg):
        return "http://waha:3000", {"X-Api-Key": "redacted", "Content-Type": "application/json"}

    def fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return SimpleNamespace(content=b'{"id":"voice-id-1"}', raise_for_status=lambda: None, json=lambda: {"id": "voice-id-1"})

    monkeypatch.setattr(waha_service, "_headers", fake_headers)
    monkeypatch.setattr(waha_service.httpx, "post", fake_post)

    result = waha_service.enviar_mensagem_voz(
        "op7-session",
        {"api_base_url": "http://waha:3000", "api_key_ref": "WAHA_API_KEY"},
        "554399999999@c.us",
        "http://minio:9000/whatsapp-media/voice.webm",
        mimetype,
        filename="voice.webm",
    )

    assert result == {"id": "voice-id-1"}
    assert captured["url"] == "http://waha:3000/api/sendVoice"
    assert captured["headers"]["X-Api-Key"] == "redacted"
    assert captured["json"]["session"] == "op7-session"
    assert captured["json"]["chatId"] == "554399999999@c.us"
    assert captured["json"]["file"] == {
        "url": "http://minio:9000/whatsapp-media/voice.webm",
        "mimetype": mimetype,
        "filename": "voice.webm",
    }
    assert captured["json"]["convert"] is expected_convert
    assert captured["timeout"] == 60.0
