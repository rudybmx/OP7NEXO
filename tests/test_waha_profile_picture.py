from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from app.services import contact_avatar_enrichment
from app.services import waha_service
from app.services import whatsapp_event_worker


class _Result:
    def __init__(self, row=None, mapping=None, rows=None, scalar_value=None):
        self._row = row
        self._mapping = mapping
        self._rows = rows or []
        self._scalar_value = scalar_value
        self.rowcount = 0

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


class _AvatarDb:
    def __init__(self, *, canal_row: dict[str, object], contact_row: dict[str, object], conversation_row: dict[str, object] | None = None):
        self.canal_row = canal_row
        self.contact_row = contact_row
        self.conversation_row = conversation_row or {}
        self.calls: list[tuple[str, dict | None]] = []
        self.commits = 0
        self.inserted_jobs: list[dict[str, object]] = []

    def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        sql_lower = sql.lower()
        self.calls.append((sql, params))

        if "from public.canais_entrada" in sql_lower:
            return _Result(mapping=self.canal_row)

        if "select avatar_fetched_at" in sql_lower and "from public.crm_whatsapp_contatos" in sql_lower:
            return _Result(mapping=self.contact_row)

        if "select group_name, group_avatar_url" in sql_lower and "from public.crm_whatsapp_conversas" in sql_lower:
            return _Result(mapping=self.conversation_row)

        if "select telefone" in sql_lower and "from public.crm_whatsapp_contatos" in sql_lower:
            return _Result(mapping=self.contact_row)

        if "select 1 from public.crm_message_jobs" in sql_lower:
            return _Result()

        if "insert into public.crm_message_jobs" in sql_lower:
            job_id = str(uuid.uuid4())
            self.inserted_jobs.append({"sql": sql, "params": params, "job_id": job_id})
            return _Result(row=(job_id,))

        if "update public.crm_whatsapp_contatos" in sql_lower:
            if params and params.get("url") is not None:
                self.contact_row["avatar_url"] = params["url"]
            self.contact_row["avatar_fetched_at"] = datetime.now(timezone.utc)
            self.contact_row["updated_at"] = datetime.now(timezone.utc)
            return _Result()

        if "update public.crm_whatsapp_conversas" in sql_lower:
            if params and params.get("avatar") is not None:
                self.conversation_row["group_avatar_url"] = params["avatar"]
            if params and params.get("nome") is not None:
                self.conversation_row["group_name"] = params["nome"]
            self.conversation_row["updated_at"] = datetime.now(timezone.utc)
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

    def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        sql_lower = sql.lower()
        self.calls.append((sql, params))

        if "from public.crm_message_jobs" in sql_lower and "for update skip locked" in sql_lower:
            if self.job_row["status"] in {"pending", "error"} and self.job_row["attempts"] < self.job_row["max_attempts"]:
                return _Result(rows=[(self.job_id,)])
            return _Result()

        if "set status = 'running'" in sql_lower:
            self.job_row["status"] = "running"
            self.job_row["attempts"] = int(self.job_row.get("attempts", 0)) + 1
            return _Result()

        if "from public.crm_message_jobs j" in sql_lower and "left join public.crm_whatsapp_eventos e" in sql_lower:
            return _Result(
                mapping={
                    "id": self.job_row["id"],
                    "attempts": self.job_row["attempts"],
                    "max_attempts": self.job_row["max_attempts"],
                    "workspace_id": self.job_row["workspace_id"],
                    "canal_id": self.job_row["canal_id"],
                    "job_type": self.job_row["job_type"],
                    "related_message_id": None,
                    "job_payload": self.job_row.get("payload") or {},
                    "event_id": None,
                    "event": None,
                    "event_type": None,
                    "payload": {},
                }
            )

        if "update public.crm_message_jobs" in sql_lower and "processed_at = now()" in sql_lower:
            self.job_row["status"] = params["status"]
            self.job_row["processed_at"] = datetime.now(timezone.utc)
            self.job_row["locked_at"] = None
            self.job_row["locked_by"] = None
            self.job_row["error_message"] = None
            return _Result()

        if "update public.crm_whatsapp_eventos" in sql_lower and "processed_at = now()" in sql_lower:
            return _Result()

        raise AssertionError(f"Unexpected SQL: {sql}")

    def commit(self):
        self.commits += 1


class _SessionContext:
    def __init__(self, db):
        self.db = db

    def __enter__(self):
        return self.db

    def __exit__(self, exc_type, exc, tb):
        return False


def test_buscar_avatar_chat_usa_profile_picture_sem_refresh_por_padrao(monkeypatch):
    captured: dict[str, object] = {}

    def fake_get(url, headers=None, params=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["params"] = params
        captured["timeout"] = timeout
        request = httpx.Request("GET", url, params=params)
        return httpx.Response(200, request=request, json={"profilePictureURL": "https://cdn.example.test/avatar.jpg"})

    monkeypatch.setenv("WAHA_API_KEY", "secret-token")
    monkeypatch.setattr(httpx, "get", fake_get)

    result = waha_service.buscar_avatar_chat(
        "minha-sessao",
        "554799999999@c.us",
        {"api_base_url": "http://waha:3000", "api_key_ref": "WAHA_API_KEY"},
    )

    assert result == "https://cdn.example.test/avatar.jpg"
    assert captured["url"] == "http://waha:3000/api/contacts/profile-picture"
    assert captured["params"] == {
        "contactId": "554799999999@c.us",
        "session": "minha-sessao",
    }
    assert "refresh" not in captured["params"]
    assert captured["headers"]["X-Api-Key"] == "secret-token"


def test_buscar_avatar_chat_retorna_none_quando_avatar_ausente(monkeypatch):
    def fake_get(url, headers=None, params=None, timeout=None):
        request = httpx.Request("GET", url, params=params)
        return httpx.Response(404, request=request)

    monkeypatch.setenv("WAHA_API_KEY", "secret-token")
    monkeypatch.setattr(httpx, "get", fake_get)

    result = waha_service.buscar_avatar_chat(
        "minha-sessao",
        "554799999999@c.us",
        {"api_base_url": "http://waha:3000", "api_key_ref": "WAHA_API_KEY"},
    )

    assert result is None


def test_enqueue_contact_avatar_enrichment_skips_when_avatar_recent():
    workspace_id = str(uuid.uuid4())
    canal_id = str(uuid.uuid4())
    contact_id = str(uuid.uuid4())
    db = _AvatarDb(
        canal_row={"id": canal_id, "workspace_id": workspace_id, "config": {"waha": {"session": "op7-waha"}}},
        contact_row={
            "id": contact_id,
            "workspace_id": workspace_id,
            "avatar_url": "https://cdn.example.test/existing.jpg",
            "avatar_fetched_at": datetime.now(timezone.utc) - timedelta(days=1),
        },
    )

    ok = contact_avatar_enrichment.enqueue_contact_avatar_enrichment(
        db,
        workspace_id=workspace_id,
        canal_id=canal_id,
        contact_id=contact_id,
        jid="554799999999@c.us",
        instance="op7-waha",
    )

    assert ok is False
    assert db.inserted_jobs == []
    assert any("cast(:cid as uuid)" in sql.lower() for sql, _ in db.calls)


def test_enqueue_group_enrichment_inserts_job_with_casts():
    workspace_id = str(uuid.uuid4())
    canal_id = str(uuid.uuid4())
    conversa_id = str(uuid.uuid4())
    db = _AvatarDb(
        canal_row={"id": canal_id, "workspace_id": workspace_id, "config": {"waha": {"session": "op7-waha"}}},
        contact_row={"id": str(uuid.uuid4()), "workspace_id": workspace_id},
        conversation_row={
            "id": conversa_id,
            "workspace_id": workspace_id,
            "group_name": None,
            "group_avatar_url": None,
        },
    )

    ok = contact_avatar_enrichment.enqueue_group_enrichment(
        db,
        workspace_id=workspace_id,
        canal_id=canal_id,
        conversa_id=conversa_id,
        group_jid="120363123456789@g.us",
        instance="op7-waha",
    )

    assert ok is True
    assert db.inserted_jobs
    assert any("cast(:conv_id as uuid)" in sql.lower() for sql, _ in db.calls)
    payload = json.loads(db.inserted_jobs[0]["params"]["payload"])
    assert payload["conversa_id"] == conversa_id
    assert payload["group_jid"] == "120363123456789@g.us"


def test_enqueue_lid_phone_enrichment_inserts_job_with_casts(monkeypatch):
    workspace_id = str(uuid.uuid4())
    canal_id = str(uuid.uuid4())
    contact_id = str(uuid.uuid4())
    db = _AvatarDb(
        canal_row={"id": canal_id, "workspace_id": workspace_id, "config": {"waha": {"session": "op7-waha"}}},
        contact_row={
            "id": contact_id,
            "workspace_id": workspace_id,
            "telefone": "11999999999",
        },
    )

    monkeypatch.setenv("WAHA_STORE_SESSIONS", "op7-waha")

    ok = contact_avatar_enrichment.enqueue_lid_phone_enrichment(
        db,
        workspace_id=workspace_id,
        canal_id=canal_id,
        contact_id=contact_id,
        jid="123456789@lid",
        instance="op7-waha",
    )

    assert ok is True
    assert db.inserted_jobs
    assert any("cast(:cid as uuid)" in sql.lower() for sql, _ in db.calls)
    payload = json.loads(db.inserted_jobs[0]["params"]["payload"])
    assert payload["contact_id"] == contact_id
    assert payload["jid"] == "123456789@lid"


def test_process_contact_avatar_enrichment_job_updates_avatar_url_and_fetched_at(monkeypatch):
    workspace_id = str(uuid.uuid4())
    canal_id = str(uuid.uuid4())
    contact_id = str(uuid.uuid4())
    db = _AvatarDb(
        canal_row={
            "id": canal_id,
            "workspace_id": workspace_id,
            "config": {
                "waha": {
                    "session": "op7-waha",
                    "api_base_url": "http://waha:3000",
                    "api_key_ref": "WAHA_API_KEY",
                }
            },
        },
        contact_row={
            "id": contact_id,
            "workspace_id": workspace_id,
            "avatar_url": None,
            "avatar_fetched_at": None,
        },
    )

    monkeypatch.setattr(
        contact_avatar_enrichment.waha_service,
        "buscar_avatar_chat",
        lambda session, jid, cfg, timeout=5.0: "https://cdn.example.test/avatar.jpg",
    )

    result = contact_avatar_enrichment.process_contact_avatar_enrichment_job(
        db,
        {
            "workspace_id": workspace_id,
            "canal_id": canal_id,
            "job_payload": {
                "contact_id": contact_id,
                "jid": "554799999999@c.us",
                "instance": "op7-waha",
                "canal_id": canal_id,
            },
        },
    )

    assert result["status"] == "done"
    assert result["has_avatar"] is True
    assert db.contact_row["avatar_url"] == "https://cdn.example.test/avatar.jpg"
    assert db.contact_row["avatar_fetched_at"] is not None
    assert any("cast(:cid as uuid)" in sql.lower() for sql, _ in db.calls)


def test_process_group_enrichment_job_updates_group_avatar_url(monkeypatch):
    workspace_id = str(uuid.uuid4())
    canal_id = str(uuid.uuid4())
    conversa_id = str(uuid.uuid4())
    db = _AvatarDb(
        canal_row={
            "id": canal_id,
            "workspace_id": workspace_id,
            "config": {
                "waha": {
                    "session": "op7-waha",
                    "api_base_url": "http://waha:3000",
                    "api_key_ref": "WAHA_API_KEY",
                }
            },
        },
        contact_row={
            "id": str(uuid.uuid4()),
            "workspace_id": workspace_id,
            "avatar_url": None,
            "avatar_fetched_at": None,
        },
        conversation_row={
            "id": conversa_id,
            "workspace_id": workspace_id,
            "group_name": None,
            "group_avatar_url": None,
        },
    )

    monkeypatch.setattr(
        contact_avatar_enrichment.waha_service,
        "buscar_nome_grupo",
        lambda session, group_jid, cfg, timeout=5.0: "Grupo de Teste",
    )
    monkeypatch.setattr(
        contact_avatar_enrichment.waha_service,
        "buscar_avatar_chat",
        lambda session, jid, cfg, timeout=5.0: "https://cdn.example.test/group.jpg",
    )

    result = contact_avatar_enrichment.process_group_enrichment_job(
        db,
        {
            "workspace_id": workspace_id,
            "job_payload": {
                "conversa_id": conversa_id,
                "group_jid": "120363123456789@g.us",
                "instance": "op7-waha",
                "canal_id": canal_id,
            },
        },
    )

    assert result["status"] == "done"
    assert result["group_name"] == "Grupo de Teste"
    assert result["has_avatar"] is True
    assert db.conversation_row["group_avatar_url"] == "https://cdn.example.test/group.jpg"
    assert any("cast(:conv_id as uuid)" in sql.lower() for sql, _ in db.calls)


def test_worker_processa_job_contact_avatar_enrichment_e_pubblica_refresh(monkeypatch):
    workspace_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    contact_id = str(uuid.uuid4())
    job_row = {
        "id": job_id,
        "workspace_id": workspace_id,
        "canal_id": str(uuid.uuid4()),
        "job_type": "contact_avatar_enrichment",
        "status": "pending",
        "attempts": 0,
        "max_attempts": 5,
        "payload": {
            "contact_id": contact_id,
            "jid": "554799999999@c.us",
            "instance": "op7-waha",
            "canal_id": str(uuid.uuid4()),
        },
    }
    db = _WorkerDb(job_id, job_row)
    published: list[dict[str, object]] = []

    monkeypatch.setattr(
        contact_avatar_enrichment,
        "process_contact_avatar_enrichment_job",
        lambda db_arg, job_arg: {"status": "done"},
    )
    monkeypatch.setattr(
        whatsapp_event_worker,
        "publish_whatsapp_event",
        lambda event: published.append(event),
    )
    monkeypatch.setattr(whatsapp_event_worker, "SessionLocal", lambda: _SessionContext(db))

    result = whatsapp_event_worker.process_next_whatsapp_jobs(limit=1)

    assert result == {"processed": 1, "failed": 0, "skipped": 0}
    assert db.job_row["status"] == "done"
    assert published
    assert published[0]["type"] == "conversation.refresh"
    assert published[0]["workspaceId"] == workspace_id
    assert published[0]["remoteJid"] == "554799999999@c.us"
    assert published[0]["conversaId"] == ""


def test_worker_processa_job_group_enrichment_e_pubblica_refresh(monkeypatch):
    workspace_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    conversa_id = str(uuid.uuid4())
    job_row = {
        "id": job_id,
        "workspace_id": workspace_id,
        "canal_id": str(uuid.uuid4()),
        "job_type": "group_enrichment",
        "status": "pending",
        "attempts": 0,
        "max_attempts": 5,
        "payload": {
            "conversa_id": conversa_id,
            "group_jid": "120363123456789@g.us",
            "instance": "op7-waha",
            "canal_id": str(uuid.uuid4()),
        },
    }
    db = _WorkerDb(job_id, job_row)
    published: list[dict[str, object]] = []

    monkeypatch.setattr(
        contact_avatar_enrichment,
        "process_group_enrichment_job",
        lambda db_arg, job_arg: {"status": "done"},
    )
    monkeypatch.setattr(
        whatsapp_event_worker,
        "publish_whatsapp_event",
        lambda event: published.append(event),
    )
    monkeypatch.setattr(whatsapp_event_worker, "SessionLocal", lambda: _SessionContext(db))

    result = whatsapp_event_worker.process_next_whatsapp_jobs(limit=1)

    assert result == {"processed": 1, "failed": 0, "skipped": 0}
    assert db.job_row["status"] == "done"
    assert published
    assert published[0]["type"] == "conversation.refresh"
    assert published[0]["workspaceId"] == workspace_id
    assert published[0]["conversaId"] == conversa_id
    assert published[0]["remoteJid"] == "120363123456789@g.us"
