from __future__ import annotations

import json
import uuid
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import canais
from app.services.webhook_api_ingestion import prepare_webhook_config, sanitize_webhook_config


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


class _WebhookQuery:
    def __init__(self, canal):
        self._canal = canal

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._canal


class _HelenaWebhookDb:
    def __init__(self, canal):
        self._canal = canal
        self.calls: list[tuple[str, dict | None]] = []
        self.commits = 0
        self.rollbacks = 0
        self.events_by_hash: dict[str, dict[str, str]] = {}
        self.contacts_by_key: dict[tuple[str, str], dict[str, str]] = {}
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
                "event_type": params["event_type"],
                "payload": params["payload"],
                "remote_jid": params.get("remote_jid"),
                "instance": params.get("instance"),
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

        if "select id from public.crm_whatsapp_mensagens" in sql_lower and "remote_jid = :remote_jid" in sql_lower and "message_hash" not in sql_lower:
            row = next(
                (
                    item
                    for item in self.messages_by_hash.values()
                    if item["workspace_id"] == params["workspace_id"]
                    and item["canal_id"] == params["canal_id"]
                    and item["instance"] == params["instance"]
                    and item["remote_jid"] == params["remote_jid"]
                ),
                None,
            )
            return _Result(row=(row["id"],)) if row else _Result()

        if "select id, status from public.crm_whatsapp_conversas" in sql_lower and "remote_jid = :remote_jid" in sql_lower and "ativo = true" in sql_lower:
            key = (params["workspace_id"], params["canal_id"], params["instance"], params["remote_jid"])
            row = self.conversations_by_key.get(key)
            return _Result(row=(row["id"], row["status"])) if row else _Result()

        if "select id from public.crm_whatsapp_conversas" in sql_lower and "remote_jid = :remote_jid" in sql_lower and "ativo = true" in sql_lower:
            key = (params["workspace_id"], params["canal_id"], params["instance"], params["remote_jid"])
            row = self.conversations_by_key.get(key)
            return _Result(row=(row["id"],)) if row else _Result()

        if "insert into public.crm_whatsapp_contatos" in sql_lower:
            key = (params["workspace_id"], params["jid"])
            existing = self.contacts_by_key.get(key)
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
            self.contacts_by_key[key] = {
                "id": contact_id,
                "workspace_id": params["workspace_id"],
                "jid": params["jid"],
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
            return _Result(row=(contact_id,))

        if "select id from public.crm_whatsapp_contatos" in sql_lower and "where workspace_id = cast(:workspace_id as uuid)" in sql_lower and "jid = :jid" in sql_lower:
            row = self.contacts_by_key.get((params["workspace_id"], params["jid"]))
            return _Result(row=(row["id"],)) if row else _Result()

        if "insert into public.crm_whatsapp_conversas" in sql_lower:
            key = (params["workspace_id"], params["canal_id"], params["instance"], params["remote_jid"])
            row = self.conversations_by_key.get(key)
            if row is not None:
                row["ultima_mensagem"] = params["ultima_mensagem"]
                row["ultima_direcao"] = "entrada"
                row["ultima_msg_at"] = params["ultima_msg_at"]
                row["last_inbound_at"] = params["last_inbound_at"]
                row["nao_lidas"] = row.get("nao_lidas", 0) + 1
                row["campanha"] = row.get("campanha") or params.get("campanha")
                row["lead_status"] = row.get("lead_status") or params.get("lead_status")
                return _Result(row=(row["id"],))

            conversation_id = str(uuid.uuid4())
            self.conversations_by_key[key] = {
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
            return _Result(row=(conversation_id,))

        if "update public.crm_whatsapp_conversas" in sql_lower and "set ultima_mensagem = :ultima_mensagem" in sql_lower:
            conversation_id = params["conversa_id"]
            row = next((item for item in self.conversations_by_key.values() if item["id"] == conversation_id), None)
            if row is not None:
                row["ultima_mensagem"] = params["ultima_mensagem"]
                row["ultima_direcao"] = "entrada"
                row["ultima_msg_at"] = params["ultima_msg_at"]
                row["last_inbound_at"] = params["last_inbound_at"]
                row["nao_lidas"] = row.get("nao_lidas", 0) + 1
                row["campanha"] = row.get("campanha") or params.get("campanha")
                row["lead_status"] = row.get("lead_status") or params.get("lead_status")
                return _Result(row=(conversation_id,))
            return _Result()

        if "insert into public.crm_whatsapp_mensagens" in sql_lower:
            message_hash = params["message_hash"]
            if message_hash in self.messages_by_hash:
                return _Result()
            message_id = str(uuid.uuid4())
            self.messages_by_hash[message_hash] = {
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
                "instance": params["instance"],
                "remote_jid": params["remote_jid"],
            }
            return _Result(row=(message_id,))

        if "select id from public.crm_whatsapp_mensagens" in sql_lower and "message_hash = :message_hash" in sql_lower:
            row = self.messages_by_hash.get(params["message_hash"])
            return _Result(row=(row["id"],)) if row else _Result()

        if "insert into public.crm_lead_origin_events" in sql_lower:
            origin_id = str(uuid.uuid4())
            self.lead_origin_by_raw_event_id[params["raw_event_id"]] = {
                "id": origin_id,
                "raw_event_id": params["raw_event_id"],
                "contato_id": params["contato_id"],
                "conversa_id": params["conversa_id"],
                "mensagem_id": params["mensagem_id"],
                "source": params["source"],
                "medium": params["medium"],
                "campaign": params["campaign"],
                "origin_label": params["origin_label"],
                "raw_payload": params["raw_payload"],
            }
            return _Result(row=(origin_id,))

        if "update public.crm_whatsapp_contatos" in sql_lower and "last_origin_event_id = :origin_event_id" in sql_lower:
            contact_id = params["contato_id"]
            row = next((item for item in self.contacts_by_key.values() if item["id"] == contact_id), None)
            if row is not None:
                row["last_origin_event_id"] = params["origin_event_id"]
            return _Result()

        raise AssertionError(f"Unexpected SQL: {sql}")

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


def _build_app(db):
    app = FastAPI()
    app.include_router(canais.router)

    def override_get_db():
        yield db

    app.dependency_overrides[canais.get_db] = override_get_db
    return app


def _json_body(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _make_canal(config: dict | None = None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        webhook_token="token-webhook",
        tipo="webhook",
        nome="Helena CRM",
        config=config or {"webhook": {"provider": "helena"}},
        status="ativo",
    )


def _helena_contact_payload(*, updated_at: str, status: str = "ACTIVE", name: str = "John Raymond Legrasse"):
    return {
        "eventType": "CONTACT_UPDATE",
        "date": "2023-08-23T16:42:35.4359934Z",
        "content": {
            "id": "ed2b52f8-cf13-449b-b3d5-ae27051f4663",
            "createdAt": "2022-10-28T21:24:26.158391Z",
            "updatedAt": updated_at,
            "companyId": "626fb5de-0cc2-4209-b456-47b454ee6e14",
            "name": name,
            "phonenumber": "+55|00000000000",
            "phonenumberFormatted": "(00) 00000-0000",
            "email": "exemplo@email.com",
            "instagram": None,
            "annotation": "",
            "tagsId": [],
            "tags": [],
            "status": status,
            "origin": "CREATED_FROM_HUB",
            "utm": None,
            "customFieldValues": {},
            "metadata": None,
        },
    }


def test_prepare_webhook_config_helena_nao_persiste_bearer_token():
    incoming = {
        "webhook": {
            "provider": "helena",
            "api_token": "bearer-secret",
            "bearer_token": "bearer-secret-2",
            "access_token": "bearer-secret-3",
            "helena": {
                "api_token": "nested-secret",
                "api_token_ref": "ref-1",
            },
        }
    }

    stored, secret, generated = prepare_webhook_config(incoming)

    assert secret is None
    assert generated is False
    assert "api_token" not in stored["webhook"]
    assert "bearer_token" not in stored["webhook"]
    assert "access_token" not in stored["webhook"]
    assert "api_token" not in stored["webhook"]["helena"]
    assert stored["webhook"]["helena"]["api_token_ref"] == "ref-1"

    sanitized = sanitize_webhook_config(stored)
    assert "hmac_secret" not in sanitized["webhook"]
    assert "api_token" not in sanitized["webhook"]["helena"]


def test_helena_contact_update_cria_contato_conversa_e_mensagem_sintetica():
    canal = _make_canal()
    db = _HelenaWebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)

    payload = _helena_contact_payload(updated_at="2023-08-23T16:15:35.3814324Z")
    response = client.post(f"/webhook/{canal.webhook_token}", content=_json_body(payload))

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "processed"
    assert data["idempotent"] is False
    assert data["contato_id"]
    assert data["conversa_id"]
    assert data["mensagem_id"]
    assert len(db.events_by_hash) == 1
    assert len(db.contacts_by_key) == 1
    assert len(db.conversations_by_key) == 1
    assert len(db.messages_by_hash) == 1

    stored_message = next(iter(db.messages_by_hash.values()))
    assert stored_message["conteudo"].startswith("[Helena CRM] Lead recebido")
    assert stored_message["workspace_id"] == str(canal.workspace_id)
    assert stored_message["canal_id"] == str(canal.id)


def test_helena_contact_update_repetido_e_idempotente_nao_duplica():
    canal = _make_canal()
    db = _HelenaWebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)
    payload = _helena_contact_payload(updated_at="2023-08-23T16:15:35.3814324Z")
    body = _json_body(payload)

    response_1 = client.post(f"/webhook/{canal.webhook_token}", content=body)
    response_2 = client.post(f"/webhook/{canal.webhook_token}", content=body)

    assert response_1.status_code == 200
    assert response_2.status_code == 200
    assert response_1.json()["status"] == "processed"
    assert response_2.json()["status"] == "duplicate"
    assert response_2.json()["idempotent"] is True
    assert response_2.json()["event_id"] == response_1.json()["event_id"]
    assert response_2.json()["contato_id"] == response_1.json()["contato_id"]
    assert response_2.json()["conversa_id"] == response_1.json()["conversa_id"]
    assert response_2.json()["mensagem_id"] == response_1.json()["mensagem_id"]
    assert len(db.events_by_hash) == 1
    assert len(db.contacts_by_key) == 1
    assert len(db.conversations_by_key) == 1
    assert len(db.messages_by_hash) == 1


def test_helena_contact_update_novo_mesmo_contato_nao_spamma_mensagem_sintetica():
    canal = _make_canal()
    db = _HelenaWebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)

    payload_1 = _helena_contact_payload(updated_at="2023-08-23T16:15:35.3814324Z", status="ACTIVE")
    payload_2 = _helena_contact_payload(updated_at="2023-08-24T10:00:00.0000000Z", status="PENDING", name="John R. Legrasse")

    response_1 = client.post(f"/webhook/{canal.webhook_token}", content=_json_body(payload_1))
    response_2 = client.post(f"/webhook/{canal.webhook_token}", content=_json_body(payload_2))

    assert response_1.status_code == 200
    assert response_2.status_code == 200
    assert response_2.json()["status"] == "processed"
    assert response_2.json()["mensagem_id"] is None
    assert response_2.json()["conversa_id"] == response_1.json()["conversa_id"]
    assert len(db.events_by_hash) == 2
    assert len(db.contacts_by_key) == 1
    assert len(db.conversations_by_key) == 1
    assert len(db.messages_by_hash) == 1
    assert len(db.lead_origin_by_raw_event_id) == 2


def test_helena_evento_com_texto_real_cria_mensagem_real():
    canal = _make_canal()
    db = _HelenaWebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)

    payload = {
        "eventType": "MESSAGE_RECEIVED",
        "date": "2023-08-23T18:42:35.4359934Z",
        "content": {
            "id": "b3d5ae27-051f-4663-82ca-8a3f4b5f0fbb",
            "companyId": "626fb5de-0cc2-4209-b456-47b454ee6e14",
            "name": "Maria Silva",
            "phonenumber": "+55|00000000000",
            "status": "ACTIVE",
            "origin": "CREATED_FROM_HUB",
            "message": {"text": "Olá, quero orçamento"},
            "utm": {"source": "google", "medium": "cpc", "campaign": "campanha-bf-2026"},
            "customFieldValues": {"utm_term": "implante"},
            "metadata": {"channel": "whatsapp"},
        },
    }

    response = client.post(f"/webhook/{canal.webhook_token}", content=_json_body(payload))

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "processed"
    assert data["mensagem_id"]
    stored_message = next(iter(db.messages_by_hash.values()))
    assert stored_message["conteudo"] == "Olá, quero orçamento"
    assert stored_message["message_type"] == "text"
    assert stored_message["workspace_id"] == str(canal.workspace_id)
    assert stored_message["canal_id"] == str(canal.id)


def test_webhook_token_invalido_retorna_404():
    db = _HelenaWebhookDb(None)
    app = _build_app(db)
    client = TestClient(app)

    response = client.post("/webhook/token-invalido", content=b"{}")

    assert response.status_code == 404
