from __future__ import annotations

import json
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import canais
from app.services import helena_chat


class _Result:
    def __init__(self, row=None):
        self._row = row

    def fetchone(self):
        return self._row

    def scalar(self):
        if isinstance(self._row, tuple):
            return self._row[0]
        if isinstance(self._row, dict):
            return self._row.get("id")
        return None


class _Query:
    def __init__(self, canal):
        self._canal = canal

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._canal


class _HelenaOutboundDb:
    def __init__(
        self,
        canal,
        *,
        conversa_row: tuple[str, str, str, str | None, str | None, str | None],
        inserted_message_id: str = "message-id-1",
        workspace_access_role: str | None = None,
    ) -> None:
        self._canal = canal
        self.conversa_row = conversa_row
        self.inserted_message_id = inserted_message_id
        self.workspace_access_role = workspace_access_role
        self.commits = 0
        self.refreshes = 0
        self.calls: list[tuple[str, dict | None]] = []
        self.conversation_updates: list[dict | None] = []
        self.insert_params: dict | None = None

    def query(self, _model):
        if _model is canais.CanalEntrada:
            return _Query(self._canal)
        if _model is canais.UserWorkspaceAccess:
            acesso = None
            if self.workspace_access_role is not None:
                acesso = SimpleNamespace(role=self.workspace_access_role, ativo=True)
            return _Query(acesso)
        return _Query(None)

    def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        sql_lower = sql.lower()
        self.calls.append((sql, params))

        if "from public.crm_whatsapp_conversas c join public.crm_whatsapp_contatos ct on ct.id = c.contato_id" in sql_lower:
            return _Result(row=self.conversa_row)

        if "update public.crm_whatsapp_conversas" in sql_lower and "last_outbound_at" in sql_lower:
            self.conversation_updates.append(params)
            return _Result(row=(params["conversa_id"],))

        if "insert into public.crm_whatsapp_mensagens" in sql_lower and "failed_reason" in sql_lower and "wa_status" in sql_lower:
            self.insert_params = params
            return _Result(row=(self.inserted_message_id,))

        raise AssertionError(f"Unexpected SQL: {sql}")

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        self.refreshes += 1
        return obj


def _build_app(db, usuario=None):
    app = FastAPI()
    app.include_router(canais.router)

    def override_get_db():
        yield db

    app.dependency_overrides[canais.get_db] = override_get_db
    app.dependency_overrides[canais.get_usuario_atual] = lambda: usuario or SimpleNamespace(
        id=uuid.uuid4(),
        role="platform_admin",
        nome="Admin",
        email="admin@example.com",
        workspace_id=None,
    )
    return app


def _make_helena_canal(*, provider: str = "crm_externo_zapi", from_phone: str | None = "+5547992828458"):
    canal_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    config = {
        "webhook": {
            "provider": provider,
            "security_mode": "provider_token",
            "helena": {
                "api_token_ref": "HELENA_CHAT_TOKEN_QOZT",
            },
        }
    }
    if from_phone is not None:
        config["webhook"]["helena"]["from_phone"] = from_phone
    return SimpleNamespace(
        id=canal_id,
        workspace_id=workspace_id,
        tipo="webhook",
        nome="Canal Helena",
        config=config,
        status="ativo",
        webhook_token="token-webhook",
    )


def test_send_text_message_rejeita_sem_env(monkeypatch):
    monkeypatch.delenv("HELENA_CHAT_TOKEN_QOZT", raising=False)
    canal = _make_helena_canal()

    with pytest.raises(helena_chat.HelenaChatError) as exc_info:
        helena_chat.send_text_message(canal, to_phone="+55 47 98888-0002", text="Olá")

    assert exc_info.value.status_code == 503
    assert "HELENA_CHAT_TOKEN_QOZT" in str(exc_info.value)


def test_send_text_message_rejeita_sem_from_phone(monkeypatch):
    monkeypatch.setenv("HELENA_CHAT_TOKEN_QOZT", "token-de-teste")
    canal = _make_helena_canal(from_phone=None)

    with pytest.raises(helena_chat.HelenaChatError) as exc_info:
        helena_chat.send_text_message(canal, to_phone="+55 47 98888-0002", text="Olá")

    assert exc_info.value.status_code == 400
    assert "from_phone" in str(exc_info.value)


def test_get_helena_session_by_id_usa_include_details_repetido_e_token_ref(monkeypatch):
    monkeypatch.setenv("HELENA_CHAT_TOKEN_QOZT", "token-de-teste")
    canal = _make_helena_canal()

    payload = {
        "sessionId": "session-123",
        "status": "PENDING",
        "contactDetails": {
            "name": "Cliente Teste",
            "phonenumber": "+55 47 98888-0002",
            "pictureUrl": "https://cdn.example.test/avatar.jpg",
        },
        "lastMessageText": "Olá",
        "lastInteractionDate": "2026-05-30T12:34:56Z",
        "unreadCount": 2,
    }

    class _Response:
        status_code = 200
        text = ""

        def json(self):
            return payload

    captured: dict[str, object] = {}

    class _Client:
        def __init__(self, timeout=None):
            captured["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url, headers=None, params=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            return _Response()

    monkeypatch.setattr(helena_chat.httpx, "Client", _Client)

    result = helena_chat.get_helena_session_by_id(canal, "session-123", timeout=7.5)

    assert result == payload
    assert captured["timeout"] == 7.5
    assert captured["url"] == "https://api.helena.run/chat/v2/session/session-123"
    assert captured["headers"]["Authorization"] == "token-de-teste"
    assert captured["params"] == [
        ("includeDetails", "ContactDetails"),
        ("includeDetails", "ChannelTypeDetails"),
        ("includeDetails", "ClassificationDetails"),
    ]


def test_get_helena_session_by_id_aceita_config_em_objetos_aninhados(monkeypatch):
    monkeypatch.setenv("HELENA_CHAT_TOKEN_QOZT", "token-de-teste")
    canal = SimpleNamespace(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        tipo="webhook",
        nome="Canal Helena",
        config=SimpleNamespace(
            webhook=SimpleNamespace(
                provider="helena",
                helena=SimpleNamespace(
                    api_token_ref="HELENA_CHAT_TOKEN_QOZT",
                    api_base_url="https://api.helena.run/chat",
                ),
            )
        ),
        status="ativo",
        webhook_token="token-webhook",
    )

    payload = {"sessionId": "session-999", "contactDetails": {"name": "Cliente"}}

    class _Response:
        status_code = 200
        text = ""

        def json(self):
            return payload

    captured: dict[str, object] = {}

    class _Client:
        def __init__(self, timeout=None):
            captured["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url, headers=None, params=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            return _Response()

    monkeypatch.setattr(helena_chat.httpx, "Client", _Client)

    result = helena_chat.get_helena_session_by_id(canal, "session-999", timeout=4.5)

    assert result == payload
    assert captured["headers"]["Authorization"] == "token-de-teste"
    assert captured["params"] == [
        ("includeDetails", "ContactDetails"),
        ("includeDetails", "ChannelTypeDetails"),
        ("includeDetails", "ClassificationDetails"),
    ]


def test_enviar_mensagem_canal_crm_externo_zapi_usa_helena_e_persiste(monkeypatch):
    monkeypatch.setenv("HELENA_CHAT_TOKEN_QOZT", "token-de-teste")

    canal = _make_helena_canal()
    conversa_id = uuid.uuid4()
    contato_id = uuid.uuid4()
    db = _HelenaOutboundDb(
        canal,
        conversa_row=(
            str(conversa_id),
            str(contato_id),
            "sess-200",
            "5547 9999-8888",
            "+55 (47) 9999-8888",
            "554799998888@s.whatsapp.net",
        ),
    )
    app = _build_app(db)
    client = TestClient(app)

    provider_response = {
        "provider": "helena_chat",
        "provider_token_ref": "HELENA_CHAT_TOKEN_QOZT",
        "provider_message_id": "msg-200",
        "provider_session_id": "session-200",
        "provider_status": "SENT",
        "provider_status_normalized": "sent",
        "provider_status_label": "enviada",
        "provider_status_url": "https://api.helena.run/chat/v1/message/status/msg-200",
        "provider_failure_reason": None,
        "raw": {
            "id": "msg-200",
            "sessionId": "session-200",
            "status": "SENT",
            "statusUrl": "https://api.helena.run/chat/v1/message/status/msg-200",
            "failureReason": None,
        },
    }

    with patch("app.api.canais.helena_service.send_text_message", return_value=provider_response) as mock_send, patch(
        "app.api.canais.publish_whatsapp_event"
    ) as mock_publish:
        response = client.post(
            f"/canais/{canal.id}/enviar-mensagem",
            json={
                "conversa_id": str(conversa_id),
                "texto": "Olá, Helena",
                "tipo": "texto",
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["mensagem_id"] == "message-id-1"
    assert data["evolution_response"]["provider_message_id"] == "msg-200"
    assert data["evolution_response"]["provider_session_id"] == "session-200"

    mock_send.assert_called_once()
    _, send_kwargs = mock_send.call_args
    assert send_kwargs["to_phone"] == "+554799998888"
    assert send_kwargs["text"] == "Olá, Helena"

    assert db.insert_params is not None
    assert db.insert_params["evolution_msg_id"] == "msg-200"
    assert db.insert_params["status"] == "enviada"
    assert db.insert_params["wa_status"] == "sent"
    assert db.insert_params["failed_reason"] is None
    payload = json.loads(db.insert_params["payload"])
    assert payload["provider_message_id"] == "msg-200"
    assert payload["provider_session_id"] == "session-200"
    assert payload["provider_status_url"] == "https://api.helena.run/chat/v1/message/status/msg-200"
    assert payload["provider_failure_reason"] is None
    assert db.conversation_updates and db.conversation_updates[0]["conversa_id"] == str(conversa_id)
    assert db.commits == 1
    mock_publish.assert_called_once()


def test_enviar_mensagem_canal_webhook_helena_sem_outbound_retorna_erro_claro(monkeypatch):
    monkeypatch.setenv("HELENA_CHAT_TOKEN_QOZT", "token-de-teste")
    canal = _make_helena_canal(provider="helena")
    db = _HelenaOutboundDb(
        canal,
        conversa_row=(
            str(uuid.uuid4()),
            str(uuid.uuid4()),
            "sess-300",
            "5547 9999-8888",
            "+55 (47) 9999-8888",
            "554799998888@s.whatsapp.net",
        ),
    )
    app = _build_app(db)
    client = TestClient(app)

    response = client.post(
        f"/canais/{canal.id}/enviar-mensagem",
        json={
            "conversa_id": str(uuid.uuid4()),
            "texto": "Olá",
            "tipo": "texto",
        },
    )

    assert response.status_code == 400
    assert "Canal Helena é inbound" in response.json()["detail"]


@pytest.mark.parametrize(
    "usuario_role,workspace_access_role,workspace_id,expected_status,expected_detail,should_send",
    [
        ("company_agent", "editor", None, 200, None, True),
        ("company_agent", "admin", None, 200, None, True),
        ("platform_admin", None, None, 200, None, True),
        ("company_agent", "viewer", None, 403, "Sem permissão para enviar mensagens neste atendimento", False),
        ("company_agent", None, None, 403, "Sem permissão para enviar mensagens neste atendimento", False),
    ],
)
def test_enviar_mensagem_canal_respeita_permissa_operacional(
    monkeypatch,
    usuario_role,
    workspace_access_role,
    workspace_id,
    expected_status,
    expected_detail,
    should_send,
):
    monkeypatch.setenv("HELENA_CHAT_TOKEN_QOZT", "token-de-teste")

    canal = _make_helena_canal()
    conversa_id = uuid.uuid4()
    contato_id = uuid.uuid4()
    db = _HelenaOutboundDb(
        canal,
        conversa_row=(
            str(conversa_id),
            str(contato_id),
            "sess-900",
            "5547 9999-8888",
            "+55 (47) 9999-8888",
            "554799998888@s.whatsapp.net",
        ),
        workspace_access_role=workspace_access_role,
    )
    usuario = SimpleNamespace(
        id=uuid.uuid4(),
        role=usuario_role,
        nome="Larissa",
        email="larissa@example.com",
        workspace_id=workspace_id,
    )
    app = _build_app(db, usuario=usuario)
    client = TestClient(app)

    provider_response = {
        "provider": "helena_chat",
        "provider_token_ref": "HELENA_CHAT_TOKEN_QOZT",
        "provider_message_id": "msg-900",
        "provider_session_id": "session-900",
        "provider_status": "SENT",
        "provider_status_normalized": "sent",
        "provider_status_label": "enviada",
        "provider_status_url": "https://api.helena.run/chat/v1/message/status/msg-900",
        "provider_failure_reason": None,
        "raw": {
            "id": "msg-900",
            "sessionId": "session-900",
            "status": "SENT",
            "statusUrl": "https://api.helena.run/chat/v1/message/status/msg-900",
            "failureReason": None,
        },
    }

    with patch("app.api.canais.helena_service.send_text_message", return_value=provider_response) as mock_send, patch(
        "app.api.canais.publish_whatsapp_event"
    ) as mock_publish:
        response = client.post(
            f"/canais/{canal.id}/enviar-mensagem",
            json={
                "conversa_id": str(conversa_id),
                "texto": "Olá, Helena",
                "tipo": "texto",
            },
        )

    assert response.status_code == expected_status
    if should_send:
        data = response.json()
        assert data["ok"] is True
        assert data["evolution_response"]["provider_message_id"] == "msg-900"
        mock_send.assert_called_once()
        mock_publish.assert_called_once()
    else:
        assert response.json()["detail"] == expected_detail
        mock_send.assert_not_called()
        mock_publish.assert_not_called()


@pytest.mark.parametrize(
    "usuario_role,workspace_access_role,workspace_id,expected_status,expected_detail,should_store",
    [
        ("company_agent", "editor", None, 200, None, True),
        ("platform_admin", None, None, 200, None, True),
        ("company_agent", "viewer", None, 403, "Sem permissão para enviar mensagens neste atendimento", False),
        ("company_agent", None, None, 403, "Sem permissão para enviar mensagens neste atendimento", False),
    ],
)
def test_upload_midia_usa_mesma_permissa_operacional(
    monkeypatch,
    usuario_role,
    workspace_access_role,
    workspace_id,
    expected_status,
    expected_detail,
    should_store,
):
    canal = _make_helena_canal()
    db = _HelenaOutboundDb(
        canal,
        conversa_row=(
            str(uuid.uuid4()),
            str(uuid.uuid4()),
            "sess-901",
            "5547 9999-8888",
            "+55 (47) 9999-8888",
            "554799998888@s.whatsapp.net",
        ),
        workspace_access_role=workspace_access_role,
    )
    usuario = SimpleNamespace(
        id=uuid.uuid4(),
        role=usuario_role,
        nome="Larissa",
        email="larissa@example.com",
        workspace_id=workspace_id,
    )
    app = _build_app(db, usuario=usuario)
    client = TestClient(app)

    stored_media = SimpleNamespace(
        url="https://cdn.example.com/media/teste.pdf",
        object_key="whatsapp/teste.pdf",
        mimetype="application/pdf",
        filename="teste.pdf",
        size=11,
        sha256="abc123",
        media_type="document",
    )

    with patch("app.api.canais.store_media_bytes", return_value=stored_media) as mock_store:
        response = client.post(
            f"/canais/{canal.id}/upload-midia",
            data={"conversa_id": str(uuid.uuid4())},
            files={"arquivo": ("teste.pdf", b"conteudo", "application/pdf")},
        )

    assert response.status_code == expected_status
    if should_store:
        data = response.json()
        assert data["ok"] is True
        assert data["media_url"] == stored_media.url
        mock_store.assert_called_once()
    else:
        assert response.json()["detail"] == expected_detail
        mock_store.assert_not_called()


def test_editar_canal_continua_protegido_para_usuario_operacional(monkeypatch):
    monkeypatch.setenv("HELENA_CHAT_TOKEN_QOZT", "token-de-teste")

    canal = _make_helena_canal()
    db = _HelenaOutboundDb(
        canal,
        conversa_row=(
            str(uuid.uuid4()),
            str(uuid.uuid4()),
            "sess-902",
            "5547 9999-8888",
            "+55 (47) 9999-8888",
            "554799998888@s.whatsapp.net",
        ),
        workspace_access_role="editor",
    )
    usuario = SimpleNamespace(
        id=uuid.uuid4(),
        role="company_agent",
        nome="Larissa",
        email="larissa@example.com",
        workspace_id=None,
    )
    app = _build_app(db, usuario=usuario)
    client = TestClient(app)

    response = client.post(f"/canais/{canal.id}/webhook-secret/rotacionar")

    assert response.status_code == 403
    assert response.json()["detail"] == "Sem permissão para editar este canal"
