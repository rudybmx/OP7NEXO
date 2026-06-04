from __future__ import annotations

import uuid
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import canais
from app.services import whatsapp_crm_persistence
from app.services import whatsapp_event_queue
from app.services import whatsapp_event_worker
from app.services import whatsapp_media
from app.services.waha_normalizer import adapt_waha_to_evolution


class _Result:
    def __init__(self, row=None, mapping=None, rows=None, scalar_value=None, rowcount=0):
        self._row = row
        self._mapping = mapping
        self._rows = rows or []
        self._scalar_value = scalar_value
        self.rowcount = rowcount

    def fetchone(self):
        return self._row

    def fetchall(self):
        return self._rows

    def scalar(self):
        if self._scalar_value is not None:
            return self._scalar_value
        if isinstance(self._row, tuple):
            return self._row[0]
        if isinstance(self._row, dict):
            return self._row.get("id")
        return None

    def mappings(self):
        return self

    def first(self):
        return self._mapping


class _WebhookQuery:
    def __init__(self, canal):
        self._canal = canal

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._canal


class _WebhookDb:
    def __init__(self, canal):
        self._canal = canal
        self.commits = 0
        self.rollbacks = 0

    def query(self, _model):
        return _WebhookQuery(self._canal)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class _QueueDb:
    def __init__(self):
        self.events_by_hash: dict[str, dict[str, str]] = {}
        self.jobs_by_raw_event_id: dict[str, dict[str, str]] = {}
        self.calls: list[tuple[str, dict | None]] = []

    def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        sql_lower = sql.lower()
        self.calls.append((sql, params))

        if "insert into public.crm_whatsapp_eventos" in sql_lower:
            event_hash = params["event_hash"]
            if event_hash in self.events_by_hash:
                return _Result()
            event_id = str(uuid.uuid4())
            self.events_by_hash[event_hash] = {"id": event_id, "processing_status": "pending"}
            return _Result(row=(event_id,))

        if "select id, processing_status" in sql_lower and "from public.crm_whatsapp_eventos" in sql_lower:
            event_hash = params["event_hash"]
            row = self.events_by_hash.get(event_hash)
            if not row:
                return _Result()
            return _Result(row=(row["id"], row["processing_status"]))

        if "insert into public.crm_message_jobs" in sql_lower:
            assert (
                "on conflict (raw_event_id) where raw_event_id is not null and job_type = 'webhook_event' do nothing"
                in sql_lower
            ), sql
            raw_event_id = params["raw_event_id"]
            if raw_event_id in self.jobs_by_raw_event_id:
                return _Result()
            job_id = str(uuid.uuid4())
            self.jobs_by_raw_event_id[raw_event_id] = {"id": job_id}
            return _Result(row=(job_id,))

        raise AssertionError(f"Unexpected SQL: {sql}")


class _PersistenceDb:
    def __init__(self):
        self.messages_by_hash: dict[str, dict[str, str]] = {}
        self.messages_by_evolution_id: dict[str, dict[str, str]] = {}
        self.message_params_by_id: dict[str, dict] = {}
        self.receipt_updates: list[tuple[str, str]] = []
        self.commits = 0
        self.calls: list[tuple[str, dict | None]] = []

    def execute(self, stmt, params=None):
        sql = str(stmt)
        self.calls.append((sql, params))

        if "SELECT id, conversa_id" in sql and "evolution_msg_id = :evolution_msg_id" in sql:
            evolution_msg_id = params["evolution_msg_id"]
            if not evolution_msg_id:
                return _Result()
            row = self.messages_by_evolution_id.get(evolution_msg_id)
            if not row:
                return _Result()
            return _Result(mapping={"id": row["id"], "conversa_id": row["conversa_id"], "remote_jid": row.get("remote_jid")})

        if "SELECT id, conversa_id" in sql and "message_hash = :message_hash" in sql:
            row = self.messages_by_hash.get(params["message_hash"])
            if not row:
                return _Result()
            return _Result(mapping={"id": row["id"], "conversa_id": row["conversa_id"]})

        if "SELECT id FROM public.crm_whatsapp_mensagens" in sql and "direcao = 'saida'" in sql:
            row = None
            if params.get("evid"):
                row = self.messages_by_evolution_id.get(params["evid"])
            elif params.get("message_hash"):
                row = self.messages_by_hash.get(params["message_hash"])
            return _Result(row=(row["id"],) if row else None)

        if "UPDATE public.crm_whatsapp_mensagens" in sql and "status = 'entregue'" in sql:
            row = self.messages_by_evolution_id.get(params.get("evid")) or self.messages_by_hash.get(params.get("message_hash"))
            if row:
                self.message_params_by_id[row["id"]].update(params)
                if "mt" in params:
                    self.message_params_by_id[row["id"]]["message_type"] = params["mt"]
            return _Result(rowcount=1 if row else 0)

        if "UPDATE public.crm_whatsapp_mensagens" in sql and "media_status" in sql:
            row = self.message_params_by_id.get(str(params.get("mensagem_id")))
            if row:
                row.update(params)
            return _Result(rowcount=1 if row else 0)

        if "INSERT INTO public.crm_whatsapp_mensagens" in sql:
            message_hash = params["message_hash"]
            if message_hash in self.messages_by_hash:
                return _Result()
            message_id = str(uuid.uuid4())
            conversa_id = str(params["cid"])
            row = {"id": message_id, "conversa_id": conversa_id, "remote_jid": params["jid"]}
            self.messages_by_hash[message_hash] = row
            self.message_params_by_id[message_id] = dict(params)
            evolution_msg_id = params.get("evid")
            if evolution_msg_id:
                self.messages_by_evolution_id[evolution_msg_id] = row
            return _Result(scalar_value=message_id)

        if "update public.crm_whatsapp_mensagens" in sql.lower() and "set wa_status = :status" in sql.lower():
            evolution_msg_id = params["evid"]
            row = self.messages_by_evolution_id.get(evolution_msg_id)
            if row:
                row["wa_status"] = params["status"]
                if params["status"] == "delivered":
                    row["delivered_at"] = True
                elif params["status"] == "read":
                    row["read_at"] = True
                self.receipt_updates.append((evolution_msg_id, params["status"]))
            return _Result(rowcount=1 if row else 0)

        raise AssertionError(f"Unexpected SQL: {sql}")

    def commit(self):
        self.commits += 1


class _WorkerDb:
    def __init__(self, canal, job_id: str, event_id: str, raw_event: dict[str, object]):
        self._canal = canal
        self.jobs = {
            job_id: {
                "id": job_id,
                "attempts": 0,
                "max_attempts": 5,
                "workspace_id": str(canal.workspace_id),
                "canal_id": str(canal.id),
                "job_type": "webhook_event",
                "related_message_id": None,
                "job_payload": {"event_type": "MESSAGE"},
                "event_id": event_id,
                "event": "Message",
                "event_type": "MESSAGE",
                "payload": raw_event,
                "raw_event_id": event_id,
                "status": "pending",
            }
        }
        self.events = {
            event_id: {
                "id": event_id,
                "processing_status": "pending",
                "processed_at": None,
                "error_message": None,
            }
        }
        self.commits = 0
        self.calls: list[tuple[str, dict | None]] = []

    def query(self, _model):
        return _WebhookQuery(self._canal)

    def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        sql_lower = sql.lower()
        self.calls.append((sql, params))

        if "from public.crm_message_jobs" in sql_lower and "for update skip locked" in sql_lower:
            rows = []
            for job in self.jobs.values():
                if job["status"] in {"pending", "error"} and job["attempts"] < job["max_attempts"]:
                    rows.append((job["id"],))
            return _Result(rows=rows)

        if "set status = 'running'" in sql_lower:
            job = self.jobs[params["job_id"]]
            job["status"] = "running"
            job["attempts"] += 1
            return _Result()

        if "from public.crm_message_jobs j" in sql_lower and "left join public.crm_whatsapp_eventos e" in sql_lower:
            job = self.jobs[params["job_id"]]
            event = self.events[job["event_id"]]
            return _Result(
                mapping={
                    "id": job["id"],
                    "attempts": job["attempts"],
                    "max_attempts": job["max_attempts"],
                    "workspace_id": job["workspace_id"],
                    "canal_id": job["canal_id"],
                    "job_type": job["job_type"],
                    "related_message_id": job["related_message_id"],
                    "job_payload": job["job_payload"],
                    "event_id": event["id"],
                    "event": job["event"],
                    "event_type": job["event_type"],
                    "payload": job["payload"],
                }
            )

        if "update public.crm_message_jobs" in sql_lower and "processed_at = now()" in sql_lower:
            job = self.jobs[params["job_id"]]
            job["status"] = params["status"]
            job["processed_at"] = True
            job["locked_at"] = None
            job["locked_by"] = None
            job["error_message"] = None
            return _Result()

        if "update public.crm_whatsapp_eventos" in sql_lower and "processed_at = now()" in sql_lower:
            event = self.events[params["event_id"]]
            event["processing_status"] = params["status"]
            event["processed_at"] = True
            event["error_message"] = None
            return _Result()

        raise AssertionError(f"Unexpected SQL: {sql}")

    def commit(self):
        self.commits += 1


class _SessionContext:
    def __init__(self, db):
        self._db = db

    def __enter__(self):
        return self._db

    def __exit__(self, exc_type, exc, tb):
        return False


def _build_webhook_app(canal):
    app = FastAPI()
    app.include_router(canais.router)

    def override_get_db():
        yield _WebhookDb(canal)

    app.dependency_overrides[canais.get_db] = override_get_db
    return app


def _build_message_payload():
    return {
        "event": "Message",
        "data": {
            "Info": {
                "Chat": "5511999999999@s.whatsapp.net",
                "Sender": "5511999999999@s.whatsapp.net",
                "IsFromMe": False,
                "ID": "",
                "PushName": "Lead",
            },
            "Message": {"conversation": "Oi"},
        },
    }


def _build_media_message_payload():
    return {
        "event": "Message",
        "data": {
            "Info": {
                "Chat": "554391996849@s.whatsapp.net",
                "Sender": "554391996849@s.whatsapp.net",
                "IsFromMe": False,
                "ID": "media-msg-1",
                "PushName": "Lead",
                "Type": "media",
                "MediaType": "image",
                "Timestamp": "2026-05-29T17:28:57-03:00",
            },
            "Message": {
                "base64": "Zm9v",
                "imageMessage": {
                    "URL": "https://example.invalid/image.jpg",
                    "mimetype": "image/jpeg",
                    "fileName": "foto.jpg",
                    "caption": "Foto do pedido",
                },
            },
        },
    }


def _build_audio_message_payload():
    return {
        "event": "Message",
        "data": {
            "Info": {
                "Chat": "554391996849@s.whatsapp.net",
                "Sender": "554391996849@s.whatsapp.net",
                "IsFromMe": False,
                "ID": "audio-msg-1",
                "PushName": "Lead",
                "Type": "media",
                "MediaType": "audio",
                "Timestamp": "2026-05-29T17:28:57-03:00",
            },
            "Message": {
                "base64": "Zm9v",
                "audioMessage": {
                    "URL": "https://example.invalid/audio.ogg",
                    "mimetype": "audio/ogg",
                    "fileName": "audio.ogg",
                },
            },
        },
    }


def _build_waha_manual_outbound_payload(raw_id: str = "true_554788888888@c.us_3EB0MANUAL001"):
    return adapt_waha_to_evolution(
        {
            "event": "message.any",
            "session": "op7-waha",
            "payload": {
                "id": raw_id,
                "from": "554799999999@c.us",
                "to": "554788888888@c.us",
                "chatId": "554788888888@c.us",
                "fromMe": True,
                "body": "Mensagem manual",
                "hasMedia": False,
                "timestamp": 1_780_515_900,
                "pushName": "Atendimento",
            },
        }
    )


def _build_waha_manual_outbound_media_payload(
    raw_id: str = "true_554788888888@c.us_3EB0MEDIA001",
    *,
    url: str | None = "http://minio:9000/waha/op7-waha/3EB0MEDIA001.jpeg",
):
    media: dict[str, object] = {
        "mimetype": "image/jpeg",
        "filename": "foto.jpeg",
    }
    if url is not None:
        media["url"] = url
    else:
        media["error"] = "media download disabled"
    return adapt_waha_to_evolution(
        {
            "event": "message.any",
            "session": "op7-waha",
            "payload": {
                "id": raw_id,
                "from": "554799999999@c.us",
                "to": "554788888888@c.us",
                "chatId": "554788888888@c.us",
                "fromMe": True,
                "body": "[mídia]",
                "caption": "Foto manual",
                "hasMedia": True,
                "type": "image",
                "media": media,
                "timestamp": 1_780_515_900,
                "pushName": "Atendimento",
            },
        }
    )


def test_webhook_evolution_responde_rapido_e_preserva_workspace_do_canal(monkeypatch):
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        webhook_token="token-webhook",
        evolution_instance_id="op7-test-instance",
        nome="Canal WhatsApp",
        tipo="whatsapp_evolution",
    )
    app = _build_webhook_app(canal)
    payload = deepcopy(_build_message_payload())
    payload["workspace_id"] = "workspace-forced-by-payload"
    received = {}

    def fake_enqueue(db, canal_arg, event, payload_arg):
        received["db"] = db
        received["canal_workspace_id"] = canal_arg.workspace_id
        received["payload_workspace_id"] = payload_arg.get("workspace_id")
        return {"event_id": "evt-1", "queued": True, "inserted": True}

    monkeypatch.setattr(canais, "enqueue_evolution_event", fake_enqueue)

    client = TestClient(app)
    response = client.post(f"/webhook/evolution/{canal.webhook_token}", json=payload)

    assert response.status_code == 200
    assert response.json() == {
        "recebido": True,
        "event_id": "evt-1",
        "queued": True,
        "duplicate": False,
    }
    assert received["canal_workspace_id"] == canal.workspace_id
    assert received["payload_workspace_id"] == "workspace-forced-by-payload"


def test_webhook_evolution_token_invalido_retorna_404():
    app = _build_webhook_app(None)
    client = TestClient(app)

    response = client.post("/webhook/evolution/token-invalido", json=_build_message_payload())

    assert response.status_code == 404


def test_enqueue_evolution_event_e_replay_idempotente_sem_provider_id():
    canal = SimpleNamespace(id=uuid.uuid4(), workspace_id=uuid.uuid4(), evolution_instance_id="op7-instance")
    db = _QueueDb()
    payload = _build_message_payload()
    payload["event"] = "Message"
    payload["data"]["Info"].pop("ID", None)

    first = whatsapp_event_queue.enqueue_evolution_event(db, canal, "Message", payload)
    replay = deepcopy(payload)
    replay["data"]["Info"]["PushName"] = "Lead alterado"
    second = whatsapp_event_queue.enqueue_evolution_event(db, canal, "Message", replay)

    assert first["inserted"] is True
    assert first["queued"] is True
    assert second["inserted"] is False
    assert second["queued"] is False
    assert first["event_hash"] == second["event_hash"]
    assert len(db.events_by_hash) == 1
    assert len(db.jobs_by_raw_event_id) == 1


def test_process_evolution_message_fallback_hash_nao_duplica_sem_provider_id(monkeypatch):
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        evolution_instance_id="op7-instance",
        numero_telefone="5511999999999",
    )
    db = _PersistenceDb()
    payload = _build_message_payload()
    payload["data"]["Info"].pop("ID", None)

    monkeypatch.setattr(whatsapp_crm_persistence, "extract_lead_origin", lambda *args, **kwargs: {})
    monkeypatch.setattr(whatsapp_crm_persistence, "has_lead_origin", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(whatsapp_crm_persistence, "_resolve_lid_contact", lambda *args, **kwargs: (kwargs["remote_jid"], None))
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_participant_contact", lambda *args, **kwargs: None)
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_contact", lambda *args, **kwargs: "contact-1")
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_conversation", lambda *args, **kwargs: "conversation-1")

    published = []
    monkeypatch.setattr(whatsapp_crm_persistence, "publish_whatsapp_event", lambda event: published.append(event))

    first = whatsapp_crm_persistence.process_evolution_message(db, canal, deepcopy(payload))
    second = whatsapp_crm_persistence.process_evolution_message(db, canal, deepcopy(payload))

    assert first is not None
    assert second is not None
    assert first["mensagem_id"] == second["mensagem_id"]
    assert db.commits == 1
    assert len(db.messages_by_hash) == 1
    assert len(published) == 1


def test_process_waha_message_any_from_me_cria_outbound_sem_envio_previo(monkeypatch):
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        evolution_instance_id=None,
        numero_telefone="554799999999",
    )
    db = _PersistenceDb()
    payload = _build_waha_manual_outbound_payload()

    monkeypatch.setattr(whatsapp_crm_persistence, "extract_lead_origin", lambda *args, **kwargs: {})
    monkeypatch.setattr(whatsapp_crm_persistence, "has_lead_origin", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(whatsapp_crm_persistence, "_resolve_lid_contact", lambda *args, **kwargs: (kwargs["remote_jid"], None))
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_participant_contact", lambda *args, **kwargs: None)
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_contact", lambda *args, **kwargs: "contact-1")

    conversations = []

    def fake_upsert_conversation(*args, **kwargs):
        conversations.append(kwargs)
        return "conversation-1"

    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_conversation", fake_upsert_conversation)
    published = []
    monkeypatch.setattr(whatsapp_crm_persistence, "publish_whatsapp_event", lambda event: published.append(event))

    result = whatsapp_crm_persistence.process_evolution_webhook_event(
        db,
        canal,
        "messages.upsert",
        deepcopy(payload),
        raw_event_id="event-manual-1",
    )

    assert result["status"] == "done"
    assert result["result"]["from_me"] is True
    assert result["result"]["evolution_msg_id"] == "3EB0MANUAL001"
    assert result["result"]["instance"] == "op7-waha"
    assert conversations[0]["direction"] == "saida"
    inserted_params = db.message_params_by_id[result["result"]["mensagem_id"]]
    assert inserted_params["inst"] == "op7-waha"
    assert inserted_params["direction"] == "saida"
    assert inserted_params["from_me"] is True
    assert inserted_params["remetente_tipo"] == "agente"
    assert inserted_params["sent_ts"] is not None
    assert inserted_params["ts"] is None
    assert published and published[0]["direction"] == "saida"


def test_process_waha_message_any_from_me_com_midia_enfileira_download(monkeypatch):
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        evolution_instance_id=None,
        numero_telefone="554799999999",
        tipo="whatsapp_waha",
        config={"waha": {"session": "op7-waha", "api_base_url": "http://waha:3000", "api_key_ref": "waha_key"}},
    )
    db = _PersistenceDb()
    payload = _build_waha_manual_outbound_media_payload()

    monkeypatch.setattr(whatsapp_crm_persistence, "extract_lead_origin", lambda *args, **kwargs: {})
    monkeypatch.setattr(whatsapp_crm_persistence, "has_lead_origin", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(whatsapp_crm_persistence, "_resolve_lid_contact", lambda *args, **kwargs: (kwargs["remote_jid"], None))
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_participant_contact", lambda *args, **kwargs: None)
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_contact", lambda *args, **kwargs: "contact-1")
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_conversation", lambda *args, **kwargs: "conversation-1")
    monkeypatch.setattr(whatsapp_crm_persistence, "publish_whatsapp_event", lambda event: None)

    enqueued = []
    monkeypatch.setattr(
        whatsapp_crm_persistence,
        "enqueue_inbound_media_download",
        lambda db_arg, **kwargs: enqueued.append(kwargs) or True,
    )

    result = whatsapp_crm_persistence.process_evolution_webhook_event(
        db,
        canal,
        "messages.upsert",
        deepcopy(payload),
        raw_event_id="event-media-1",
    )

    assert result["status"] == "done"
    assert result["result"]["from_me"] is True
    assert result["result"]["is_media"] is True
    assert result["result"]["provider"] == "whatsapp_waha"
    assert result["result"]["full_message_id"] == "true_554788888888@c.us_3EB0MEDIA001"
    inserted_params = db.message_params_by_id[result["result"]["mensagem_id"]]
    assert inserted_params["from_me"] is True
    assert inserted_params["media_status"] == "pending"
    assert inserted_params["sent_ts"] is not None
    assert inserted_params["ts"] is None
    assert enqueued
    assert enqueued[0]["media_url"] == "http://minio:9000/waha/op7-waha/3EB0MEDIA001.jpeg"
    assert enqueued[0]["media_mime_type"] == "image/jpeg"
    assert enqueued[0]["media_filename"] == "foto.jpeg"
    assert enqueued[0]["media_caption"] == "Foto manual"
    assert enqueued[0]["provider"] == "whatsapp_waha"
    assert enqueued[0]["provider_full_message_id"] == "true_554788888888@c.us_3EB0MEDIA001"
    assert enqueued[0]["provider_chat_id"] == "554788888888@s.whatsapp.net"
    assert enqueued[0]["provider_participant_jid"] == ""
    assert enqueued[0]["waha_session"] == "op7-waha"
    assert db.commits == 2


def test_process_waha_message_any_from_me_midia_sem_url_registra_erro_sem_job(monkeypatch):
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        evolution_instance_id=None,
        numero_telefone="554799999999",
        tipo="whatsapp_waha",
        config={"waha": {"session": "op7-waha"}},
    )
    db = _PersistenceDb()
    payload = _build_waha_manual_outbound_media_payload(url=None)

    monkeypatch.setattr(whatsapp_crm_persistence, "extract_lead_origin", lambda *args, **kwargs: {})
    monkeypatch.setattr(whatsapp_crm_persistence, "has_lead_origin", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(whatsapp_crm_persistence, "_resolve_lid_contact", lambda *args, **kwargs: (kwargs["remote_jid"], None))
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_participant_contact", lambda *args, **kwargs: None)
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_contact", lambda *args, **kwargs: "contact-1")
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_conversation", lambda *args, **kwargs: "conversation-1")
    monkeypatch.setattr(whatsapp_crm_persistence, "publish_whatsapp_event", lambda event: None)

    enqueued = []
    monkeypatch.setattr(
        whatsapp_crm_persistence,
        "enqueue_inbound_media_download",
        lambda db_arg, **kwargs: enqueued.append(kwargs) or True,
    )

    result = whatsapp_crm_persistence.process_evolution_webhook_event(
        db,
        canal,
        "messages.upsert",
        deepcopy(payload),
        raw_event_id="event-media-no-url-1",
    )

    assert result["status"] == "done"
    assert result["result"]["from_me"] is True
    assert result["result"]["is_media"] is False
    inserted_params = db.message_params_by_id[result["result"]["mensagem_id"]]
    assert inserted_params["media_status"] == "error"
    assert inserted_params["media_error"] == "media download disabled"
    assert enqueued == []
    assert db.commits == 1


def test_message_e_message_any_mesmo_id_nao_duplica(monkeypatch):
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        evolution_instance_id=None,
        numero_telefone="554799999999",
    )
    db = _PersistenceDb()
    payload_message = _build_waha_manual_outbound_payload("3EB0MANUAL001")
    payload_any = _build_waha_manual_outbound_payload("true_554788888888@c.us_3EB0MANUAL001")

    monkeypatch.setattr(whatsapp_crm_persistence, "extract_lead_origin", lambda *args, **kwargs: {})
    monkeypatch.setattr(whatsapp_crm_persistence, "has_lead_origin", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(whatsapp_crm_persistence, "_resolve_lid_contact", lambda *args, **kwargs: (kwargs["remote_jid"], None))
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_participant_contact", lambda *args, **kwargs: None)
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_contact", lambda *args, **kwargs: "contact-1")
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_conversation", lambda *args, **kwargs: "conversation-1")
    monkeypatch.setattr(whatsapp_crm_persistence, "publish_whatsapp_event", lambda event: None)

    first = whatsapp_crm_persistence.process_evolution_webhook_event(db, canal, "messages.upsert", deepcopy(payload_message))
    second = whatsapp_crm_persistence.process_evolution_webhook_event(db, canal, "messages.upsert", deepcopy(payload_any))

    assert first["result"]["mensagem_id"] == second["result"]["mensagem_id"]
    assert len(db.messages_by_evolution_id) == 1
    assert len(db.messages_by_hash) == 1


def test_find_existing_message_ignora_id_em_remote_jid_diferente():
    db = _PersistenceDb()
    db.messages_by_evolution_id["3EB0MANUAL001"] = {
        "id": "msg-1",
        "conversa_id": "conversation-1",
        "remote_jid": "120363418928267817@g.us",
    }

    result = whatsapp_crm_persistence._find_existing_message(
        db,
        workspace_id="workspace-1",
        canal_id="canal-1",
        instance="op7-instance",
        evolution_msg_id="3EB0MANUAL001",
        remote_jid="120363403111619314@g.us",
        message_hash="hash-1",
    )

    assert result is None


def test_message_any_duplicado_mesmo_id_mescla_midia_sem_duplicar(monkeypatch):
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        evolution_instance_id=None,
        numero_telefone="554799999999",
        tipo="whatsapp_waha",
        config={"waha": {"session": "op7-waha", "api_base_url": "http://waha:3000", "api_key_ref": "waha_key"}},
    )
    db = _PersistenceDb()
    payload_text = _build_waha_manual_outbound_payload("true_554788888888@c.us_3EB0MEDIA001")
    payload_media = _build_waha_manual_outbound_media_payload("true_554788888888@c.us_3EB0MEDIA001")

    monkeypatch.setattr(whatsapp_crm_persistence, "extract_lead_origin", lambda *args, **kwargs: {})
    monkeypatch.setattr(whatsapp_crm_persistence, "has_lead_origin", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(whatsapp_crm_persistence, "_resolve_lid_contact", lambda *args, **kwargs: (kwargs["remote_jid"], None))
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_participant_contact", lambda *args, **kwargs: None)
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_contact", lambda *args, **kwargs: "contact-1")
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_conversation", lambda *args, **kwargs: "conversation-1")
    monkeypatch.setattr(whatsapp_crm_persistence, "publish_whatsapp_event", lambda event: None)

    enqueued = []
    monkeypatch.setattr(
        whatsapp_crm_persistence,
        "enqueue_inbound_media_download",
        lambda db_arg, **kwargs: enqueued.append(kwargs) or True,
    )

    first = whatsapp_crm_persistence.process_evolution_webhook_event(db, canal, "messages.upsert", deepcopy(payload_text))
    second = whatsapp_crm_persistence.process_evolution_webhook_event(db, canal, "messages.upsert", deepcopy(payload_media))

    assert first["result"]["mensagem_id"] == second["result"]["mensagem_id"]
    assert len(db.messages_by_evolution_id) == 1
    assert len(db.messages_by_hash) == 1
    stored = db.message_params_by_id[first["result"]["mensagem_id"]]
    assert stored["media_status"] == "pending"
    assert stored["message_type"] == "imageMessage"
    assert enqueued
    assert enqueued[0]["mensagem_id"] == first["result"]["mensagem_id"]


def test_message_ack_sem_mensagem_nao_cria_e_nao_falha(monkeypatch):
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        evolution_instance_id="op7-waha",
    )
    db = _PersistenceDb()
    payload = {
        "event": "messages.update",
        "instance": "op7-waha",
        "data": {
            "key": {
                "id": "3EB0INEXISTENTE",
                "remoteJid": "554788888888@s.whatsapp.net",
                "fromMe": True,
            },
            "status": "delivered",
        },
    }
    published = []
    monkeypatch.setattr(whatsapp_crm_persistence, "publish_whatsapp_event", lambda event: published.append(event))

    result = whatsapp_crm_persistence.process_evolution_receipt_event(db, canal, payload, event="messages.update")

    assert result["message_ids"] == ["3EB0INEXISTENTE"]
    assert result["status"] == "delivered"
    assert db.messages_by_evolution_id == {}
    assert db.messages_by_hash == {}
    assert db.receipt_updates == []
    assert db.commits == 1
    assert published and published[0]["type"] == "message.status"


def test_process_evolution_webhook_event_media_enfileira_download(monkeypatch):
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        evolution_instance_id="op7-instance",
        numero_telefone="5511999999999",
    )
    db = _PersistenceDb()
    payload = _build_media_message_payload()

    monkeypatch.setattr(whatsapp_crm_persistence, "extract_lead_origin", lambda *args, **kwargs: {})
    monkeypatch.setattr(whatsapp_crm_persistence, "has_lead_origin", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(whatsapp_crm_persistence, "_resolve_lid_contact", lambda *args, **kwargs: (kwargs["remote_jid"], None))
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_participant_contact", lambda *args, **kwargs: None)
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_contact", lambda *args, **kwargs: "contact-1")
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_conversation", lambda *args, **kwargs: "conversation-1")

    published = []
    monkeypatch.setattr(whatsapp_crm_persistence, "publish_whatsapp_event", lambda event: published.append(event))

    enqueued = []

    def fake_enqueue(db_arg, **kwargs):
        enqueued.append(kwargs)
        return True

    monkeypatch.setattr(whatsapp_crm_persistence, "enqueue_inbound_media_download", fake_enqueue)

    result = whatsapp_crm_persistence.process_evolution_webhook_event(
        db,
        canal,
        "Message",
        deepcopy(payload),
        raw_event_id="event-1",
    )

    assert result["status"] == "done"
    assert result["event_type"] == "MESSAGE"
    assert enqueued
    assert enqueued[0]["workspace_id"] == str(canal.workspace_id)
    assert enqueued[0]["canal_id"] == str(canal.id)
    assert enqueued[0]["raw_event_id"] == "event-1"
    assert enqueued[0]["mensagem_id"] == db.messages_by_hash[next(iter(db.messages_by_hash))]["id"]
    assert enqueued[0]["evolution_msg_id"] == "media-msg-1"
    assert enqueued[0]["media_base64"] == "Zm9v"
    assert db.commits == 2
    assert published and published[0]["type"] == "message.upsert"


def test_process_evolution_media_sem_url_continua_enfileirando_fallback(monkeypatch):
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        evolution_instance_id="op7-instance",
        numero_telefone="5511999999999",
        tipo="whatsapp_evolution",
    )
    db = _PersistenceDb()
    payload = _build_media_message_payload()
    payload["data"]["Message"].pop("base64", None)
    payload["data"]["Message"]["imageMessage"].pop("URL", None)

    monkeypatch.setattr(whatsapp_crm_persistence, "extract_lead_origin", lambda *args, **kwargs: {})
    monkeypatch.setattr(whatsapp_crm_persistence, "has_lead_origin", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(whatsapp_crm_persistence, "_resolve_lid_contact", lambda *args, **kwargs: (kwargs["remote_jid"], None))
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_participant_contact", lambda *args, **kwargs: None)
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_contact", lambda *args, **kwargs: "contact-1")
    monkeypatch.setattr(whatsapp_crm_persistence, "_upsert_conversation", lambda *args, **kwargs: "conversation-1")
    monkeypatch.setattr(whatsapp_crm_persistence, "publish_whatsapp_event", lambda event: None)

    enqueued = []
    monkeypatch.setattr(
        whatsapp_crm_persistence,
        "enqueue_inbound_media_download",
        lambda db_arg, **kwargs: enqueued.append(kwargs) or True,
    )

    result = whatsapp_crm_persistence.process_evolution_webhook_event(
        db,
        canal,
        "Message",
        deepcopy(payload),
        raw_event_id="event-fallback-1",
    )

    assert result["status"] == "done"
    assert result["result"]["is_media"] is True
    inserted_params = db.message_params_by_id[result["result"]["mensagem_id"]]
    assert inserted_params["media_status"] == "pending"
    assert inserted_params["media_error"] is None
    assert enqueued
    assert enqueued[0]["media_url"] is None
    assert enqueued[0]["media_base64"] is None


def test_process_evolution_receipt_event_atualiza_status_da_mensagem_outbound(monkeypatch):
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        evolution_instance_id="op7-instance",
    )
    db = _PersistenceDb()
    evolution_msg_id = "cfa2d37b-6163-4047-8ae1-a5bc4d068627"
    db.messages_by_evolution_id[evolution_msg_id] = {
        "id": "msg-1",
        "conversa_id": "conversation-1",
        "wa_status": "pending",
        "delivered_at": None,
        "read_at": None,
    }
    payload = {
        "event": "Receipt",
        "data": {
            "Info": {
                "Chat": "554391996849@s.whatsapp.net",
                "Sender": "554391673791:2@s.whatsapp.net",
                "IsFromMe": False,
                "MessageIDs": [evolution_msg_id],
                "Timestamp": "2026-05-29T17:22:48-03:00",
            }
        },
    }

    published = []
    monkeypatch.setattr(whatsapp_crm_persistence, "publish_whatsapp_event", lambda event: published.append(event))

    result = whatsapp_crm_persistence.process_evolution_receipt_event(db, canal, payload, event="Receipt")

    assert result is not None
    assert result["message_ids"] == [evolution_msg_id]
    assert result["status"] == "delivered"
    assert db.messages_by_evolution_id[evolution_msg_id]["wa_status"] == "delivered"
    assert db.messages_by_evolution_id[evolution_msg_id]["delivered_at"] is True
    assert db.messages_by_evolution_id[evolution_msg_id]["read_at"] is None
    assert db.commits == 1
    assert db.receipt_updates == [(evolution_msg_id, "delivered")]
    assert published and published[0]["evolutionMsgId"] == evolution_msg_id


class ReceiptReconciliationTests(unittest.TestCase):
    def test_process_evolution_receipt_event_atualiza_status_da_mensagem_outbound(self):
        canal = SimpleNamespace(
            id=uuid.uuid4(),
            workspace_id=uuid.uuid4(),
            evolution_instance_id="op7-instance",
        )
        db = _PersistenceDb()
        evolution_msg_id = "cfa2d37b-6163-4047-8ae1-a5bc4d068627"
        db.messages_by_evolution_id[evolution_msg_id] = {
            "id": "msg-1",
            "conversa_id": "conversation-1",
            "wa_status": "pending",
            "delivered_at": None,
            "read_at": None,
        }
        payload = {
            "event": "Receipt",
            "data": {
                "Info": {
                    "Chat": "554391996849@s.whatsapp.net",
                    "Sender": "554391673791:2@s.whatsapp.net",
                    "IsFromMe": False,
                    "MessageIDs": [evolution_msg_id],
                    "Timestamp": "2026-05-29T17:22:48-03:00",
                }
            },
        }

        published = []
        with patch.object(
            whatsapp_crm_persistence,
            "publish_whatsapp_event",
            side_effect=lambda event: published.append(event),
        ):
            result = whatsapp_crm_persistence.process_evolution_receipt_event(db, canal, payload, event="Receipt")

        self.assertIsNotNone(result)
        self.assertEqual(result["message_ids"], [evolution_msg_id])
        self.assertEqual(result["status"], "delivered")
        self.assertEqual(db.messages_by_evolution_id[evolution_msg_id]["wa_status"], "delivered")
        self.assertTrue(db.messages_by_evolution_id[evolution_msg_id]["delivered_at"])
        self.assertIsNone(db.messages_by_evolution_id[evolution_msg_id]["read_at"])
        self.assertEqual(db.commits, 1)
        self.assertEqual(db.receipt_updates, [(evolution_msg_id, "delivered")])
        self.assertTrue(published)
        self.assertEqual(published[0]["evolutionMsgId"], evolution_msg_id)


class TextWebhookTests(unittest.TestCase):
    def test_process_evolution_message_fallback_hash_nao_duplica_sem_provider_id(self):
        canal = SimpleNamespace(
            id=uuid.uuid4(),
            workspace_id=uuid.uuid4(),
            evolution_instance_id="op7-instance",
            numero_telefone="5511999999999",
        )
        db = _PersistenceDb()
        payload = _build_message_payload()
        payload["data"]["Info"].pop("ID", None)

        with (
            patch.object(whatsapp_crm_persistence, "extract_lead_origin", return_value={}),
            patch.object(whatsapp_crm_persistence, "has_lead_origin", return_value=False),
            patch.object(whatsapp_crm_persistence, "_resolve_lid_contact", return_value=("5511999999999@s.whatsapp.net", None)),
            patch.object(whatsapp_crm_persistence, "_upsert_participant_contact", return_value=None),
            patch.object(whatsapp_crm_persistence, "_upsert_contact", return_value="contact-1"),
            patch.object(whatsapp_crm_persistence, "_upsert_conversation", return_value="conversation-1"),
            patch.object(whatsapp_crm_persistence, "publish_whatsapp_event"),
        ):
            first = whatsapp_crm_persistence.process_evolution_message(db, canal, deepcopy(payload))
            second = whatsapp_crm_persistence.process_evolution_message(db, canal, deepcopy(payload))

        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        self.assertEqual(first["mensagem_id"], second["mensagem_id"])
        self.assertEqual(db.commits, 1)
        self.assertEqual(len(db.messages_by_hash), 1)


def test_worker_processa_job_e_marca_status(monkeypatch):
    canal = SimpleNamespace(id=uuid.uuid4(), workspace_id=uuid.uuid4(), evolution_instance_id="op7-instance", nome="Canal")
    job_id = str(uuid.uuid4())
    event_id = str(uuid.uuid4())
    payload = _build_message_payload()
    db = _WorkerDb(canal, job_id, event_id, payload)

    calls = []

    def fake_process(db, canal, event, data, raw_event_id=None):
        calls.append(
            {
                "db": db,
                "canal": canal,
                "event": event,
                "data": data,
                "raw_event_id": raw_event_id,
            }
        )
        return {"status": "done", "result": {"mensagem_id": "msg-1"}}

    monkeypatch.setattr(whatsapp_event_worker, "process_evolution_webhook_event", fake_process)
    monkeypatch.setattr(whatsapp_event_worker, "SessionLocal", lambda: _SessionContext(db))

    result = whatsapp_event_worker.process_next_whatsapp_jobs(limit=1)

    assert result == {"processed": 1, "failed": 0, "skipped": 0}
    assert calls and calls[0]["event"] == "MESSAGE"
    assert calls[0]["raw_event_id"] == event_id
    assert db.jobs[job_id]["status"] == "done"
    assert db.events[event_id]["processing_status"] == "done"


def test_worker_processa_media_download_job(monkeypatch):
    canal = SimpleNamespace(id=uuid.uuid4(), workspace_id=uuid.uuid4(), evolution_instance_id="op7-instance", nome="Canal")
    job_id = str(uuid.uuid4())
    event_id = str(uuid.uuid4())
    payload = _build_message_payload()
    db = _WorkerDb(canal, job_id, event_id, payload)
    db.jobs[job_id]["job_type"] = "media_download"
    db.jobs[job_id]["related_message_id"] = "msg-1"
    db.jobs[job_id]["job_payload"] = {
        "instance_name": "op7-instance",
        "evolution_msg_id": "media-msg-1",
        "mensagem_db_id": "msg-1",
        "conversa_db_id": "conversation-1",
        "message_type_raw": "imageMessage",
        "media_base64": "Zm9v",
        "media_url": None,
        "media_mime_type": "image/jpeg",
        "media_filename": "foto.jpg",
    }

    calls = []

    def fake_process_media_download_job(db_arg, job_arg):
        calls.append(job_arg)

    monkeypatch.setattr(whatsapp_media, "process_media_download_job", fake_process_media_download_job)
    monkeypatch.setattr(whatsapp_event_worker, "SessionLocal", lambda: _SessionContext(db))

    result = whatsapp_event_worker.process_next_whatsapp_jobs(limit=1)

    assert result == {"processed": 1, "failed": 0, "skipped": 0}
    assert calls and calls[0]["payload"]["evolution_msg_id"] == "media-msg-1"
    assert db.jobs[job_id]["status"] == "done"
    assert db.events[event_id]["processing_status"] == "done"


class WebhookMediaQueueTests(unittest.TestCase):
    def test_process_evolution_webhook_event_media_enfileira_download(self):
        canal = SimpleNamespace(
            id=uuid.uuid4(),
            workspace_id=uuid.uuid4(),
            evolution_instance_id="op7-instance",
            numero_telefone="5511999999999",
        )
        db = _PersistenceDb()
        payload = _build_media_message_payload()

        published = []
        enqueued = []

        with (
            patch.object(whatsapp_crm_persistence, "extract_lead_origin", return_value={}),
            patch.object(whatsapp_crm_persistence, "has_lead_origin", return_value=False),
            patch.object(whatsapp_crm_persistence, "_resolve_lid_contact", return_value=("554391996849@s.whatsapp.net", None)),
            patch.object(whatsapp_crm_persistence, "_upsert_participant_contact", return_value=None),
            patch.object(whatsapp_crm_persistence, "_upsert_contact", return_value="contact-1"),
            patch.object(whatsapp_crm_persistence, "_upsert_conversation", return_value="conversation-1"),
            patch.object(whatsapp_crm_persistence, "publish_whatsapp_event", side_effect=lambda event: published.append(event)),
            patch.object(
                whatsapp_crm_persistence,
                "enqueue_inbound_media_download",
                side_effect=lambda db_arg, **kwargs: enqueued.append(kwargs) or True,
            ),
        ):
            result = whatsapp_crm_persistence.process_evolution_webhook_event(
                db,
                canal,
                "Message",
                deepcopy(payload),
                raw_event_id="event-1",
            )

        self.assertEqual(result["status"], "done")
        self.assertEqual(result["event_type"], "MESSAGE")
        self.assertTrue(enqueued)
        self.assertEqual(enqueued[0]["workspace_id"], str(canal.workspace_id))
        self.assertEqual(enqueued[0]["canal_id"], str(canal.id))
        self.assertEqual(enqueued[0]["raw_event_id"], "event-1")
        self.assertEqual(enqueued[0]["mensagem_id"], result["result"]["mensagem_id"])
        self.assertEqual(enqueued[0]["evolution_msg_id"], "media-msg-1")
        self.assertEqual(enqueued[0]["media_base64"], "Zm9v")
        self.assertEqual(db.commits, 2)
        self.assertTrue(published)
        self.assertEqual(published[0]["type"], "message.upsert")

    def test_process_evolution_webhook_event_audio_enfileira_download(self):
        canal = SimpleNamespace(
            id=uuid.uuid4(),
            workspace_id=uuid.uuid4(),
            evolution_instance_id="op7-instance",
            numero_telefone="5511999999999",
        )
        db = _PersistenceDb()
        payload = _build_audio_message_payload()

        published = []
        enqueued = []

        with (
            patch.object(whatsapp_crm_persistence, "extract_lead_origin", return_value={}),
            patch.object(whatsapp_crm_persistence, "has_lead_origin", return_value=False),
            patch.object(whatsapp_crm_persistence, "_resolve_lid_contact", return_value=("554391996849@s.whatsapp.net", None)),
            patch.object(whatsapp_crm_persistence, "_upsert_participant_contact", return_value=None),
            patch.object(whatsapp_crm_persistence, "_upsert_contact", return_value="contact-1"),
            patch.object(whatsapp_crm_persistence, "_upsert_conversation", return_value="conversation-1"),
            patch.object(whatsapp_crm_persistence, "publish_whatsapp_event", side_effect=lambda event: published.append(event)),
            patch.object(
                whatsapp_crm_persistence,
                "enqueue_inbound_media_download",
                side_effect=lambda db_arg, **kwargs: enqueued.append(kwargs) or True,
            ),
        ):
            result = whatsapp_crm_persistence.process_evolution_webhook_event(
                db,
                canal,
                "Message",
                deepcopy(payload),
                raw_event_id="event-audio-1",
            )

        self.assertEqual(result["status"], "done")
        self.assertEqual(result["event_type"], "MESSAGE")
        self.assertTrue(enqueued)
        self.assertEqual(enqueued[0]["message_type_raw"], "audioMessage")
        self.assertEqual(enqueued[0]["media_mime_type"], "audio/ogg")
        self.assertEqual(enqueued[0]["media_url"], "https://example.invalid/audio.ogg")
        self.assertEqual(db.commits, 2)
        self.assertTrue(published)


class WorkerMediaDownloadTests(unittest.TestCase):
    def test_worker_processa_media_download_job(self):
        canal = SimpleNamespace(id=uuid.uuid4(), workspace_id=uuid.uuid4(), evolution_instance_id="op7-instance", nome="Canal")
        job_id = str(uuid.uuid4())
        event_id = str(uuid.uuid4())
        payload = _build_message_payload()
        db = _WorkerDb(canal, job_id, event_id, payload)
        db.jobs[job_id]["job_type"] = "media_download"
        db.jobs[job_id]["related_message_id"] = "msg-1"
        db.jobs[job_id]["job_payload"] = {
            "instance_name": "op7-instance",
            "evolution_msg_id": "media-msg-1",
            "mensagem_db_id": "msg-1",
            "conversa_db_id": "conversation-1",
            "message_type_raw": "imageMessage",
            "media_base64": "Zm9v",
            "media_url": None,
            "media_mime_type": "image/jpeg",
            "media_filename": "foto.jpg",
        }

        calls = []

        with (
            patch.object(whatsapp_media, "process_media_download_job", side_effect=lambda db_arg, job_arg: calls.append(job_arg)),
            patch.object(whatsapp_event_worker, "SessionLocal", lambda: _SessionContext(db)),
        ):
            result = whatsapp_event_worker.process_next_whatsapp_jobs(limit=1)

        self.assertEqual(result, {"processed": 1, "failed": 0, "skipped": 0})
        self.assertTrue(calls)
        self.assertEqual(calls[0]["payload"]["evolution_msg_id"], "media-msg-1")
        self.assertEqual(db.jobs[job_id]["status"], "done")
        self.assertEqual(db.events[event_id]["processing_status"], "done")
