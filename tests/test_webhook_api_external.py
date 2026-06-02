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
        self.events_by_id: dict[str, dict[str, str]] = {}
        self.contacts_by_jid: dict[str, dict[str, str]] = {}
        self.conversations_by_key: dict[tuple[str, str, str, str], dict[str, str]] = {}
        self.messages_by_hash: dict[str, dict[str, str]] = {}
        self.messages_by_id: dict[str, dict[str, str]] = {}
        self.messages_by_provider_id: dict[str, dict[str, str]] = {}
        self.lead_origin_by_raw_event_id: dict[str, dict[str, str]] = {}
        self.jobs_by_session: dict[tuple[str, str, str], dict[str, str]] = {}

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
            row = {
                "id": event_id,
                "event_hash": event_hash,
                "event_type": params["event_type"],
                "payload": params["payload"],
                "remote_jid": params.get("remote_jid"),
                "raw_event_id": event_id,
            }
            self.events_by_hash[event_hash] = row
            self.events_by_id[event_id] = row
            return _Result(row=(event_id,))

        if "update public.crm_whatsapp_eventos" in sql_lower:
            raw_event_id = params["raw_event_id"]
            row = self.events_by_id.get(raw_event_id)
            if row:
                row["payload"] = params.get("payload")
                row["processing_status"] = "done"
                row["error_message"] = None
            return _Result()

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

        if "select id from public.crm_message_jobs" in sql_lower and "payload->>'session_id'" in sql_lower:
            key = (params["workspace_id"], params["canal_id"], params["session_id"])
            row = self.jobs_by_session.get(key)
            if not row:
                return _Result()
            return _Result(row=(row["id"],))

        if "insert into public.crm_message_jobs" in sql_lower and params and params.get("job_type") == "helena_session_enrichment":
            payload = json.loads(params["payload"])
            key = (params["workspace_id"], params["canal_id"], payload["session_id"])
            if key in self.jobs_by_session:
                return _Result()
            job_id = str(uuid.uuid4())
            row = {
                "id": job_id,
                "workspace_id": params["workspace_id"],
                "canal_id": params["canal_id"],
                "job_type": "helena_session_enrichment",
                "status": "pending",
                "payload": payload,
            }
            self.jobs_by_session[key] = row
            return _Result(row=(job_id,))

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
                row["ultima_msg_at"] = params["ultima_msg_at"]
                if params.get("last_outbound_at") is not None:
                    row["ultima_direcao"] = "saida"
                    row["last_outbound_at"] = params["last_outbound_at"]
                    row["nao_lidas"] = row.get("nao_lidas", 0) + params.get("nao_lidas", 0)
                else:
                    row["ultima_direcao"] = "entrada"
                    row["last_inbound_at"] = params["last_inbound_at"]
                    row["nao_lidas"] = row.get("nao_lidas", 0) + params.get("nao_lidas", 1)
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
                "nao_lidas": params.get("nao_lidas", 1),
                "ultima_mensagem": params["ultima_mensagem"],
                "ultima_direcao": params.get("ultima_direcao", "entrada"),
                "ultima_msg_at": params["ultima_msg_at"],
                "last_inbound_at": params.get("last_inbound_at"),
                "last_outbound_at": params.get("last_outbound_at"),
                "campanha": params.get("campanha"),
                "lead_status": params.get("lead_status"),
            }
            self.conversations_by_key[key] = row
            return _Result(row=(conversation_id,))

        if (
            "insert into public.crm_whatsapp_mensagens" in sql_lower
            and "evolution_msg_id" in sql_lower
            and "status, wa_status" in sql_lower
            and params is not None
            and "evolution_msg_id" in params
            and "status" in params
            and "wa_status" in params
        ):
            provider_message_id = params["evolution_msg_id"]
            if provider_message_id in self.messages_by_provider_id:
                return _Result()
            message_id = str(uuid.uuid4())
            row = {
                "id": message_id,
                "workspace_id": params["workspace_id"],
                "canal_id": params["canal_id"],
                "raw_event_id": params["raw_event_id"],
                "contato_id": params["contato_id"],
                "conversa_id": params["conversa_id"],
                "message_hash": params["message_hash"],
                "evolution_msg_id": provider_message_id,
                "conteudo": params["conteudo"],
                "message_type": params["message_type"],
                "status": params.get("status"),
                "wa_status": params.get("wa_status"),
                "remetente_tipo": params["remetente_tipo"],
                "remetente_nome": params["remetente_nome"],
                "payload": params["payload"],
                "instance": params["instance"],
                "remote_jid": params["remote_jid"],
                "direcao": params.get("direcao", "entrada"),
                "from_me": params.get("from_me", False),
                "enviada_em": params.get("enviada_em"),
                "recebida_em": params.get("recebida_em"),
                "delivered_at": None,
                "read_at": None,
            }
            self.messages_by_provider_id[provider_message_id] = row
            self.messages_by_id[message_id] = row
            self.messages_by_hash[params["message_hash"]] = row
            return _Result(row=(message_id,))

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
                "instance": params["instance"],
                "remote_jid": params["remote_jid"],
            }
            self.messages_by_hash[message_hash] = row
            self.messages_by_id[message_id] = row
            return _Result(row=(message_id,))

        if (
            "update public.crm_whatsapp_mensagens" in sql_lower
            and "where id = cast(:mensagem_id as uuid)" in sql_lower
        ):
            row = self.messages_by_id.get(params["mensagem_id"])
            if row:
                row["workspace_id"] = params.get("workspace_id", row.get("workspace_id"))
                row["canal_id"] = params.get("canal_id", row.get("canal_id"))
                row["raw_event_id"] = params.get("raw_event_id", row.get("raw_event_id"))
                row["contato_id"] = params.get("contato_id", row.get("contato_id"))
                row["conversa_id"] = params.get("conversa_id", row.get("conversa_id"))
                row["evolution_msg_id"] = params.get("evolution_msg_id", row.get("evolution_msg_id"))
                row["message_hash"] = params.get("message_hash", row.get("message_hash"))
                row["conteudo"] = params.get("conteudo", row.get("conteudo"))
                row["message_type"] = params.get("message_type", row.get("message_type"))
                row["status"] = params.get("status", row.get("status"))
                row["wa_status"] = params.get("wa_status", row.get("wa_status"))
                row["remetente_nome"] = params.get("remetente_nome", row.get("remetente_nome"))
                row["payload"] = params.get("payload", row.get("payload"))
                row["instance"] = params.get("instance", row.get("instance"))
                row["remote_jid"] = params.get("remote_jid", row.get("remote_jid"))
                row["direcao"] = params.get("direcao", row.get("direcao"))
                row["from_me"] = params.get("from_me", row.get("from_me"))
                row["enviada_em"] = params.get("message_timestamp") if params.get("from_me") else row.get("enviada_em")
                row["recebida_em"] = params.get("message_timestamp") if not params.get("from_me") else row.get("recebida_em")
                if params.get("wa_status") == "delivered":
                    row["delivered_at"] = params.get("message_timestamp")
                if params.get("wa_status") == "read":
                    row["read_at"] = params.get("message_timestamp")
                if row.get("message_hash"):
                    self.messages_by_hash[row["message_hash"]] = row
                if row.get("evolution_msg_id"):
                    self.messages_by_provider_id[row["evolution_msg_id"]] = row
                return _Result(row=(row["id"],))
            return _Result()

        if "select id from public.crm_whatsapp_mensagens" in sql_lower and "message_hash = :message_hash" in sql_lower:
            row = self.messages_by_hash.get(params["message_hash"])
            return _Result(row=(row["id"],)) if row else _Result()

        if "select id, workspace_id, canal_id, instance, evolution_msg_id" in sql_lower and "evolution_msg_id = :provider_message_id" in sql_lower:
            row = self.messages_by_provider_id.get(params["provider_message_id"])
            return _Result(mapping=row) if row else _Result()

        if (
            "select id from public.crm_whatsapp_mensagens" in sql_lower
            and "instance = :instance" in sql_lower
            and "remote_jid = :remote_jid" in sql_lower
            and "message_hash" not in sql_lower
        ):
            row = next(
                (
                    item
                    for item in self.messages_by_hash.values()
                    if item.get("workspace_id") == params["workspace_id"]
                    and item.get("canal_id") == params["canal_id"]
                    and item.get("instance") == params["instance"]
                    and item.get("remote_jid") == params["remote_jid"]
                ),
                None,
            )
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


def _crm_externo_payload(
    *,
    event_id: str = "evt-100",
    include_type: bool = True,
    include_contact_identifiers: bool = True,
    message_text: str | None = "Quero atendimento - Lead Teste",
    contact_name: str = "Lead Teste",
    external_id: str = "lead-123",
    phone: str = "+55 47 99999-9999",
    email: str = "lead-123@example.com",
    provider: str = "op7-externo",
    occurred_at: str = "2026-05-30T12:34:56Z",
) -> dict:
    payload = {
        "type": "lead.created",
        "event_id": event_id,
        "occurred_at": occurred_at,
        "contact": {
            "name": contact_name,
            "email": email,
            "phone": phone,
            "external_id": external_id,
        },
        "lead": {
            "status": "novo",
            "source": "landing_page",
            "campaign": "campanha-bf-2026",
        },
        "message": {},
        "metadata": {
            "provider": provider,
            "utm_source": "google",
            "utm_medium": "cpc",
        },
    }
    if not include_type:
        payload.pop("type", None)
    if not include_contact_identifiers:
        payload["contact"].pop("phone", None)
        payload["contact"].pop("external_id", None)
    if message_text is not None:
        payload["message"] = {"text": message_text}
    return payload


def _crm_externo_wrapper_payload(
    *,
    event_type: str = "MESSAGE_RECEIVED",
    direction: str = "FROM_HUB",
    content_id: str = "e6b9db1f-72f6-4df3-ba51-f38eed96da2d",
    session_id: str = "cafe48b9-f305-4800-8c3b-3adeea6555ff",
    text: str | None = "oi",
    content_type: str = "TEXT",
    status: str = "SENT",
    origin: str = "GATEWAY",
    company_id: str = "583469db-0990-4507-b912-8b7ad5804aa8",
    phone_from: str = "+55 47 99999-0001",
    phone_to: str = "+55 47 98888-0002",
    as_object: bool = False,
) -> dict | list:
    contact_phone = phone_from if direction == "FROM_HUB" else phone_to
    destination_phone = phone_to if direction == "FROM_HUB" else phone_from
    content = {
        "id": content_id,
        "companyId": company_id,
        "sessionId": session_id,
        "type": content_type,
        "timestamp": "2026-05-30T06:40:25.196Z",
        "text": text,
        "direction": direction,
        "status": status,
        "origin": origin,
        "details": {
            "to": destination_phone,
            "from": contact_phone,
            "file": None,
            "location": None,
            "contact": None,
            "errors": None,
            "transcription": None,
            "billing": None,
        },
    }
    body = {
        "eventType": event_type,
        "date": "2026-05-30T06:40:26.0706187Z",
        "content": content,
        "changeMetadata": None,
    }
    wrapper = {
        "headers": {"x-test": "1"},
        "params": {},
        "query": {},
        "body": body,
        "webhookUrl": "https://example.test/webhook/external",
        "executionMode": "production",
    }
    if as_object:
        return wrapper
    return [wrapper]


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


def test_criar_canal_webhook_crm_externo_zapi_nao_gera_secret(monkeypatch):
    db = _CrudDb()
    workspace_id = uuid.uuid4()
    app = _build_app(db)
    client = TestClient(app)

    monkeypatch.setattr(canais, "_get_workspace_or_404", lambda *_args, **_kwargs: SimpleNamespace(id=workspace_id))
    monkeypatch.setattr(canais, "verificar_acesso_workspace", lambda *_args, **_kwargs: None)

    payload = {
        "tipo": "webhook",
        "nome": "CRM Externo ZAPI",
        "config": {"webhook": {"provider": "crm_externo_zapi"}},
        "mensagem_boas_vindas": None,
        "status": "inativo",
    }

    response = client.post(f"/workspaces/{workspace_id}/canais", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert "webhook_secret" not in data
    assert data["config"]["webhook"]["provider"] == "crm_externo_zapi"
    assert data["config"]["webhook"]["security_mode"] == "provider_token"
    assert "hmac_secret" not in data["config"]["webhook"]
    assert db.added[0].config["webhook"]["provider"] == "crm_externo_zapi"
    assert db.added[0].config["webhook"]["security_mode"] == "provider_token"


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


def test_atualizar_canal_webhook_preserva_sub_blocos_e_gera_secret_generico(monkeypatch):
    db = _CrudDb()
    workspace_id = uuid.uuid4()
    canal = CanalEntrada(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        tipo="webhook",
        nome="Canal Helena",
        config={
            "webhook": {
                "provider": "helena",
                "security_mode": "provider_token",
                "helena": {
                    "api_token_ref": "HELENA_CHAT_TOKEN_QOZT",
                    "from_phone": "+5547992828458",
                    "custom_field": "keep-me",
                },
            },
            "evolution": {
                "instance_name": "rudy_zap",
                "instance_id": "instance-id-1",
                "instance_token": "instance-token-secret",
            },
        },
        webhook_token="token-legado",
        status="ativo",
    )
    app = _build_app(db)
    client = TestClient(app)

    monkeypatch.setattr(canais, "_get_canal_or_404", lambda *_args, **_kwargs: canal)

    payload = {
        "nome": "Canal Helena",
        "config": {"webhook": {"provider": "generic", "security_mode": "hmac"}},
        "mensagem_boas_vindas": "Olá",
        "status": "ativo",
    }

    response = client.put(f"/canais/{canal.id}", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["config"]["webhook"]["provider"] == "generic"
    assert data["config"]["webhook"]["security_mode"] == "hmac"
    assert data["config"]["webhook"]["helena"]["api_token_ref"] == "HELENA_CHAT_TOKEN_QOZT"
    assert data["config"]["webhook"]["helena"]["from_phone"] == "+5547992828458"
    assert data["config"]["webhook"]["helena"]["custom_field"] == "keep-me"
    assert "hmac_secret" not in data["config"]["webhook"]
    assert data["config"]["evolution"]["instance_name"] == "rudy_zap"
    assert "instance_token" not in data["config"]["evolution"]
    assert canal.config["webhook"]["provider"] == "generic"
    assert canal.config["webhook"]["security_mode"] == "hmac"
    assert len(canal.config["webhook"]["hmac_secret"]) == 64
    assert canal.config["webhook"]["helena"]["api_token_ref"] == "HELENA_CHAT_TOKEN_QOZT"
    assert canal.config["evolution"]["instance_token"] == "instance-token-secret"


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


def test_webhook_crm_externo_zapi_aceita_sem_hmac_e_eh_idempotente():
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        webhook_token="token-webhook",
        tipo="webhook",
        nome="CRM Externo ZAPI",
        config={"webhook": {"provider": "crm_externo_zapi", "security_mode": "provider_token"}},
    )
    db = _WebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)
    body = _json_body(_crm_externo_payload(event_id="evt-200"))

    response_1 = client.post("/webhook/token-webhook", content=body)
    response_2 = client.post("/webhook/token-webhook", content=body)

    assert response_1.status_code == 200
    assert response_1.json()["status"] == "processed"
    assert response_1.json()["idempotent"] is False
    assert response_1.json()["contato_id"]
    assert response_1.json()["conversa_id"]
    assert response_1.json()["mensagem_id"]
    assert response_2.status_code == 200
    assert response_2.json()["status"] == "duplicate"
    assert response_2.json()["idempotent"] is True
    assert response_2.json()["event_id"] == response_1.json()["event_id"]
    assert response_2.json()["contato_id"] == response_1.json()["contato_id"]
    assert response_2.json()["conversa_id"] == response_1.json()["conversa_id"]
    assert response_2.json()["mensagem_id"] == response_1.json()["mensagem_id"]
    assert len(db.events_by_hash) == 1
    assert len(db.contacts_by_jid) == 1
    assert len(db.conversations_by_key) == 1
    assert len(db.messages_by_hash) == 1
    assert len(db.lead_origin_by_raw_event_id) == 1
    contact_row = next(iter(db.contacts_by_jid.values()))
    conversation_key = next(iter(db.conversations_by_key))
    conversation_row = db.conversations_by_key[conversation_key]
    assert contact_row["workspace_id"] == str(canal.workspace_id)
    assert conversation_row["workspace_id"] == str(canal.workspace_id)
    assert conversation_row["canal_id"] == str(canal.id)


def test_webhook_crm_externo_zapi_wrapper_array_cria_mensagem_de_entrada_textual():
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        webhook_token="token-webhook",
        tipo="webhook",
        nome="CRM Externo ZAPI",
        config={"webhook": {"provider": "crm_externo_zapi", "security_mode": "provider_token"}},
    )
    db = _WebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)
    body = _json_body(
        _crm_externo_wrapper_payload(
            event_type="MESSAGE_RECEIVED",
            direction="FROM_HUB",
            content_id="msg-100",
            session_id="sess-100",
            text="oi",
            content_type="TEXT",
            status="SENT",
            phone_from="+55 47 99999-0001",
            phone_to="+55 47 98888-0002",
        )
    )

    response_1 = client.post("/webhook/token-webhook", content=body)
    response_2 = client.post("/webhook/token-webhook", content=body)

    assert response_1.status_code == 200
    assert response_1.json()["status"] == "processed"
    assert response_1.json()["idempotent"] is False
    assert response_1.json()["mensagem_id"]
    assert response_2.status_code == 200
    assert response_2.json()["status"] == "duplicate"
    assert response_2.json()["idempotent"] is True
    assert response_2.json()["mensagem_id"] == response_1.json()["mensagem_id"]
    assert len(db.events_by_hash) == 1
    assert len(db.messages_by_hash) == 1
    assert len(db.messages_by_provider_id) == 1
    stored_message = next(iter(db.messages_by_provider_id.values()))
    assert stored_message["conteudo"] == "oi"
    assert stored_message["direcao"] == "entrada"
    assert stored_message["from_me"] is False
    assert stored_message["evolution_msg_id"] == "msg-100"
    instance = f"webhook:{str(canal.id).replace('-', '')[:8]}"
    conversation_key = "sess-100"
    conversation_row = db.conversations_by_key[(str(canal.workspace_id), str(canal.id), instance, "sess-100")]
    assert conversation_row["remote_jid"] == conversation_key
    assert conversation_row["ultima_direcao"] == "entrada"
    assert conversation_row["nao_lidas"] == 1
    assert len(db.lead_origin_by_raw_event_id) == 1


def test_webhook_crm_externo_zapi_wrapper_enfileira_enrichment_da_sessao():
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        webhook_token="token-webhook",
        tipo="webhook",
        nome="CRM Externo ZAPI",
        config={"webhook": {"provider": "crm_externo_zapi", "security_mode": "provider_token"}},
    )
    db = _WebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)
    body = _json_body(
        _crm_externo_wrapper_payload(
            event_type="MESSAGE_RECEIVED",
            direction="FROM_HUB",
            content_id="msg-enrich",
            session_id="sess-enrich",
            text="preciso de ajuda",
            content_type="TEXT",
            status="SENT",
            phone_from="+55 47 99999-0001",
            phone_to="+55 47 98888-0002",
        )
    )

    response = client.post("/webhook/token-webhook", content=body)
    assert response.status_code == 200
    assert response.json()["status"] == "processed"
    assert len(db.jobs_by_session) == 1
    job_row = next(iter(db.jobs_by_session.values()))
    assert job_row["job_type"] == "helena_session_enrichment"
    assert job_row["payload"]["session_id"] == "sess-enrich"
    assert job_row["payload"]["provider"] == "crm_externo_zapi"
    assert job_row["payload"]["source_event_id"] == response.json()["event_id"]
    assert job_row["payload"]["conversation_id"] == response.json()["conversa_id"]
    assert job_row["payload"]["contact_id"] == response.json()["contato_id"]


def test_webhook_crm_externo_zapi_wrapper_object_message_sent_atualiza_status_sem_duplica():
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        webhook_token="token-webhook",
        tipo="webhook",
        nome="CRM Externo ZAPI",
        config={"webhook": {"provider": "crm_externo_zapi", "security_mode": "provider_token"}},
    )
    db = _WebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)
    body_1 = _json_body(
        _crm_externo_wrapper_payload(
            event_type="MESSAGE_SENT",
            direction="TO_HUB",
            content_id="msg-200",
            session_id="sess-200",
            text="mensagem enviada",
            content_type="TEXT",
            status="SENT",
            phone_from="+55 47 98888-0002",
            phone_to="+55 47 99999-0001",
            as_object=True,
        )
    )
    body_2 = _json_body(
        _crm_externo_wrapper_payload(
            event_type="MESSAGE_SENT",
            direction="TO_HUB",
            content_id="msg-200",
            session_id="sess-200",
            text="mensagem enviada",
            content_type="TEXT",
            status="DELIVERED",
            phone_from="+55 47 98888-0002",
            phone_to="+55 47 99999-0001",
            as_object=True,
        )
    )

    response_1 = client.post("/webhook/token-webhook", content=body_1)
    response_2 = client.post("/webhook/token-webhook", content=body_2)

    assert response_1.status_code == 200
    assert response_1.json()["status"] == "processed"
    assert response_1.json()["mensagem_id"]
    assert response_2.status_code == 200
    assert response_2.json()["status"] == "processed"
    assert response_2.json()["mensagem_id"] == response_1.json()["mensagem_id"]
    assert len(db.events_by_hash) == 1
    assert len(db.messages_by_hash) == 1
    assert len(db.messages_by_provider_id) == 1
    stored_message = next(iter(db.messages_by_provider_id.values()))
    assert stored_message["conteudo"] == "mensagem enviada"
    assert stored_message["direcao"] == "saida"
    assert stored_message["from_me"] is True
    assert stored_message["status"] == "entregue"
    assert stored_message["wa_status"] == "delivered"
    instance = f"webhook:{str(canal.id).replace('-', '')[:8]}"
    conversation_row = db.conversations_by_key[(str(canal.workspace_id), str(canal.id), instance, "sess-200")]
    assert conversation_row["remote_jid"] == "sess-200"
    assert conversation_row["ultima_direcao"] == "saida"
    assert conversation_row["nao_lidas"] == 0
    assert len(db.lead_origin_by_raw_event_id) == 1


def test_webhook_crm_externo_zapi_rejeita_sem_type_e_sem_contact_identificavel():
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        webhook_token="token-webhook",
        tipo="webhook",
        nome="CRM Externo ZAPI",
        config={"webhook": {"provider": "crm_externo_zapi", "security_mode": "provider_token"}},
    )
    db = _WebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)

    response_missing_type = client.post(
        "/webhook/token-webhook",
        content=_json_body(_crm_externo_payload(event_id="evt-201", include_type=False)),
    )
    response_missing_contact = client.post(
        "/webhook/token-webhook",
        content=_json_body(_crm_externo_payload(event_id="evt-202", include_contact_identifiers=False)),
    )

    assert response_missing_type.status_code == 400
    assert response_missing_type.json()["detail"]["code"] == "webhook_payload_invalid"
    assert response_missing_contact.status_code == 400
    assert response_missing_contact.json()["detail"]["code"] == "webhook_payload_invalid"


def test_webhook_crm_externo_zapi_sem_texto_so_cria_sintetica_uma_vez():
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        webhook_token="token-webhook",
        tipo="webhook",
        nome="CRM Externo ZAPI",
        config={"webhook": {"provider": "crm_externo_zapi", "security_mode": "provider_token"}},
    )
    db = _WebhookDb(canal)
    app = _build_app(db)
    client = TestClient(app)

    body_1 = _json_body(_crm_externo_payload(event_id="evt-300", message_text=None))
    body_2 = _json_body(_crm_externo_payload(event_id="evt-301", message_text=None))

    response_1 = client.post("/webhook/token-webhook", content=body_1)
    response_2 = client.post("/webhook/token-webhook", content=body_2)

    assert response_1.status_code == 200
    assert response_1.json()["status"] == "processed"
    assert response_1.json()["mensagem_id"]
    assert response_2.status_code == 200
    assert response_2.json()["status"] == "processed"
    assert response_2.json()["mensagem_id"] == response_1.json()["mensagem_id"]
    assert len(db.messages_by_hash) == 1
    assert len(db.conversations_by_key) == 1
    assert len(db.lead_origin_by_raw_event_id) == 2
    stored_conversation = next(iter(db.conversations_by_key.values()))
    assert stored_conversation["nao_lidas"] == 1
