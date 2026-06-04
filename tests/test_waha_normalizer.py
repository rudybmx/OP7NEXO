"""Testes para adapt_waha_to_evolution() — cobertura de mídia inbound WAHA."""

from __future__ import annotations

import os

import pytest

from app.services.waha_normalizer import _normalize_waha_media_url, adapt_waha_to_evolution


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_waha(*, type_: str, mimetype: str, url: str, filename: str | None = None, caption: str = "") -> dict:
    return {
        "event": "message",
        "session": "qozt",
        "payload": {
            "id": "FAKE001",
            "from": "5511XXXXXXXX@s.whatsapp.net",
            "fromMe": False,
            "body": "",
            "hasMedia": True,
            "type": type_,
            "media": {
                "url": url,
                "mimetype": mimetype,
                "filename": filename,
                "filesize": 1024,
            },
            "caption": caption,
            "timestamp": 1_700_000_000,
            "pushName": "Lead",
        },
    }


# ---------------------------------------------------------------------------
# Casos sem mídia — não deve regredir
# ---------------------------------------------------------------------------

def test_texto_sem_media():
    waha = {
        "event": "message",
        "session": "qozt",
        "payload": {
            "id": "TXT001",
            "from": "5511XXXXXXXX@s.whatsapp.net",
            "fromMe": False,
            "body": "Olá",
            "hasMedia": False,
            "type": "chat",
            "timestamp": 1_700_000_000,
            "pushName": "Lead",
        },
    }
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "conversation" in msg
    assert msg["conversation"] == "Olá"
    assert "imageMessage" not in msg


# ---------------------------------------------------------------------------
# Imagem
# ---------------------------------------------------------------------------

def test_imagem_cria_imageMessage():
    waha = _make_waha(
        type_="image",
        mimetype="image/jpeg",
        url="http://waha:3000/api/files/qozt/abc.jpg",
        caption="olha isso",
    )
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "imageMessage" in msg
    node = msg["imageMessage"]
    assert node["url"] == "http://waha:3000/api/files/qozt/abc.jpg"
    assert node["mimetype"] == "image/jpeg"
    assert node["caption"] == "olha isso"
    assert "conversation" not in msg


# ---------------------------------------------------------------------------
# Áudio (PTT / voice note)
# ---------------------------------------------------------------------------

def test_ptt_cria_audioMessage():
    waha = _make_waha(
        type_="ptt",
        mimetype="audio/ogg; codecs=opus",
        url="http://waha:3000/api/files/qozt/voice.ogg",
    )
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "audioMessage" in msg
    assert msg["audioMessage"]["url"] == "http://waha:3000/api/files/qozt/voice.ogg"


def test_audio_cria_audioMessage():
    waha = _make_waha(
        type_="audio",
        mimetype="audio/mpeg",
        url="http://waha:3000/api/files/qozt/song.mp3",
    )
    adapted = adapt_waha_to_evolution(waha)
    assert "audioMessage" in adapted["data"]["message"]


# ---------------------------------------------------------------------------
# Documento
# ---------------------------------------------------------------------------

def test_document_cria_documentMessage_com_filename():
    waha = _make_waha(
        type_="document",
        mimetype="application/pdf",
        url="http://waha:3000/api/files/qozt/doc.pdf",
        filename="relatorio.pdf",
    )
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "documentMessage" in msg
    assert msg["documentMessage"]["fileName"] == "relatorio.pdf"
    assert msg["documentMessage"]["mimetype"] == "application/pdf"


# ---------------------------------------------------------------------------
# Normalização de URL localhost → waha
# ---------------------------------------------------------------------------

def test_url_localhost_e_reescrita(monkeypatch):
    monkeypatch.setenv("WAHA_API_BASE_URL", "http://waha:3000")
    original = "http://localhost:3000/api/files/qozt/abc.jpg"
    result = _normalize_waha_media_url(original)
    assert result == "http://waha:3000/api/files/qozt/abc.jpg"


def test_url_127_e_reescrita(monkeypatch):
    monkeypatch.setenv("WAHA_API_BASE_URL", "http://waha:3000")
    original = "http://127.0.0.1:3000/api/files/qozt/abc.jpg"
    result = _normalize_waha_media_url(original)
    assert result == "http://waha:3000/api/files/qozt/abc.jpg"


def test_url_ja_correta_nao_muda(monkeypatch):
    monkeypatch.setenv("WAHA_API_BASE_URL", "http://waha:3000")
    original = "http://waha:3000/api/files/qozt/abc.jpg"
    result = _normalize_waha_media_url(original)
    assert result == original


def test_url_localhost_no_adapter(monkeypatch):
    monkeypatch.setenv("WAHA_API_BASE_URL", "http://waha:3000")
    waha = _make_waha(
        type_="image",
        mimetype="image/jpeg",
        url="http://localhost:3000/api/files/qozt/img.jpg",
    )
    adapted = adapt_waha_to_evolution(waha)
    node = adapted["data"]["message"]["imageMessage"]
    assert node["url"] == "http://waha:3000/api/files/qozt/img.jpg"
    assert "localhost" not in node["url"]


# ---------------------------------------------------------------------------
# Fallback por mimetype — WAHA NOWEB não envia campo "type"
# ---------------------------------------------------------------------------

def _make_waha_no_type(*, mimetype: str, url: str, filename: str | None = None) -> dict:
    """Payload WAHA NOWEB real: hasMedia=True, media presente, campo type ausente."""
    return {
        "event": "message",
        "session": "qozt",
        "payload": {
            "id": "FAKE002",
            "from": "5511XXXXXXXX@s.whatsapp.net",
            "fromMe": False,
            "body": None,
            "hasMedia": True,
            # sem campo "type"
            "media": {
                "url": url,
                "mimetype": mimetype,
                "filename": filename,
            },
            "timestamp": 1_700_000_000,
            "pushName": "Lead",
        },
    }


def test_imagem_sem_type_usa_mimetype():
    waha = _make_waha_no_type(mimetype="image/jpeg", url="http://minio:9000/waha/s/MSGID.jpeg")
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "imageMessage" in msg, f"esperado imageMessage, got {list(msg.keys())}"
    assert msg["imageMessage"]["mimetype"] == "image/jpeg"


def test_audio_sem_type_usa_mimetype():
    waha = _make_waha_no_type(mimetype="audio/ogg; codecs=opus", url="http://minio:9000/waha/s/MSGID.oga")
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "audioMessage" in msg, f"esperado audioMessage, got {list(msg.keys())}"


def test_documento_sem_type_usa_mimetype():
    waha = _make_waha_no_type(
        mimetype="application/pdf",
        url="http://minio:9000/waha/s/MSGID.pdf",
        filename="relatorio.pdf",
    )
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "documentMessage" in msg, f"esperado documentMessage, got {list(msg.keys())}"
    assert msg["documentMessage"]["fileName"] == "relatorio.pdf"


def test_webp_sem_type_vira_sticker():
    waha = _make_waha_no_type(mimetype="image/webp", url="http://minio:9000/waha/s/MSGID.webp")
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "stickerMessage" in msg, f"esperado stickerMessage, got {list(msg.keys())}"


def test_video_sem_type_usa_mimetype():
    waha = _make_waha_no_type(mimetype="video/mp4", url="http://minio:9000/waha/s/MSGID.mp4")
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "videoMessage" in msg, f"esperado videoMessage, got {list(msg.keys())}"


def test_document_com_image_jpeg_vira_imageMessage():
    """document + mimetype image/jpeg → reclassificado como imageMessage (fix: JPG enviado como doc)."""
    waha = _make_waha(
        type_="document",
        mimetype="image/jpeg",
        url="http://waha:3000/api/files/qozt/file.jpg",
    )
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "imageMessage" in msg
    assert "documentMessage" not in msg


# ---------------------------------------------------------------------------
# Estrutura base (instância, remoteJid, fromMe)
# ---------------------------------------------------------------------------

def test_campos_base_presentes():
    waha = _make_waha(
        type_="image",
        mimetype="image/jpeg",
        url="http://waha:3000/api/files/qozt/img.jpg",
    )
    adapted = adapt_waha_to_evolution(waha)
    assert adapted["event"] == "messages.upsert"
    assert adapted["instance"] == "qozt"
    key = adapted["data"]["key"]
    assert key["id"] == "FAKE001"
    assert key["fromMe"] is False


def test_message_any_from_me_normaliza_id_jid_e_sessao():
    waha = {
        "event": "message.any",
        "session": "op7-piloto",
        "payload": {
            "id": "true_554799999999@c.us_3EB0MANUAL001",
            "from": "554788888888@c.us",
            "to": "554799999999@c.us",
            "chatId": "554788888888@c.us",
            "fromMe": True,
            "body": "Mensagem enviada pelo celular",
            "hasMedia": False,
            "timestamp": 1_780_515_900,
            "pushName": "Atendimento",
        },
    }

    adapted = adapt_waha_to_evolution(waha)

    assert adapted["event"] == "messages.upsert"
    assert adapted["instance"] == "op7-piloto"
    assert adapted["data"]["key"] == {
        "id": "3EB0MANUAL001",
        "remoteJid": "554788888888@s.whatsapp.net",
        "fromMe": True,
    }
    assert adapted["data"]["message"]["conversation"] == "Mensagem enviada pelo celular"
    assert adapted["data"]["messageTimestamp"] == 1_780_515_900


def test_session_status_vira_connection_update():
    adapted = adapt_waha_to_evolution(
        {
            "event": "session.status",
            "session": "op7-piloto",
            "payload": {
                "status": "WORKING",
                "me": {"id": "554799999999@c.us"},
            },
        }
    )

    assert adapted == {
        "event": "connection.update",
        "instance": "op7-piloto",
        "data": {
            "status": "WORKING",
            "state": "WORKING",
            "number": "554799999999@c.us",
        },
    }
