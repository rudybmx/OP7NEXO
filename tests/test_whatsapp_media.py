import unittest

from app.services import whatsapp_media


class _Result:
    def __init__(self, row=None):
        self._row = row

    def fetchone(self):
        return self._row


class _MediaQueueDb:
    def __init__(self):
        self.calls: list[tuple[str, dict | None]] = []
        self.commits = 0

    def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        sql_lower = sql.lower()
        self.calls.append((sql, params))

        if "update public.crm_whatsapp_mensagens" in sql_lower:
            return _Result()

        if "insert into public.crm_message_jobs" in sql_lower:
            assert params["workspace_id"] == "ws-1"
            assert params["canal_id"] == "canal-1"
            assert params["mensagem_id"] == "msg-1"
            assert params["raw_event_id"] == "evt-1"
            assert params["payload"]
            return _Result(row=("job-1",))

        raise AssertionError(f"Unexpected SQL: {sql}")

    def commit(self):
        self.commits += 1


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


def test_enqueue_inbound_media_download_persists_pending_job():
    db = _MediaQueueDb()

    queued = whatsapp_media.enqueue_inbound_media_download(
        db,
        workspace_id="ws-1",
        canal_id="canal-1",
        raw_event_id="evt-1",
        mensagem_id="msg-1",
        conversa_id="conv-1",
        instance_name="op7-instance",
        evolution_msg_id="evo-1",
        message_type_raw="imageMessage",
        media_base64="Zm9v",
        media_url=None,
        media_mime_type="image/jpeg",
        media_filename="foto.jpg",
    )

    assert queued is True
    assert db.commits == 0
    assert any("update public.crm_whatsapp_mensagens" in sql.lower() for sql, _ in db.calls)
    insert_sql, insert_params = next((sql, params) for sql, params in db.calls if "insert into public.crm_message_jobs" in sql.lower())
    assert "media_download" in insert_sql.lower()
    assert insert_params["payload"]


class MediaQueueTests(unittest.TestCase):
    def test_enqueue_inbound_media_download_persists_pending_job(self):
        db = _MediaQueueDb()

        queued = whatsapp_media.enqueue_inbound_media_download(
            db,
            workspace_id="ws-1",
            canal_id="canal-1",
            raw_event_id="evt-1",
            mensagem_id="msg-1",
            conversa_id="conv-1",
            instance_name="op7-instance",
            evolution_msg_id="evo-1",
            message_type_raw="imageMessage",
            media_base64="Zm9v",
            media_url=None,
            media_mime_type="image/jpeg",
            media_filename="foto.jpg",
        )

        self.assertTrue(queued)
        self.assertEqual(db.commits, 0)
        self.assertTrue(any("update public.crm_whatsapp_mensagens" in sql.lower() for sql, _ in db.calls))
        insert_sql, insert_params = next((sql, params) for sql, params in db.calls if "insert into public.crm_message_jobs" in sql.lower())
        self.assertIn("media_download", insert_sql.lower())
        self.assertTrue(insert_params["payload"])
