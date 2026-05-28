from app.services import whatsapp_media


def test_infer_media_type_by_mimetype_and_message_type():
    assert whatsapp_media.infer_media_type("image/jpeg") == "image"
    assert whatsapp_media.infer_media_type("audio/ogg") == "audio"
    assert whatsapp_media.infer_media_type("video/mp4") == "video"
    assert whatsapp_media.infer_media_type("application/pdf") == "document"
    assert whatsapp_media.infer_media_type("application/octet-stream", "stickerMessage") == "sticker"


def test_store_media_bytes_builds_workspace_scoped_key(monkeypatch):
    calls = {}

    def fake_put_bytes(bucket, object_name, content, content_type):
        calls["bucket"] = bucket
        calls["object_name"] = object_name
        calls["content"] = content
        calls["content_type"] = content_type

    monkeypatch.setattr(whatsapp_media, "put_bytes", fake_put_bytes)
    monkeypatch.setattr(whatsapp_media, "public_url", lambda bucket, key: f"https://api.test/meta/storage/{bucket}/{key}")

    stored = whatsapp_media.store_media_bytes(
        workspace_id="ws-1",
        conversa_id="conv-1",
        mensagem_id="msg-1",
        content=b"abc",
        mimetype="image/png",
        filename="foto.png",
    )

    assert calls["bucket"] == "whatsapp-media"
    assert calls["object_name"] == "whatsapp/ws-1/conv-1/msg-1.png"
    assert stored.url.endswith("/whatsapp-media/whatsapp/ws-1/conv-1/msg-1.png")
    assert stored.media_type == "image"
    assert stored.size == 3
