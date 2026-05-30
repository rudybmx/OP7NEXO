from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import canais
from app.models.canal_entrada import CanalEntrada


class _Result:
    def __init__(self, row=None, mapping=None):
        self._row = row
        self._mapping = mapping

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


class _CrudDb:
    def __init__(self):
        self.added: list[CanalEntrada] = []
        self.commits = 0
        self.refreshes = 0

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        self.refreshes += 1
        return obj


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
        self.refreshes = 0
        self.calls: list[tuple[str, dict | None]] = []
        self.events_by_hash: dict[str, dict[str, str]] = {}
        self.contacts_by_jid: dict[str, dict[str, str]] = {}
        self.conversations_by_key: dict[tuple[str, str, str, str], dict[str, str]] = {}
        self.messages_by_hash: dict[str, dict[str, str]] = {}
        self.lead_origin_by_raw_event_id: dict[str, dict[str, str]] = {}

    def query(self, _model):
        return _WebhookQuery(self._canal)

    def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        sql_lower = sql.lower()
        self.calls.append((sql, params))

        if "insert into public.crm_whatsapp_eventos" in sql_lower:
            event_hash = params["event_hash"]
            if event_hash in self.events_by_hash:
                return _Result()
            event_id = str(uuid.uuid4())
            self.events_by_hash[event_hash] = {
                "id": event_id,
                "event_hash": event_hash,
                "event_type": params["event_type"],
                "payload": params["payload"],
            }
            return _Result(row=(event_id,))

        if "select id from public.crm_whatsapp_eventos" in sql_lower and "where event_hash = :event_hash" in sql_lower:
            row = self.events_by_hash.get(params["event_hash"])
            return _Result(row=(row["id"],)) if row else _Result()

        if "from public.crm_lead_origin_events lo" in sql_lower:
            event = self.events_by_hash.get(params["event_hash"])
            if not event:
                return _Result()
            row = self.lead_origin_by_raw_event_id.get(event["id"])
            return _Result(mapping=row) if row else _Result()

        if "from public.crm_whatsapp_mensagens m" in sql_lower and "event_hash" in sql_lower:
            event = self.events_by_hash.get(params["event_hash"])
            if not event:
                return _Result()
            for row in self.messages_by_hash.values():
                if row["raw_event_id"] == event["id"]:
                    return _Result(mapping=row)
            return _Result()

        if "insert into public.crm_whatsapp_contatos" in sql_lower:
            jid = params["jid"]
            existing = self.contacts_by_jid.get(jid)
            if existing:
                existing.update(
                    {
                        "telefone": params.get("telefone"),
                        "nome": params.get("nome"),
                        "push_name": params.get("push_name"),
                        "origem": "webhook",
                        "perfil_json": params.get("perfil_json"),
                        "campanha_origem": params.get("campanha_origem"),
                        "utm_source": params.get("utm_source"),
                        "utm_medium": params.get("utm_medium"),
                        "utm_campaign": params.get("utm_campaign"),
                        "last_message_at": params.get("last_message_at"),
                    }
                )
                return _Result(row=(existing["id"],))
            contact_id = str(uuid.uuid4())
            row = {
                "id": contact_id,
                "workspace_id": params["workspace_id"],
                "jid": jid,
                "telefone": params.get("telefone"),
                "nome": params.get("nome"),
                "push_name": params.get("push_name"),
                "origem": "webhook",
                "perfil_json": params.get("perfil_json"),
                "campanha_origem": params.get("campanha_origem"),
                "utm_source": params.get("utm_source"),
                "utm_medium": params.get("utm_medium"),
                "utm_campaign": params.get("utm_campaign"),
                "last_message_at": params.get("last_message_at"),
                "last_origin_event_id": None,
            }
            self.contacts_by_jid[jid] = row
            return _Result(row=(contact_id,))

        if "select id from public.crm_whatsapp_contatos" in sql_lower and "where workspace_id" in sql_lower and "jid = :jid" in sql_lower:
            row = self.contacts_by_jid.get(params["jid"])
            return _Result(row=(row["id"],)) if row else _Result()

        if "select id, status from public.crm_whatsapp_conversas" in sql_lower:
            key = (params["workspace_id"], params["canal_id"], params["instance"], params["remote_jid"])
            row = self.conversations_by_key.get(key)
            return _Result(row=(row["id"], row["status"])) if row else _Result()

        if "update public.crm_whatsapp_conversas" in sql_lower and "set ultima_mensagem = :ultima_mensagem" in sql_lower:
            conversation_id = params["conversa_id"]
            row = next((item for item in self.conversations_by_key.values() if item["id"] == conversation_id), None)
            if row:
                row["ultima_mensagem"] = params["ultima_mensagem"]
                row["ultima_direcao"] = "entrada"
                row["ultima_msg_at"] = params["ultima_msg_at"]
                row["last_inbound_at"] = params["last_inbound_at"]
                row["nao_lidas"] = row.get("nao_lidas", 0) + 1
                row["campanha"] = row.get("campanha") or params.get("campanha")
                row["lead_status"] = row.get("lead_status") or params.get("lead_status")
                return _Result(row=(conversation_id,))
            return _Result()

        if "insert into public.crm_whatsapp_conversas" in sql_lower:
            conversation_id = str(uuid.uuid4())
            key = (params["workspace_id"], params["canal_id"], params["instance"], params["remote_jid"])
            row = {
                "id": conversation_id,
                "workspace_id": params["workspace_id"],
                "canal_id": params["canal_id"],
                "contato_id": params["contato_id"],
                "instance": params["instance"],
                "remote_jid": params["remote_jid"],
                "status": "nova",
                "nao_lidas": 1,
                "ultima_mensagem": params["ultima_mensagem"],
                "ultima_direcao": "entrada",
                "ultima_msg_at": params["ultima_msg_at"],
                "last_inbound_at": params["last_inbound_at"],
                "campanha": params.get("campanha"),
                "lead_status": params.get("lead_status"),
            }
            self.conversations_by_key[key] = row
            return _Result(row=(conversation_id,))

        if "insert into public.crm_whatsapp_mensagens" in sql_lower:
            message_hash = params["message_hash"]
            if message_hash in self.messages_by_hash:
                return _Result()
            message_id = str(uuid.uuid4())
            row = {
                "id": message_id,
                "workspace_id": params["workspace_id"],
                "canal_id": params["canal_id"],
                "raw_event_id": params["raw_event_id"],
                "contato_id": params["contato_id"],
                "conversa_id": params["conversa_id"],
                "message_hash": message_hash,
                "conteudo": params["conteudo"],
                "message_type": params["message_type"],
                "remetente_nome": params["remetente_nome"],
                "payload": params["payload"],
            }
            self.messages_by_hash[message_hash] = row
            return _Result(row=(message_id,))

        if "select id from public.crm_whatsapp_mensagens" in sql_lower and "message_hash = :message_hash" in sql_lower:
            row = self.messages_by_hash.get(params["message_hash"])
            return _Result(row=(row["id"],)) if row else _Result()

        if "insert into public.crm_lead_origin_events" in sql_lower:
            origin_id = str(uuid.uuid4())
            row = {
                "id": origin_id,
                "raw_event_id": params["raw_event_id"],
                "contato_id": params["contato_id"],
                "conversa_id": params["conversa_id"],
                "mensagem_id": params["mensagem_id"],
                "source": params["source"],
                "medium": params["medium"],
                "campaign": params["campaign"],
                "origin_label": params["origin_label"],
            }
            self.lead_origin_by_raw_event_id[params["raw_event_id"]] = row
            return _Result(row=(origin_id,))

        if "update public.crm_whatsapp_contatos" in sql_lower and "last_origin_event_id = :origin_event_id" in sql_lower:
            contact_id = params["contato_id"]
            row = next((item for item in self.contacts_by_jid.values() if item["id"] == contact_id), None)
            if row:
                row["last_origin_event_id"] = params["origin_event_id"]
            return _Result()

        raise AssertionError(f"Unexpected SQL: {sql}")

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def refresh(self, obj):
        self.refreshes += 1
        return obj


def _build_app(db):
    app = FastAPI()
    app.include_router(canais.router)

    def override_get_db():
        yield db

    app.dependency_overrides[canais.get_db] = override_get_db
    app.dependency_overrides[canais.get_usuario_atual] = lambda: SimpleNamespace(
        id=uuid.uuid4(),
        role="platform_admin",
    )
    return app


def _sign_body(body: bytes, secret: str, timestamp: int | None = None) -> tuple[int, str]:
    ts = timestamp or int(datetime.now(timezone.utc).timestamp())
    signature = hmac.new(
        secret.encode("utf-8"),
        f"{ts}.".encode("utf-8") + body,
        hashlib.sha256,
    ).hexdigest()
    return ts, signature


def _json_body(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def test_criar_canal_webhook_gera_secret_e_sanitiza_resposta(monkeypatch):
    db = _CrudDb()
    workspace_id = uuid.uuid4()
    app = _build_app(db)
    client = TestClient(app)

    monkeypatch.setattr(canais, "_get_workspace_or_404", lambda *_args, **_kwargs: SimpleNamespace(id=workspace_id))
    monkeypatch.setattr(canais, "verificar_acesso_workspace", lambda *_args, **_kwargs: None)

    payload = {
        "tipo": "webhook",
        "nome": "Odonto API",
        "config": {"webhook": {"endpoint": "https://example.test"}},
        "mensagem_boas_vindas": None,
        "status": "inativo",
    }

    response = client.post(f"/workspaces/{workspace_id}/canais", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["tipo"] == "webhook"
    assert data["webhook_secret"]
    assert len(data["webhook_secret"]) == 64
    assert "hmac_secret" not in data["config"]["webhook"]
    assert db.added
    assert db.added[0].config["webhook"]["hmac_secret"] == data["webhook_secret"]


def test_atualizar_canal_webhook_nao_reexibe_secret_e_preserva_secret_existente(monkeypatch):
    db = _CrudDb()
    workspace_id = uuid.uuid4()
    secret = "e" * 64
    canal = CanalEntrada(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        tipo="webhook",
        nome="Canal Legado",
        config={"webhook": {"endpoint": "https://example.test", "hmac_secret": secret}},
        webhook_token="token-legado",
        status="inativo",
    )
    app = _build_app(db)
    client = TestClient(app)

    monkeypatch.setattr(canais, "_get_canal_or_404", lambda *_args, **_kwargs: canal)

    payload = {
        "nome": "Canal Legado",
        "config": {"webhook": {"endpoint": "https://example.test/editado"}},
        "mensagem_boas_vindas": None,
        "status": "ativo",
    }

    response = client.put(f"/canais/{canal.id}", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert "webhook_secret" not in data
    assert data["config"]["webhook"]["endpoint"] == "https://example.test/editado"
    assert "hmac_secret" not in data["config"]["webhook"]
    assert canal.config["webhook"]["hmac_secret"] == secret


def test_rotacionar_secret_webhook_retorna_secret_uma_vez(monkeypatch):
    db = _WebhookDb(None)
    workspace_id = uuid.uuid4()
    canal = CanalEntrada(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        tipo="webhook",
        nome="Canal Webhook",
        config={"webhook": {"endpoint": "https://example.test", "hmac_secret": "f" * 64}},
        webhook_token="token-webhook",
        status="ativo",
    )
    db._canal = canal
    app = _build_app(db)
    client = TestClient(app)

    response = client.post(f"/canais/{canal.id}/webhook-secret/rotacionar")

    assert response.status_code == 200
    data = response.json()
    assert data["webhook_secret"]
    assert len(data["webhook_secret"]) == 64
    assert data["config"]["webhook"]["endpoint"] == "https://example.test"
    assert "hmac_secret" not in data["config"]["webhook"]
    assert canal.config["webhook"]["hmac_secret"] == data["webhook_secret"]


def test_listagem_e_detalhe_de_canais_webhook_nao_expoem_secret(monkeypatch):
    secret = "g" * 64
    canal = CanalEntrada(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        tipo="webhook",
        nome="Canal Webhook",
        config={"webhook": {"endpoint": "https://example.test", "hmac_secret": secret}},
        webhook_token="token-webhook",
        status="ativo",
    )

    class _ListQuery:
        def __init__(self, canais):
            self._canais = canais

        def filter(self, *_args, **_kwargs):
            return self

        def all(self):
            return self._canais

    class _ListDb:
        def query(self, _model):
            return _ListQuery([canal])

    db = _ListDb()
    app = _build_app(db)
    app.dependency_overrides[canais.get_workspace_atual] = lambda: None
    monkeypatch.setattr(canais, "verificar_acesso_workspace", lambda *_args, **_kwargs: None)
    client = TestClient(app)

    response_list = client.get("/canais")
    assert response_list.status_code == 200
    list_data = response_list.json()
    assert list_data[0]["tipo"] == "webhook"
    assert "webhook_secret" not in list_data[0]
    assert "hmac_secret" not in list_data[0]["config"]["webhook"]

    monkeypatch.setattr(canais, "_get_canal_or_404", lambda *_args, **_kwargs: canal)
    response_detail = client.get(f"/canais/{canal.id}")
    assert response_detail.status_code == 200
    detail_data = response_detail.json()
    assert detail_data["tipo"] == "webhook"
    assert "webhook_secret" not in detail_data
    assert "hmac_secret" not in detail_data["config"]["webhook"]


def test_webhook_token_invalido_retorna_404():
    db = _WebhookDb(None)
    app = _build_app(db)
    client = TestClient(app)

    response = client.post("/webhook/token-invalido", content=b"{}")

    assert response.status_code == 404


def test_webhook_sem_secret_retorna_403_controlado():
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        webhook_token="token-webhook",
        tipo="webhook",
        nome="Webhook API",
        config={"webhook": {}},
    )
    db = _WebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)

    response = client.post("/webhook/token-webhook", content=b"{}")

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "webhook_secret_missing"


def test_webhook_hmac_invalido_retorna_403():
    secret = "a" * 64
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        webhook_token="token-webhook",
        tipo="webhook",
        nome="Webhook API",
        config={"webhook": {"hmac_secret": secret}},
    )
    db = _WebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)
    body = _json_body(
        {
            "type": "lead.created",
            "event_id": "evt-1",
            "occurred_at": "2026-05-30T12:34:56Z",
            "contact": {"external_id": "lead-1"},
            "lead": {"status": "novo"},
            "metadata": {},
        }
    )
    ts, _signature = _sign_body(body, secret)

    response = client.request(
        "POST",
        "/webhook/token-webhook",
        content=body,
        headers={
            "X-OP7-Timestamp": str(ts),
            "X-OP7-Signature": "deadbeef",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "webhook_signature_invalid"


def test_webhook_timestamp_velho_retorna_403():
    secret = "b" * 64
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        webhook_token="token-webhook",
        tipo="webhook",
        nome="Webhook API",
        config={"webhook": {"hmac_secret": secret}},
    )
    db = _WebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)
    body = _json_body(
        {
            "type": "lead.created",
            "event_id": "evt-2",
            "occurred_at": "2026-05-30T12:34:56Z",
            "contact": {"external_id": "lead-2"},
            "lead": {"status": "novo"},
            "metadata": {},
        }
    )
    old_ts = int(datetime.now(timezone.utc).timestamp()) - 600
    signature = hmac.new(
        secret.encode("utf-8"),
        f"{old_ts}.".encode("utf-8") + body,
        hashlib.sha256,
    ).hexdigest()

    response = client.request(
        "POST",
        "/webhook/token-webhook",
        content=body,
        headers={
            "X-OP7-Timestamp": str(old_ts),
            "X-OP7-Signature": signature,
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "webhook_timestamp_out_of_range"


def test_webhook_payload_grande_retorna_413():
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        webhook_token="token-webhook",
        tipo="webhook",
        nome="Webhook API",
        config={"webhook": {"hmac_secret": "c" * 64}},
    )
    db = _WebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)

    response = client.post("/webhook/token-webhook", content=b"x" * (1_048_576 + 1))

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "webhook_payload_too_large"


def test_webhook_evento_valido_cria_contato_conversa_mensagem_e_idempotencia(caplog):
    secret = "d" * 64
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        webhook_token="token-webhook",
        tipo="webhook",
        nome="Webhook API",
        config={"webhook": {"hmac_secret": secret}},
    )
    db = _WebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)
    payload = {
        "type": "lead.created",
        "event_id": "evt-100",
        "occurred_at": "2026-05-30T12:34:56Z",
        "contact": {
            "external_id": "lead-123",
            "name": "João Silva",
            "phone": "+55 47 99999-9999",
        },
        "lead": {
            "status": "novo",
            "source": "landing_page",
            "campaign": "campanha-bf-2026",
        },
        "metadata": {
            "provider": "odonto-crm",
            "utm_source": "google",
            "utm_medium": "cpc",
        },
    }
    body = _json_body(payload)
    ts, signature = _sign_body(body, secret)

    caplog.set_level("INFO")
    response_1 = client.request(
        "POST",
        "/webhook/token-webhook",
        content=body,
        headers={
            "X-OP7-Timestamp": str(ts),
            "X-OP7-Signature": signature,
        },
    )
    response_2 = client.request(
        "POST",
        "/webhook/token-webhook",
        content=body,
        headers={
            "X-OP7-Timestamp": str(ts),
            "X-OP7-Signature": signature,
        },
    )

    assert response_1.status_code == 200
    assert response_1.json()["status"] == "processed"
    assert response_1.json()["idempotent"] is False
    assert response_1.json()["contato_id"]
    assert response_1.json()["conversa_id"]
    assert response_1.json()["mensagem_id"]
    assert "webhook_secret" not in response_1.json()
    assert "hmac_secret" not in response_1.json()

    assert response_2.status_code == 200
    assert response_2.json()["status"] == "duplicate"
    assert response_2.json()["idempotent"] is True
    assert response_2.json()["event_id"] == response_1.json()["event_id"]
    assert response_2.json()["contato_id"] == response_1.json()["contato_id"]
    assert response_2.json()["conversa_id"] == response_1.json()["conversa_id"]
    assert response_2.json()["mensagem_id"] == response_1.json()["mensagem_id"]
    assert "webhook_secret" not in response_2.json()
    assert "hmac_secret" not in response_2.json()

    assert len(db.events_by_hash) == 1
    assert len(db.contacts_by_jid) == 1
    assert len(db.conversations_by_key) == 1
    assert len(db.messages_by_hash) == 1
    assert len(db.lead_origin_by_raw_event_id) == 1
    stored_message = next(iter(db.messages_by_hash.values()))
    assert stored_message["conteudo"].startswith("[Webhook/API] Lead recebido")
    assert secret not in caplog.text
