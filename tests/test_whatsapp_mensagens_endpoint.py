from __future__ import annotations

import uuid
import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import mensagens as mensagens_api
from app.models.crm import Mensagem, Midia


def _build_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as conn:
        conn.exec_driver_sql(
            """
            CREATE TABLE crm_whatsapp_mensagens (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                conversa_id TEXT NOT NULL,
                canal_id TEXT NOT NULL,
                raw_event_id TEXT,
                contato_id TEXT,
                evolution_msg_id TEXT,
                message_hash TEXT,
                instance TEXT,
                remote_jid TEXT,
                direcao TEXT NOT NULL,
                from_me INTEGER NOT NULL DEFAULT 0,
                remetente_tipo TEXT NOT NULL,
                remetente_nome TEXT,
                conteudo TEXT,
                message_type TEXT,
                participant_jid TEXT,
                participant_name TEXT,
                is_mentioned INTEGER NOT NULL DEFAULT 0,
                wa_status TEXT,
                payload TEXT,
                tokens_estimados INTEGER,
                embedding_status TEXT,
                enviada_em TEXT,
                recebida_em TEXT,
                delivered_at TEXT,
                read_at TEXT,
                failed_reason TEXT,
                media_status TEXT,
                media_error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                ativo INTEGER NOT NULL DEFAULT 1,
                deleted_at TEXT
            )
            """
        )
        conn.exec_driver_sql(
            """
            CREATE TABLE crm_whatsapp_midia (
                id TEXT PRIMARY KEY,
                conversa_id TEXT NOT NULL,
                workspace_id TEXT,
                canal_id TEXT,
                mensagem_id TEXT,
                tipo TEXT NOT NULL,
                minio_path TEXT,
                url_publica TEXT,
                mimetype TEXT,
                tamanho INTEGER,
                filename TEXT,
                caption TEXT,
                storage_status TEXT NOT NULL,
                sha256 TEXT,
                duration_seconds INTEGER,
                width INTEGER,
                height INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                ativo INTEGER NOT NULL DEFAULT 1,
                deleted_at TEXT
            )
            """
        )
    return engine


def _build_app(session_factory, workspace_id):
    app = FastAPI()
    app.include_router(mensagens_api.router)

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[mensagens_api.get_db] = override_get_db
    app.dependency_overrides[mensagens_api.get_usuario_atual] = lambda: SimpleNamespace(
        id="user-1",
        role="platform_admin",
    )
    app.dependency_overrides[mensagens_api.get_workspace_atual] = lambda: workspace_id
    return app


def test_get_mensagens_retorna_historico_mesmo_sem_thumbnail_url(monkeypatch):
    engine = _build_engine()
    SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

    workspace_id = uuid.uuid4()
    canal_id = uuid.uuid4()
    conversa_id = uuid.uuid4()
    contato_id = uuid.uuid4()
    media_message_id = uuid.uuid4()
    text_message_id = uuid.uuid4()
    now = datetime.utcnow()

    with SessionLocal() as db:
        db.add_all(
            [
                Mensagem(
                    id=text_message_id,
                    workspace_id=workspace_id,
                    conversa_id=conversa_id,
                    canal_id=canal_id,
                    contato_id=contato_id,
                    evolution_msg_id="msg-text-1",
                    instance="op7-instance",
                    remote_jid="5511999999999@s.whatsapp.net",
                    direcao="entrada",
                    from_me=False,
                    remetente_tipo="contato",
                    remetente_nome="Lead",
                    conteudo="Mensagem de texto",
                    message_type="conversation",
                    wa_status="delivered",
                    payload={},
                    recebida_em=now,
                    criado_em=now,
                    atualizado_em=now,
                    ativo=True,
                ),
                Mensagem(
                    id=media_message_id,
                    workspace_id=workspace_id,
                    conversa_id=conversa_id,
                    canal_id=canal_id,
                    contato_id=contato_id,
                    evolution_msg_id="msg-media-1",
                    instance="op7-instance",
                    remote_jid="5511999999999@s.whatsapp.net",
                    direcao="entrada",
                    from_me=False,
                    remetente_tipo="contato",
                    remetente_nome="Lead",
                    conteudo="Foto do pedido",
                    message_type="imageMessage",
                    wa_status="delivered",
                    payload={},
                    recebida_em=now + timedelta(seconds=1),
                    criado_em=now + timedelta(seconds=1),
                    atualizado_em=now + timedelta(seconds=1),
                    ativo=True,
                ),
                Midia(
                    id=uuid.uuid4(),
                    conversa_id=conversa_id,
                    workspace_id=workspace_id,
                    canal_id=canal_id,
                    mensagem_id=media_message_id,
                    tipo="image",
                    minio_path=f"whatsapp/{workspace_id}/{conversa_id}/foto.jpg",
                    url_publica="https://cdn.example.com/foto.jpg",
                    mimetype="image/jpeg",
                    tamanho=1024,
                    filename="foto.jpg",
                    caption="Foto do pedido",
                    storage_status="ready",
                    sha256="a" * 64,
                    duration_seconds=None,
                    width=800,
                    height=600,
                    criado_em=now + timedelta(seconds=1),
                    atualizado_em=now + timedelta(seconds=1),
                    ativo=True,
                ),
            ]
        )
        db.commit()

    monkeypatch.setattr(mensagens_api, "verificar_acesso_workspace", lambda *args, **kwargs: None)

    app = _build_app(SessionLocal, workspace_id)
    client = TestClient(app)

    response = client.get(
        f"/mensagens?conversa_id={conversa_id}&workspace_id={workspace_id}&limit=10"
    )

    assert response.status_code == 200
    messages = response.json()
    assert len(messages) == 2
    assert any(msg["midias"] for msg in messages)
    text_message = next(msg for msg in messages if msg["id"] == str(text_message_id))
    assert text_message["wa_status"] == "delivered"
    assert text_message["evolution_msg_id"] == "msg-text-1"
    media_message = next(msg for msg in messages if msg["id"] == str(media_message_id))
    assert media_message["wa_status"] == "delivered"
    assert media_message["evolution_msg_id"] == "msg-media-1"
    assert media_message["midias"][0]["filename"] == "foto.jpg"


class MensagensMediaTests(unittest.TestCase):
    def test_get_mensagens_retorna_historico_mesmo_sem_thumbnail_url(self):
        engine = _build_engine()
        SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

        workspace_id = uuid.uuid4()
        canal_id = uuid.uuid4()
        conversa_id = uuid.uuid4()
        contato_id = uuid.uuid4()
        media_message_id = uuid.uuid4()
        text_message_id = uuid.uuid4()
        now = datetime.utcnow()

        with SessionLocal() as db:
            db.add_all(
                [
                    Mensagem(
                        id=text_message_id,
                        workspace_id=workspace_id,
                        conversa_id=conversa_id,
                        canal_id=canal_id,
                        contato_id=contato_id,
                        evolution_msg_id="msg-text-1",
                        instance="op7-instance",
                        remote_jid="5511999999999@s.whatsapp.net",
                        direcao="entrada",
                        from_me=False,
                        remetente_tipo="contato",
                        remetente_nome="Lead",
                        conteudo="Mensagem de texto",
                        message_type="conversation",
                        wa_status="delivered",
                        payload={},
                        recebida_em=now,
                        criado_em=now,
                        atualizado_em=now,
                        ativo=True,
                    ),
                    Mensagem(
                        id=media_message_id,
                        workspace_id=workspace_id,
                        conversa_id=conversa_id,
                        canal_id=canal_id,
                        contato_id=contato_id,
                        evolution_msg_id="msg-media-1",
                        instance="op7-instance",
                        remote_jid="5511999999999@s.whatsapp.net",
                        direcao="entrada",
                        from_me=False,
                        remetente_tipo="contato",
                        remetente_nome="Lead",
                        conteudo="Foto do pedido",
                        message_type="imageMessage",
                        wa_status="delivered",
                        payload={},
                        recebida_em=now + timedelta(seconds=1),
                        criado_em=now + timedelta(seconds=1),
                        atualizado_em=now + timedelta(seconds=1),
                        ativo=True,
                    ),
                    Midia(
                        id=uuid.uuid4(),
                        conversa_id=conversa_id,
                        workspace_id=workspace_id,
                        canal_id=canal_id,
                        mensagem_id=media_message_id,
                        tipo="image",
                        minio_path=f"whatsapp/{workspace_id}/{conversa_id}/foto.jpg",
                        url_publica="https://cdn.example.com/foto.jpg",
                        mimetype="image/jpeg",
                        tamanho=1024,
                        filename="foto.jpg",
                        caption="Foto do pedido",
                        storage_status="ready",
                        sha256="a" * 64,
                        duration_seconds=None,
                        width=800,
                        height=600,
                        criado_em=now + timedelta(seconds=1),
                        atualizado_em=now + timedelta(seconds=1),
                        ativo=True,
                    ),
                ]
            )
            db.commit()

        with patch.object(mensagens_api, "verificar_acesso_workspace", lambda *args, **kwargs: None):
            app = _build_app(SessionLocal, workspace_id)
            client = TestClient(app)
            response = client.get(
                f"/mensagens?conversa_id={conversa_id}&workspace_id={workspace_id}&limit=10"
            )

        assert response.status_code == 200
        messages = response.json()
        assert len(messages) == 2
        assert any(msg["midias"] for msg in messages)
        text_message = next(msg for msg in messages if msg["id"] == str(text_message_id))
        assert text_message["wa_status"] == "delivered"
        assert text_message["evolution_msg_id"] == "msg-text-1"
        media_message = next(msg for msg in messages if msg["id"] == str(media_message_id))
        assert media_message["wa_status"] == "delivered"
        assert media_message["evolution_msg_id"] == "msg-media-1"
        assert media_message["midias"][0]["filename"] == "foto.jpg"


class MensagensEndpointStatusTests(unittest.TestCase):
    def test_get_mensagens_expoe_wa_status_do_banco(self):
        engine = _build_engine()
        SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

        workspace_id = uuid.uuid4()
        canal_id = uuid.uuid4()
        conversa_id = uuid.uuid4()
        contato_id = uuid.uuid4()
        now = datetime.utcnow()

        with SessionLocal() as db:
            db.add(
                Mensagem(
                    id=uuid.uuid4(),
                    workspace_id=workspace_id,
                    conversa_id=conversa_id,
                    canal_id=canal_id,
                    contato_id=contato_id,
                    evolution_msg_id="receipt-check-1",
                    instance="op7-instance",
                    remote_jid="5511999999999@s.whatsapp.net",
                    direcao="saida",
                    from_me=True,
                    remetente_tipo="agente",
                    remetente_nome="Agente",
                    conteudo="receipt-check",
                    message_type="conversation",
                    wa_status="delivered",
                    enviada_em=now,
                    recebida_em=now,
                    delivered_at=now,
                    criado_em=now,
                    atualizado_em=now,
                    ativo=True,
                )
            )
            db.commit()

        app = _build_app(SessionLocal, workspace_id)
        with patch.object(mensagens_api, "verificar_acesso_workspace", lambda *args, **kwargs: None):
            client = TestClient(app)
            response = client.get(
                f"/mensagens?conversa_id={conversa_id}&workspace_id={workspace_id}&limit=10"
            )

        self.assertEqual(response.status_code, 200)
        messages = response.json()
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["wa_status"], "delivered")
        self.assertEqual(messages[0]["evolution_msg_id"], "receipt-check-1")
