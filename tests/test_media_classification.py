"""Testes para classificação de mídia: infer_media_type, waha_normalizer override, _derive_media_fields."""

from __future__ import annotations

import pytest

from app.services.whatsapp_media import infer_media_type
from app.services.waha_normalizer import adapt_waha_to_evolution


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_waha(*, type_: str, mimetype: str, url: str = "http://waha/file", filename: str | None = None) -> dict:
    return {
        "event": "message",
        "session": "test_session",
        "payload": {
            "id": "FAKEID",
            "from": "5511999990001@s.whatsapp.net",
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
            "caption": "",
            "timestamp": 1_700_000_000,
            "pushName": "Teste",
        },
    }


# ---------------------------------------------------------------------------
# infer_media_type — sticker explícito vence mimetype
# ---------------------------------------------------------------------------

def test_sticker_via_message_type_vence_image_webp():
    assert infer_media_type("image/webp", "stickerMessage") == "sticker"

def test_image_webp_sem_sticker_message_type_e_image():
    assert infer_media_type("image/webp", "documentMessage") == "image"

def test_image_webp_sem_message_type_e_image():
    assert infer_media_type("image/webp", "") == "image"

def test_image_jpeg_como_document_e_image():
    assert infer_media_type("image/jpeg", "documentMessage") == "image"

def test_audio_webm_como_document_e_audio():
    assert infer_media_type("audio/webm", "documentMessage") == "audio"

def test_audio_ogg_com_ptt_e_audio():
    assert infer_media_type("audio/ogg; codecs=opus", "pttMessage") == "audio"

def test_video_webm_e_video():
    assert infer_media_type("video/webm", "documentMessage") == "video"

def test_audio_sem_mimetype_via_message_type():
    assert infer_media_type("", "audioMessage") == "audio"

def test_document_pdf_mimetype():
    assert infer_media_type("application/pdf", "") == "document"

def test_document_por_extensao_pdf():
    assert infer_media_type("", "", "relatorio.pdf") == "document"

def test_image_por_extensao_jpg():
    assert infer_media_type("", "", "foto.jpg") == "image"

def test_audio_por_extensao_mp3():
    assert infer_media_type("", "", "musica.mp3") == "audio"

def test_mimetype_vence_extensao_errada():
    # mimetype audio/ vence mesmo que extensão não seja de áudio
    assert infer_media_type("audio/webm", "", "arquivo.bin") == "audio"


# ---------------------------------------------------------------------------
# waha_normalizer — override document → image/audio quando mimetype indica
# ---------------------------------------------------------------------------

def test_document_image_jpeg_vira_imageMessage():
    waha = _make_waha(type_="document", mimetype="image/jpeg", filename="foto.jpg")
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "imageMessage" in msg, f"Esperado imageMessage, got: {list(msg.keys())}"
    assert "documentMessage" not in msg

def test_document_image_webp_vira_imageMessage_nao_sticker():
    """JPG/WebP enviado como documento deve virar imageMessage, NÃO stickerMessage."""
    waha = _make_waha(type_="document", mimetype="image/webp", filename="foto.webp")
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "imageMessage" in msg, f"Esperado imageMessage, got: {list(msg.keys())}"
    assert "stickerMessage" not in msg

def test_document_audio_webm_vira_audioMessage():
    waha = _make_waha(type_="document", mimetype="audio/webm", filename="audio.webm")
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "audioMessage" in msg, f"Esperado audioMessage, got: {list(msg.keys())}"
    assert "documentMessage" not in msg

def test_sticker_original_mantém_stickerMessage():
    """Sticker com type=sticker deve continuar como stickerMessage, mesmo com image/webp."""
    waha = _make_waha(type_="sticker", mimetype="image/webp")
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "stickerMessage" in msg, f"Esperado stickerMessage, got: {list(msg.keys())}"

def test_document_pdf_nao_e_reclassificado():
    """PDF como documento deve continuar como documentMessage."""
    waha = _make_waha(type_="document", mimetype="application/pdf", filename="doc.pdf")
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "documentMessage" in msg, f"Esperado documentMessage, got: {list(msg.keys())}"

def test_ptt_original_vira_audioMessage():
    waha = _make_waha(type_="ptt", mimetype="audio/ogg; codecs=opus")
    adapted = adapt_waha_to_evolution(waha)
    msg = adapted["data"]["message"]
    assert "audioMessage" in msg


def test_waha_contact_name_nested_vira_push_name():
    waha = {
        "event": "message",
        "session": "test_session",
        "payload": {
            "id": "MSG1",
            "from": "5511999990001@c.us",
            "chatId": "5511999990001@c.us",
            "fromMe": False,
            "body": "Oi",
            "hasMedia": False,
            "contact": {"name": "Maria Silva", "pushname": "Maria"},
        },
    }
    adapted = adapt_waha_to_evolution(waha)
    assert adapted["data"]["pushName"] == "Maria"


def test_waha_own_account_name_nao_vira_push_name():
    waha = {
        "event": "message",
        "session": "op7-waha",
        "me": {"id": "554799999999@c.us", "pushName": "Atendimento OP7"},
        "payload": {
            "id": "MSG1",
            "from": "5511999990001@c.us",
            "chatId": "5511999990001@c.us",
            "fromMe": False,
            "body": "Oi",
            "hasMedia": False,
            "pushName": "Atendimento OP7",
        },
    }
    adapted = adapt_waha_to_evolution(waha)
    assert adapted["data"]["pushName"] == ""


def test_waha_group_preserva_remote_jid_e_participant_separados():
    waha = {
        "event": "message",
        "session": "test_session",
        "payload": {
            "id": "GROUP1",
            "from": "120363000000000000@g.us",
            "chatId": "120363000000000000@g.us",
            "participant": "5511888887777@c.us",
            "participantName": "João",
            "fromMe": False,
            "body": "Oi grupo",
            "hasMedia": False,
            "chat": {"name": "Grupo Comercial"},
        },
    }
    adapted = adapt_waha_to_evolution(waha)
    assert adapted["data"]["key"]["remoteJid"] == "120363000000000000@g.us"
    assert adapted["data"]["key"]["participant"] == "5511888887777@s.whatsapp.net"
    assert adapted["data"]["pushName"] == "João"


# ---------------------------------------------------------------------------
# _derive_media_fields — extração de payload quando midias[] vazio
# ---------------------------------------------------------------------------

from app.api.mensagens import _derive_media_fields, _NULL_MEDIA


class _FakeMidia:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)
        self.ativo = True


class _FakeMensagem:
    def __init__(
        self,
        *,
        message_type: str | None = None,
        media_status: str | None = None,
        midias: list | None = None,
        payload: dict | None = None,
    ):
        self.message_type = message_type
        self.media_status = media_status
        self.midias = midias or []
        self.payload = payload


def test_pending_image_jpeg_retorna_media_kind_image():
    m = _FakeMensagem(
        message_type="imageMessage",
        media_status="pending",
        payload={"data": {"message": {"imageMessage": {"mimetype": "image/jpeg", "fileName": "foto.jpg"}}}},
    )
    fields = _derive_media_fields(m)
    assert fields["media_kind"] == "image"
    assert fields["media_mimetype"] == "image/jpeg"
    assert fields["media_filename"] == "foto.jpg"


def test_pending_audio_webm_retorna_media_kind_audio():
    m = _FakeMensagem(
        message_type="audioMessage",
        media_status="pending",
        payload={"data": {"message": {"audioMessage": {"mimetype": "audio/webm"}}}},
    )
    fields = _derive_media_fields(m)
    assert fields["media_kind"] == "audio"


def test_pending_document_com_filename_retorna_filename():
    m = _FakeMensagem(
        message_type="documentMessage",
        media_status="pending",
        payload={"data": {"message": {"documentMessage": {"filename": "relatorio.pdf"}}}},
    )
    fields = _derive_media_fields(m)
    assert fields["media_filename"] == "relatorio.pdf"
    assert fields["media_kind"] == "document"


def test_texto_sem_midia_retorna_null():
    m = _FakeMensagem(
        message_type="conversation",
        media_status=None,
        payload={"data": {"message": {"conversation": "Olá"}}},
    )
    fields = _derive_media_fields(m)
    assert fields == _NULL_MEDIA
    assert fields["media_kind"] is None
    assert fields["media_mimetype"] is None


def test_texto_com_media_status_sem_evidencia_nao_vira_midia():
    m = _FakeMensagem(
        message_type="conversation",
        media_status="pending",
        payload={"data": {"message": {"conversation": "Olá"}}},
    )
    fields = _derive_media_fields(m)
    assert fields == _NULL_MEDIA


def test_midia_ready_usa_dados_da_midia_salva():
    midia = _FakeMidia(
        tipo="image",
        mimetype="image/jpeg",
        filename="foto.jpg",
        caption="Uma foto",
    )
    m = _FakeMensagem(
        message_type="imageMessage",
        media_status="ready",
        midias=[midia],
    )
    fields = _derive_media_fields(m)
    assert fields["media_kind"] == "image"
    assert fields["media_mimetype"] == "image/jpeg"
    assert fields["media_filename"] == "foto.jpg"
    assert fields["media_caption"] == "Uma foto"


def test_payload_nao_dict_nao_quebra():
    m = _FakeMensagem(
        message_type="imageMessage",
        media_status="pending",
        payload=None,
    )
    fields = _derive_media_fields(m)
    # Tem media_status=pending + media_type imageMessage → retorna kind por message_type
    assert fields["media_kind"] == "image"
    assert fields["media_mimetype"] is None
