from __future__ import annotations

import uuid
from copy import deepcopy
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import canais
from app.services import whatsapp_crm_persistence
from app.services import whatsapp_event_queue
from app.services import whatsapp_event_worker


class _Result:
    def __init__(self, row=None, mapping=None, rows=None, scalar_value=None):
        self._row = row
        self._mapping = mapping
        self._rows = rows or []
        self._scalar_value = scalar_value

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
        sql = str(stmt)
        self.calls.append((sql, params))

        if "INSERT INTO public.crm_whatsapp_eventos" in sql:
            event_hash = params["event_hash"]
            if event_hash in self.events_by_hash:
                return _Result()
            event_id = str(uuid.uuid4())
            self.events_by_hash[event_hash] = {"id": event_id, "processing_status": "pending"}
            return _Result(row=(event_id,))

        if "SELECT id, processing_status" in sql and "FROM public.crm_whatsapp_eventos" in sql:
            event_hash = params["event_hash"]
            row = self.events_by_hash.get(event_hash)
            if not row:
                return _Result()
            return _Result(row=(row["id"], row["processing_status"]))

        if "INSERT INTO public.crm_message_jobs" in sql:
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
            return _Result(mapping={"id": row["id"], "conversa_id": row["conversa_id"]})

        if "SELECT id, conversa_id" in sql and "message_hash = :message_hash" in sql:
            row = self.messages_by_hash.get(params["message_hash"])
            if not row:
                return _Result()
            return _Result(mapping={"id": row["id"], "conversa_id": row["conversa_id"]})

        if "INSERT INTO public.crm_whatsapp_mensagens" in sql:
            message_hash = params["message_hash"]
            if message_hash in self.messages_by_hash:
                return _Result()
            message_id = str(uuid.uuid4())
            conversa_id = str(params["cid"])
            row = {"id": message_id, "conversa_id": conversa_id}
            self.messages_by_hash[message_hash] = row
            evolution_msg_id = params.get("evid")
            if evolution_msg_id:
                self.messages_by_evolution_id[evolution_msg_id] = row
            return _Result(scalar_value=message_id)

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
        sql = str(stmt)
        self.calls.append((sql, params))

        if "FROM public.crm_message_jobs" in sql and "FOR UPDATE SKIP LOCKED" in sql:
            rows = []
            for job in self.jobs.values():
                if job["status"] in {"pending", "error"} and job["attempts"] < job["max_attempts"]:
                    rows.append((job["id"],))
            return _Result(rows=rows)

        if "SET status = 'running'" in sql:
            job = self.jobs[params["job_id"]]
            job["status"] = "running"
            job["attempts"] += 1
            return _Result()

        if "FROM public.crm_message_jobs j" in sql and "LEFT JOIN public.crm_whatsapp_eventos e" in sql:
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

        if "UPDATE public.crm_message_jobs" in sql and "processed_at = NOW()" in sql:
            job = self.jobs[params["job_id"]]
            job["status"] = params["status"]
            job["processed_at"] = True
            job["locked_at"] = None
            job["locked_by"] = None
            job["error_message"] = None
            return _Result()

        if "UPDATE public.crm_whatsapp_eventos" in sql and "processed_at = NOW()" in sql:
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
