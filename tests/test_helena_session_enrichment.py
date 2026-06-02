from __future__ import annotations

import copy
import json
import uuid
from contextlib import nullcontext
from datetime import datetime, timezone

from app.services import helena_session_enrichment
from app.services import whatsapp_event_worker
from app.services.helena_chat import HelenaChatError


class _Result:
    def __init__(self, row=None, mapping=None):
        self._row = row
        self._mapping = mapping

    def fetchall(self):
        if self._row is None:
            return []
        return [self._row]

    def fetchone(self):
        return self._row

    def scalar(self):
        if isinstance(self._row, tuple):
            return self._row[0]
        if isinstance(self._row, dict):
            return self._row.get("id")
        return None

    def mappings(self):
        return self

    def first(self):
        return self._mapping


class _EnqueueDb:
    def __init__(self):
        self.jobs_by_session: dict[tuple[str, str, str], dict[str, object]] = {}
        self.calls: list[tuple[str, dict | None]] = []

    def begin_nested(self):
        return nullcontext()

    def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        sql_lower = sql.lower()
        self.calls.append((sql, params))

        if "select id from public.crm_message_jobs" in sql_lower and "payload->>'session_id'" in sql_lower:
            key = (params["workspace_id"], params["canal_id"], params["session_id"])
            row = self.jobs_by_session.get(key)
            return _Result(row=(row["id"],)) if row else _Result()

        if "insert into public.crm_message_jobs" in sql_lower and params and params.get("job_type") == "helena_session_enrichment":
            payload = json.loads(params["payload"])
            key = (params["workspace_id"], params["canal_id"], payload["session_id"])
            if key in self.jobs_by_session:
                return _Result()
            job_id = str(uuid.uuid4())
            self.jobs_by_session[key] = {
                "id": job_id,
                "workspace_id": params["workspace_id"],
                "canal_id": params["canal_id"],
                "job_type": "helena_session_enrichment",
                "status": "pending",
                "payload": payload,
            }
            return _Result(row=(job_id,))

        raise AssertionError(f"Unexpected SQL: {sql}")


class _EnrichmentDb:
    def __init__(self, canal_row: dict[str, object], contact_row: dict[str, object], conversation_row: dict[str, object]):
        self.canal_row = canal_row
        self.contact_row = contact_row
        self.conversation_row = conversation_row
        self.calls: list[tuple[str, dict | None]] = []
        self.commits = 0

    def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        sql_lower = sql.lower()
        self.calls.append((sql, params))

        if "from public.canais_entrada" in sql_lower:
            return _Result(mapping=self.canal_row)

        if "from public.crm_whatsapp_conversas" in sql_lower and "where id = cast(:conversation_id as uuid)" in sql_lower:
            return _Result(mapping=self.conversation_row)

        if "from public.crm_whatsapp_contatos" in sql_lower and "where id = cast(:contact_id as uuid)" in sql_lower:
            return _Result(mapping=self.contact_row)

        if "update public.crm_whatsapp_contatos" in sql_lower:
            if params.get("nome") is not None:
                self.contact_row["nome"] = params["nome"]
            if params.get("telefone") is not None:
                self.contact_row["telefone"] = params["telefone"]
            if params.get("avatar_url") is not None:
                if self.contact_row.get("avatar_url") != params["avatar_url"] or not self.contact_row.get("avatar_fetched_at"):
                    self.contact_row["avatar_url"] = params["avatar_url"]
                    self.contact_row["avatar_fetched_at"] = datetime.now(timezone.utc)
            if params.get("last_message_at") is not None:
                self.contact_row["last_message_at"] = params["last_message_at"]

            current_profile = copy.deepcopy(self.contact_row.get("perfil_json") or {})
            current_metadata = dict(current_profile.get("metadata") or {})
            current_metadata["helena_session"] = json.loads(params["snapshot"])
            current_profile["metadata"] = current_metadata
            self.contact_row["perfil_json"] = current_profile
            return _Result()

        if "update public.crm_whatsapp_conversas" in sql_lower:
            if params.get("ultima_mensagem") is not None:
                self.conversation_row["ultima_mensagem"] = params["ultima_mensagem"]
            if params.get("ultima_msg_at") is not None:
                self.conversation_row["ultima_msg_at"] = params["ultima_msg_at"]
            if params.get("last_inbound_at") is not None:
                self.conversation_row["last_inbound_at"] = params["last_inbound_at"]
            if params.get("last_outbound_at") is not None:
                self.conversation_row["last_outbound_at"] = params["last_outbound_at"]
            if params.get("nao_lidas") is not None:
                self.conversation_row["nao_lidas"] = params["nao_lidas"]
            if params.get("status") is not None:
                self.conversation_row["status"] = params["status"]
            return _Result()

        raise AssertionError(f"Unexpected SQL: {sql}")

    def commit(self):
        self.commits += 1


class _WorkerDb:
    def __init__(self, job_id: str, job_row: dict[str, object]):
        self.job_id = job_id
        self.job_row = job_row
        self.calls: list[tuple[str, dict | None]] = []
        self.commits = 0
        self.events: dict[str, dict[str, object]] = {}

    def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        sql_lower = sql.lower()
        self.calls.append((sql, params))

        if "from public.crm_message_jobs" in sql_lower and "for update skip locked" in sql_lower:
            if self.job_row["status"] in {"pending", "error"} and self.job_row["attempts"] < self.job_row["max_attempts"]:
                return _Result(row=(self.job_id,))
            return _Result()

        if "update public.crm_message_jobs" in sql_lower and "set status = 'running'" in sql_lower:
            self.job_row["status"] = "running"
            self.job_row["attempts"] = int(self.job_row.get("attempts", 0)) + 1
            return _Result()

        if "from public.crm_message_jobs j" in sql_lower and "left join public.crm_whatsapp_eventos e" in sql_lower:
            row = dict(self.job_row)
            row["event_id"] = None
            row["event"] = None
            row["event_type"] = None
            row["payload"] = {}
            row["job_payload"] = self.job_row.get("payload") or {}
            return _Result(mapping=row)

        if "update public.crm_message_jobs" in sql_lower and "processed_at = now()" in sql_lower:
            self.job_row["status"] = params["status"]
            self.job_row["processed_at"] = datetime.now(timezone.utc)
            return _Result()

        raise AssertionError(f"Unexpected SQL: {sql}")

    def commit(self):
        self.commits += 1


def test_enqueue_helena_session_enrichment_dedupes_recent_job():
    db = _EnqueueDb()
    workspace_id = str(uuid.uuid4())
    canal_id = str(uuid.uuid4())

    first = helena_session_enrichment.enqueue_helena_session_enrichment(
        db,
        workspace_id=workspace_id,
        canal_id=canal_id,
        session_id="session-1",
        conversation_id=str(uuid.uuid4()),
        contact_id=str(uuid.uuid4()),
        source_event_id=str(uuid.uuid4()),
        provider_message_id="msg-1",
        occurred_at="2026-05-30T12:34:56Z",
    )
    second = helena_session_enrichment.enqueue_helena_session_enrichment(
        db,
        workspace_id=workspace_id,
        canal_id=canal_id,
        session_id="session-1",
        conversation_id=str(uuid.uuid4()),
        contact_id=str(uuid.uuid4()),
        source_event_id=str(uuid.uuid4()),
        provider_message_id="msg-2",
        occurred_at="2026-05-30T12:35:56Z",
    )

    assert first is True
    assert second is False
    assert len(db.jobs_by_session) == 1
    stored_job = next(iter(db.jobs_by_session.values()))
    assert stored_job["job_type"] == "helena_session_enrichment"
    assert stored_job["payload"]["session_id"] == "session-1"
    assert stored_job["payload"]["provider"] == "crm_externo_zapi"


def test_process_helena_session_enrichment_job_updates_contact_and_conversation_without_null_overwrite(monkeypatch):
    workspace_id = str(uuid.uuid4())
    canal_id = str(uuid.uuid4())
    conversation_id = str(uuid.uuid4())
    contact_id = str(uuid.uuid4())
    canal_row = {
        "id": canal_id,
        "workspace_id": workspace_id,
        "config": {
            "webhook": {
                "provider": "crm_externo_zapi",
                "helena": {
                    "api_token_ref": "HELENA_CHAT_TOKEN_QOZT",
                    "from_phone": "+55 47 98888-0002",
                },
            }
        },
    }
    contact_row = {
        "id": contact_id,
        "workspace_id": workspace_id,
        "nome": "Nome Antigo",
        "telefone": "5547999990001",
        "avatar_url": "https://cdn.example.test/old-avatar.jpg",
        "avatar_fetched_at": None,
        "last_message_at": None,
        "perfil_json": {"metadata": {"existing": True}},
        "updated_at": None,
    }
    conversation_row = {
        "id": conversation_id,
        "workspace_id": workspace_id,
        "canal_id": canal_id,
        "contato_id": contact_id,
        "status": "nova",
        "ultima_mensagem": "Mensagem antiga",
        "ultima_msg_at": None,
        "last_inbound_at": None,
        "last_outbound_at": None,
        "nao_lidas": 1,
    }
    db = _EnrichmentDb(canal_row, contact_row, conversation_row)
    session_payload = {
        "status": "IN_PROGRESS",
        "contactDetails": {
            "name": None,
            "phonenumber": None,
            "pictureUrl": None,
        },
        "lastMessageText": "Mensagem nova",
        "lastInteractionDate": "2026-05-30T12:34:56Z",
        "unreadCount": 3,
    }

    monkeypatch.setattr(
        helena_session_enrichment,
        "get_helena_session_by_id",
        lambda source, session_id, timeout=10.0: session_payload,
    )

    result = helena_session_enrichment.process_helena_session_enrichment_job(
        db,
        {
            "workspace_id": workspace_id,
            "canal_id": canal_id,
            "job_payload": {
                "session_id": "session-123",
                "provider": "crm_externo_zapi",
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "source_event_id": str(uuid.uuid4()),
                "provider_message_id": "msg-123",
                "occurred_at": "2026-05-30T12:34:56Z",
            },
        },
    )

    assert result["status"] == "done"
    assert contact_row["nome"] == "Nome Antigo"
    assert contact_row["telefone"] == "5547999990001"
    assert contact_row["avatar_url"] == "https://cdn.example.test/old-avatar.jpg"
    assert contact_row["last_message_at"] == datetime(2026, 5, 30, 12, 34, 56, tzinfo=timezone.utc)
    assert contact_row["perfil_json"]["metadata"]["existing"] is True
    assert contact_row["perfil_json"]["metadata"]["helena_session"]["session_id"] == "session-123"
    assert conversation_row["ultima_mensagem"] == "Mensagem nova"
    assert conversation_row["status"] == "em_atendimento"
    assert conversation_row["nao_lidas"] == 3
    assert conversation_row["last_inbound_at"] is None
    assert conversation_row["last_outbound_at"] is None
    assert db.commits == 1


def test_process_helena_session_enrichment_job_404_returns_skipped(monkeypatch):
    workspace_id = str(uuid.uuid4())
    canal_id = str(uuid.uuid4())
    conversation_id = str(uuid.uuid4())
    contact_id = str(uuid.uuid4())
    canal_row = {
        "id": canal_id,
        "workspace_id": workspace_id,
        "config": {
            "webhook": {
                "provider": "crm_externo_zapi",
                "helena": {
                    "api_token_ref": "HELENA_CHAT_TOKEN_QOZT",
                },
            }
        },
    }
    contact_row = {
        "id": contact_id,
        "workspace_id": workspace_id,
        "nome": "Nome Antigo",
        "telefone": "5547999990001",
        "avatar_url": None,
        "avatar_fetched_at": None,
        "last_message_at": None,
        "perfil_json": {"metadata": {}},
        "updated_at": None,
    }
    conversation_row = {
        "id": conversation_id,
        "workspace_id": workspace_id,
        "canal_id": canal_id,
        "contato_id": contact_id,
        "status": "nova",
        "ultima_mensagem": "Mensagem antiga",
        "ultima_msg_at": None,
        "last_inbound_at": None,
        "last_outbound_at": None,
        "nao_lidas": 1,
    }
    db = _EnrichmentDb(canal_row, contact_row, conversation_row)

    monkeypatch.setattr(
        helena_session_enrichment,
        "get_helena_session_by_id",
        lambda source, session_id, timeout=10.0: (_ for _ in ()).throw(HelenaChatError("not found", status_code=404)),
    )

    result = helena_session_enrichment.process_helena_session_enrichment_job(
        db,
        {
            "workspace_id": workspace_id,
            "canal_id": canal_id,
            "job_payload": {
                "session_id": "session-404",
                "provider": "crm_externo_zapi",
                "conversation_id": conversation_id,
                "contact_id": contact_id,
                "source_event_id": str(uuid.uuid4()),
                "provider_message_id": "msg-404",
                "occurred_at": "2026-05-30T12:34:56Z",
            },
        },
    )

    assert result["status"] == "skipped"
    assert db.commits == 0
    assert contact_row["nome"] == "Nome Antigo"
    assert conversation_row["status"] == "nova"


def test_worker_processa_job_helena_session_enrichment_e_pubblica_refresh(monkeypatch):
    workspace_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    job_row = {
        "workspace_id": workspace_id,
        "canal_id": str(uuid.uuid4()),
        "job_type": "helena_session_enrichment",
        "status": "pending",
        "attempts": 0,
        "max_attempts": 5,
        "payload": {
            "session_id": "session-77",
            "provider": "crm_externo_zapi",
            "conversation_id": str(uuid.uuid4()),
            "contact_id": str(uuid.uuid4()),
            "source_event_id": str(uuid.uuid4()),
            "provider_message_id": "msg-77",
            "occurred_at": "2026-05-30T12:34:56Z",
        },
    }
    db = _WorkerDb(job_id, job_row)
    published: list[dict[str, object]] = []

    monkeypatch.setattr(
        whatsapp_event_worker,
        "process_helena_session_enrichment_job",
        lambda db_arg, job_arg: {
            "status": "done",
            "workspace_id": job_arg["workspace_id"],
            "canal_id": job_arg["canal_id"],
            "conversation_id": job_arg["job_payload"]["conversation_id"],
            "contact_id": job_arg["job_payload"]["contact_id"],
            "session_id": job_arg["job_payload"]["session_id"],
        },
    )
    monkeypatch.setattr(
        whatsapp_event_worker,
        "publish_whatsapp_event",
        lambda event: published.append(event),
    )

    class _SessionContext:
        def __init__(self, inner_db):
            self.inner_db = inner_db

        def __enter__(self):
            return self.inner_db

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(whatsapp_event_worker, "SessionLocal", lambda: _SessionContext(db))

    result = whatsapp_event_worker.process_next_whatsapp_jobs(limit=1)

    assert result == {"processed": 1, "failed": 0, "skipped": 0}
    assert db.job_row["status"] == "done"
    assert published
    assert published[0]["type"] == "conversation.refresh"
    assert published[0]["workspaceId"] == workspace_id
    assert published[0]["remoteJid"] == "session-77"
