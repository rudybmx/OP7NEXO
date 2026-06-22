from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest

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


def test_buscar_avatar_chat_faz_fallback_para_chat_picture(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_get(url, headers=None, params=None, timeout=None):
        calls.append({"url": url, "params": params})
        request = httpx.Request("GET", url, params=params)
        if len(calls) == 1:
            return httpx.Response(200, request=request, json={"profilePictureURL": None})
        return httpx.Response(200, request=request, json={"picture": "https://cdn.example.test/chat-picture.jpg"})

    monkeypatch.setenv("WAHA_API_KEY", "secret-token")
    monkeypatch.setattr(httpx, "get", fake_get)

    result = waha_service.buscar_avatar_chat(
        "minha-sessao",
        "120363123456789@g.us",
        {"api_base_url": "http://waha:3000", "api_key_ref": "WAHA_API_KEY"},
    )

    assert result == "https://cdn.example.test/chat-picture.jpg"
    assert calls[0]["url"] == "http://waha:3000/api/contacts/profile-picture"
    assert calls[0]["params"] == {
        "contactId": "120363123456789@g.us",
        "session": "minha-sessao",
    }
    assert calls[1]["url"] == "http://waha:3000/api/minha-sessao/chats/120363123456789%40g.us/picture"
    assert calls[1]["params"] == {}


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
            "tipo": "whatsapp_waha",
            "evolution_instance_id": None,
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
    # A URL crua do CDN expira → o job re-hospeda no MinIO. Capturamos a origem.
    rehost_calls: list[tuple[str, str]] = []

    def fake_download_and_put(bucket, object_name, source_url, content_type="application/octet-stream"):
        rehost_calls.append((bucket, source_url))
        return f"https://api.op7.test/meta/storage/{bucket}/{object_name}"

    monkeypatch.setattr(contact_avatar_enrichment, "download_and_put", fake_download_and_put)

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
    # avatar_url persistente (re-hospedado), nunca a URL crua do pps/CDN
    assert db.contact_row["avatar_url"] == (
        "https://api.op7.test/meta/storage/whatsapp-avatars/contacts/554799999999_c_us.jpg"
    )
    assert rehost_calls == [("whatsapp-avatars", "https://cdn.example.test/avatar.jpg")]
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
            "tipo": "whatsapp_waha",
            "evolution_instance_id": None,
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
    rehost_calls: list[tuple[str, str]] = []

    def fake_download_and_put(bucket, object_name, source_url, content_type="application/octet-stream"):
        rehost_calls.append((object_name, source_url))
        return f"https://api.op7.test/meta/storage/{bucket}/{object_name}"

    monkeypatch.setattr(contact_avatar_enrichment, "download_and_put", fake_download_and_put)

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
    # avatar do grupo re-hospedado sob o prefixo groups/
    assert db.conversation_row["group_avatar_url"] == (
        "https://api.op7.test/meta/storage/whatsapp-avatars/groups/120363123456789_g_us.jpg"
    )
    assert rehost_calls == [("groups/120363123456789_g_us.jpg", "https://cdn.example.test/group.jpg")]
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


# ---------------------------------------------------------------------------
# rehost_avatar — re-hospedagem de avatar no MinIO (evita URL pps que expira)
# ---------------------------------------------------------------------------


def test_rehost_avatar_dict_url_baixa_e_rehospeda(monkeypatch):
    calls: list[tuple] = []

    def fake_dl(bucket, object_name, source_url, content_type="application/octet-stream"):
        calls.append((bucket, object_name, source_url, content_type))
        return f"https://api.op7.test/meta/storage/{bucket}/{object_name}"

    monkeypatch.setattr(contact_avatar_enrichment, "download_and_put", fake_dl)

    out = contact_avatar_enrichment.rehost_avatar(
        "554799999999@s.whatsapp.net",
        {"url": "https://pps.whatsapp.net/x.jpg", "mime_type": "image/jpeg"},
    )

    assert out == "https://api.op7.test/meta/storage/whatsapp-avatars/contacts/554799999999_s_whatsapp_net.jpg"
    assert calls[0][0] == "whatsapp-avatars"
    assert calls[0][2] == "https://pps.whatsapp.net/x.jpg"


def test_rehost_avatar_dict_base64(monkeypatch):
    import base64 as _b64

    puts: list[tuple] = []

    def fake_put(bucket, object_name, content, content_type):
        puts.append((bucket, object_name, content, content_type))

    monkeypatch.setattr(contact_avatar_enrichment, "put_bytes", fake_put)
    monkeypatch.setattr(
        contact_avatar_enrichment,
        "public_url",
        lambda bucket, object_name: f"https://api.op7.test/meta/storage/{bucket}/{object_name}",
    )

    raw = b"\xff\xd8\xff\xe0jpegbytes"
    out = contact_avatar_enrichment.rehost_avatar(
        "123@s.whatsapp.net",
        {"base64": _b64.b64encode(raw).decode(), "mime_type": "image/jpeg"},
    )

    assert out.startswith("https://api.op7.test/meta/storage/whatsapp-avatars/contacts/123_s_whatsapp_net")
    assert puts[0][0] == "whatsapp-avatars"
    assert puts[0][2] == raw  # bytes decodificados, não a string base64


def test_rehost_avatar_sem_dado_retorna_none():
    assert contact_avatar_enrichment.rehost_avatar("123@s.whatsapp.net", None) is None
    assert contact_avatar_enrichment.rehost_avatar("123@s.whatsapp.net", {"url": None, "base64": None}) is None


def test_rehost_avatar_falha_download_levanta(monkeypatch):
    # download_and_put devolve None em falha → tratamos como transitório (raise)
    monkeypatch.setattr(contact_avatar_enrichment, "download_and_put", lambda *a, **k: None)
    with pytest.raises(RuntimeError):
        contact_avatar_enrichment.rehost_avatar("123@s.whatsapp.net", {"url": "https://pps.whatsapp.net/x.jpg"})


# ---------------------------------------------------------------------------
# Job Evolution — re-hospeda e não envenena o TTL em erro transitório
# ---------------------------------------------------------------------------


def _evolution_avatar_db(workspace_id, canal_id, contact_id):
    return _AvatarDb(
        canal_row={
            "id": canal_id,
            "workspace_id": workspace_id,
            "tipo": "whatsapp_evolution",
            "evolution_instance_id": "op7-evo",
            "config": {"evolution": {"instance_token": "tok"}},
        },
        contact_row={
            "id": contact_id,
            "workspace_id": workspace_id,
            "avatar_url": None,
            "avatar_fetched_at": None,
        },
    )


def test_process_contact_avatar_job_evolution_rehospeda(monkeypatch):
    workspace_id = str(uuid.uuid4())
    canal_id = str(uuid.uuid4())
    contact_id = str(uuid.uuid4())
    db = _evolution_avatar_db(workspace_id, canal_id, contact_id)

    monkeypatch.setattr(
        "app.services.evolution.buscar_foto_perfil",
        lambda instance, jid, token=None, raise_on_transient=False: {
            "url": "https://pps.whatsapp.net/x.jpg",
            "mime_type": "image/jpeg",
        },
    )
    monkeypatch.setattr(
        contact_avatar_enrichment,
        "download_and_put",
        lambda bucket, object_name, source_url, content_type="application/octet-stream": (
            f"https://api.op7.test/meta/storage/{bucket}/{object_name}"
        ),
    )

    result = contact_avatar_enrichment.process_contact_avatar_enrichment_job(
        db,
        {
            "workspace_id": workspace_id,
            "canal_id": canal_id,
            "job_payload": {
                "contact_id": contact_id,
                "jid": "554799999999@s.whatsapp.net",
                "instance": "op7-evo",
                "canal_id": canal_id,
            },
        },
    )

    assert result["status"] == "done"
    assert db.contact_row["avatar_url"].startswith(
        "https://api.op7.test/meta/storage/whatsapp-avatars/contacts/"
    )
    assert "pps.whatsapp.net" not in db.contact_row["avatar_url"]
    assert db.contact_row["avatar_fetched_at"] is not None


def test_process_contact_avatar_job_evolution_erro_transitorio_nao_envenena(monkeypatch):
    workspace_id = str(uuid.uuid4())
    canal_id = str(uuid.uuid4())
    contact_id = str(uuid.uuid4())
    db = _evolution_avatar_db(workspace_id, canal_id, contact_id)

    def fake_foto(instance, jid, token=None, raise_on_transient=False):
        assert raise_on_transient is True  # o job pede para propagar transitórios
        raise RuntimeError("timeout")

    monkeypatch.setattr("app.services.evolution.buscar_foto_perfil", fake_foto)

    with pytest.raises(RuntimeError):
        contact_avatar_enrichment.process_contact_avatar_enrichment_job(
            db,
            {
                "workspace_id": workspace_id,
                "canal_id": canal_id,
                "job_payload": {
                    "contact_id": contact_id,
                    "jid": "554799999999@s.whatsapp.net",
                    "instance": "op7-evo",
                    "canal_id": canal_id,
                },
            },
        )

    # Erro transitório NÃO deve gravar avatar_fetched_at (senão envenena por 7 dias)
    assert db.contact_row["avatar_fetched_at"] is None
