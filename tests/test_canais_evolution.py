import uuid
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.api import canais
from app.core.config import settings
from app.services import evolution as evo_service

_BASE64_QR_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/"
    "x8AAwMCAO+X9eAAAAAASUVORK5CYII="
)


class _FakeResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _FakeHttpxClient:
    def __init__(self, responses, calls):
        self._responses = responses
        self._calls = calls

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url, headers=None):
        self._calls.append((url, headers))
        if not self._responses:
            raise AssertionError("Nenhuma resposta fake restante para httpx.Client.get")
        return self._responses.pop(0)

    def post(self, url, headers=None, json=None):
        self._calls.append((url, headers, json))
        if not self._responses:
            raise AssertionError("Nenhuma resposta fake restante para httpx.Client.post")
        return self._responses.pop(0)


class _FakeDb:
    def __init__(self):
        self.commits = 0
        self.refreshes = []

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        self.refreshes.append(obj)


class _ReapplyQuery:
    def __init__(self, canais):
        self._canais = canais

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return self._canais


class _ReapplyDb:
    def __init__(self, canais):
        self._canais = canais

    def query(self, _model):
        return _ReapplyQuery(self._canais)


class _OutboundResult:
    def __init__(self, row=None, scalar_value=None):
        self._row = row
        self._scalar_value = scalar_value

    def fetchone(self):
        return self._row

    def scalar(self):
        if self._scalar_value is not None:
            return self._scalar_value
        if isinstance(self._row, tuple):
            return self._row[0]
        if isinstance(self._row, dict):
            return self._row.get("id")
        return None


class _OutboundDb:
    def __init__(self, conversa_row, inserted_message_id="message-id-1"):
        self.conversa_row = conversa_row
        self.inserted_message_id = inserted_message_id
        self.message_insert_params = None
        self.commits = 0
        self.calls = []

    def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        sql_lower = sql.lower()
        self.calls.append((sql, params))

        if "from public.crm_whatsapp_conversas c join public.crm_whatsapp_contatos ct" in sql_lower and "where c.id =" in sql_lower:
            return _OutboundResult(row=self.conversa_row)

        if "update public.crm_whatsapp_conversas" in sql_lower and "where id =" in sql_lower:
            return _OutboundResult()

        if "insert into public.crm_whatsapp_mensagens" in sql_lower:
            self.message_insert_params = params
            return _OutboundResult(scalar_value=self.inserted_message_id)

        if "insert into public.crm_whatsapp_midia" in sql_lower:
            return _OutboundResult(scalar_value=str(uuid.uuid4()))

        raise AssertionError(f"Unexpected SQL: {sql}")

    def commit(self):
        self.commits += 1


def _fake_canal(connection_status: str = "disconnected"):
    canal_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    instance_name = f"op7-{workspace_id.hex[:8]}-{canal_id.hex[:8]}"
    return SimpleNamespace(
        id=canal_id,
        workspace_id=workspace_id,
        tipo="whatsapp_evolution",
        nome="Canal WhatsApp",
        config={
            "evolution": {
                "instance_name": instance_name,
                "instance_id": "instance-id-1",
                "instance_token": "instance-token-1",
                "managed_by": "op7nexo",
                "created_by_connect_flow": True,
            }
        },
        mensagem_boas_vindas=None,
        webhook_token="webhook-token-1",
        status="inativo",
        numero_telefone=None,
        conectado_em=None,
        evolution_instance_id=instance_name,
        connection_status=connection_status,
    )


def _fake_canal_sem_instancia(nome: str = "Canal WhatsApp", connection_status: str = "disconnected"):
    canal_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    return SimpleNamespace(
        id=canal_id,
        workspace_id=workspace_id,
        tipo="whatsapp_evolution",
        nome=nome,
        config={},
        mensagem_boas_vindas=None,
        webhook_token="webhook-token-1",
        status="inativo",
        numero_telefone=None,
        conectado_em=None,
        evolution_instance_id=None,
        connection_status=connection_status,
    )


class CanaisEvolutionTests(unittest.TestCase):
    @patch("app.services.evolution.obter_instancia")
    def test_estado_conexao_usa_instance_all_quando_status_endpoints_nao_existem(self, mock_obter_instancia):
        responses = [
            _FakeResponse(404, {"message": "not found"}),
            _FakeResponse(404, {"message": "not found"}),
        ]
        calls = []

        class _ClientFactory:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self_inner):
                return _FakeHttpxClient(responses, calls)

            def __exit__(self_inner, exc_type, exc, tb):
                return False

        mock_obter_instancia.return_value = {
            "instance_name": "instance-name",
            "instance_id": "instance-id",
            "status": "open",
            "connected": True,
        }

        with patch("app.services.evolution.httpx.Client", _ClientFactory):
            result = evo_service.estado_conexao("instance-name", instance_id="instance-id", instance_token="token")

        self.assertEqual(result["state"], "open")
        self.assertTrue(result["connected"])
        mock_obter_instancia.assert_called_once_with("instance-name", instance_id="instance-id")

    def test_obter_qr_code_retry_ate_receber_payload_com_base64(self):
        responses = [
            _FakeResponse(404, {"message": "not ready"}),
            _FakeResponse(404, {"message": "not ready"}),
            _FakeResponse(200, {"data": {"Qrcode": _BASE64_QR_PNG}}),
        ]
        calls = []

        class _ClientFactory:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self_inner):
                return _FakeHttpxClient(responses, calls)

            def __exit__(self_inner, exc_type, exc, tb):
                return False

        with patch("app.services.evolution.httpx.Client", _ClientFactory), patch("app.services.evolution._time.sleep") as mock_sleep:
            result = evo_service.obter_qr_code("instance-name", instance_id="instance-id", instance_token="token", retries=2)

        self.assertEqual(result["qr_code"], f"data:image/png;base64,{_BASE64_QR_PNG}")
        self.assertEqual(result["base64"], result["qr_code"])
        self.assertEqual(result["status"], "READY")
        self.assertGreaterEqual(len(calls), 3)
        self.assertTrue(any("/instance/qr" in url for url, _ in calls))
        self.assertTrue(any("/instance/connect/instance-name" in url for url, _ in calls))
        mock_sleep.assert_called_once()

    def test_obter_qr_code_preserva_data_uri_em_qrcode(self):
        responses = [
            _FakeResponse(200, {"data": {"Qrcode": f"data:image/png;base64,{_BASE64_QR_PNG}"}}),
        ]
        calls = []

        class _ClientFactory:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self_inner):
                return _FakeHttpxClient(responses, calls)

            def __exit__(self_inner, exc_type, exc, tb):
                return False

        with patch("app.services.evolution.httpx.Client", _ClientFactory):
            result = evo_service.obter_qr_code("instance-name", instance_id="instance-id", instance_token="token", retries=1)

        self.assertEqual(result["qr_code"], f"data:image/png;base64,{_BASE64_QR_PNG}")
        self.assertEqual(result["base64"], result["qr_code"])
        self.assertEqual(result["status"], "READY")
        self.assertEqual(len(calls), 1)

    def test_obter_qr_code_reconhece_code_sem_tratar_como_imagem(self):
        responses = [_FakeResponse(200, {"data": {"Code": "123-456"}})]
        calls = []

        class _ClientFactory:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self_inner):
                return _FakeHttpxClient(responses, calls)

            def __exit__(self_inner, exc_type, exc, tb):
                return False

        with patch("app.services.evolution.httpx.Client", _ClientFactory):
            result = evo_service.obter_qr_code("instance-name", instance_id="instance-id", instance_token="token", retries=1)

        self.assertIsNone(result["qr_code"])
        self.assertIsNone(result["base64"])
        self.assertEqual(result["code"], "123-456")
        self.assertEqual(result["pairing_code"], "123-456")
        self.assertEqual(len(calls), 1)

    @patch("app.api.canais._get_canal_or_404")
    @patch("app.api.canais._exigir_admin_canal")
    @patch("app.api.canais._configurar_webhook_evolution")
    @patch("app.api.canais.evo_service.obter_qr_code")
    @patch("app.api.canais.evo_service.estado_conexao")
    @patch("app.api.canais.evo_service.criar_instancia")
    @patch("app.api.canais._instancia_evolution_exata")
    def test_conectar_canal_cria_instancia_gerenciada_e_retorna_qr_code(
        self,
        mock_instancia_exata,
        mock_criar_instancia,
        mock_estado_conexao,
        mock_obter_qr_code,
        mock_configurar_webhook,
        mock_exigir_admin,
        mock_get_canal,
    ):
        canal = _fake_canal_sem_instancia()
        db = _FakeDb()
        usuario = SimpleNamespace(role="platform_admin", id=uuid.uuid4())
        instance_name = f"op7-{canal.workspace_id.hex[:8]}-{canal.id.hex[:8]}"

        mock_get_canal.return_value = canal
        mock_instancia_exata.return_value = None
        mock_criar_instancia.return_value = {
            "instance_id": "instance-id-created",
            "instance_token": "instance-token-created",
        }
        mock_estado_conexao.return_value = {"state": "connecting", "instance": {"state": "connecting"}}
        mock_obter_qr_code.return_value = {
            "qr_code": f"data:image/png;base64,{_BASE64_QR_PNG}",
            "base64": f"data:image/png;base64,{_BASE64_QR_PNG}",
            "status": "READY",
            "raw": {"data": {"Qrcode": _BASE64_QR_PNG}},
        }
        mock_configurar_webhook.return_value = {
            "data": {
                "eventString": "evt-123",
                "webhookUrl": "https://api.op7franquia.com.br/webhook/evolution/webhook-token-1",
            }
        }

        resposta = canais.conectar_canal(canal.id, db=db, usuario=usuario)

        self.assertEqual(resposta.connection_status, "connecting")
        self.assertEqual(resposta.qr_code, f"data:image/png;base64,{_BASE64_QR_PNG}")
        self.assertIsNone(resposta.pairing_code)
        self.assertEqual(resposta.instance_id, "instance-id-created")
        self.assertEqual(db.commits, 2)
        self.assertEqual(canal.evolution_instance_id, instance_name)
        self.assertEqual(canal.config["evolution"]["managed_by"], "op7nexo")
        self.assertTrue(canal.config["evolution"]["created_by_connect_flow"])
        mock_instancia_exata.assert_called_once()
        mock_criar_instancia.assert_called_once()
        mock_configurar_webhook.assert_called_once_with(canal, db, forcar=True)
        mock_obter_qr_code.assert_called_once_with(
            instance_name,
            instance_id="instance-id-created",
            instance_token="instance-token-created",
            retries=4,
        )

    @patch("app.api.canais._get_canal_or_404")
    @patch("app.api.canais._exigir_admin_canal")
    @patch("app.api.canais._configurar_webhook_evolution")
    @patch("app.api.canais.evo_service.obter_qr_code")
    @patch("app.api.canais.evo_service.estado_conexao")
    @patch("app.api.canais.evo_service.criar_instancia")
    @patch("app.api.canais._instancia_evolution_exata")
    def test_conectar_canal_reaproveita_instancia_e_retorna_pairing_code(
        self,
        mock_instancia_exata,
        mock_criar_instancia,
        mock_estado_conexao,
        mock_obter_qr_code,
        mock_configurar_webhook,
        mock_exigir_admin,
        mock_get_canal,
    ):
        canal = _fake_canal()
        db = _FakeDb()
        usuario = SimpleNamespace(role="platform_admin", id=uuid.uuid4())

        mock_get_canal.return_value = canal
        mock_instancia_exata.return_value = {
            "instance_name": canal.config["evolution"]["instance_name"],
            "instance_id": canal.config["evolution"]["instance_id"],
            "instance_token": canal.config["evolution"]["instance_token"],
            "raw": {},
        }
        mock_estado_conexao.return_value = {"state": "connecting", "instance": {"state": "connecting"}}
        mock_obter_qr_code.return_value = {
            "code": "123-456",
            "pairing_code": "123-456",
            "status": "PAIRING_CODE",
            "raw": {"data": {"Code": "123-456"}},
        }
        mock_configurar_webhook.return_value = None

        resposta = canais.conectar_canal(canal.id, db=db, usuario=usuario)

        self.assertEqual(resposta.connection_status, "connecting")
        self.assertIsNone(resposta.qr_code)
        self.assertEqual(resposta.pairing_code, "123-456")
        self.assertEqual(resposta.instance_id, "instance-id-1")
        self.assertEqual(db.commits, 1)
        mock_criar_instancia.assert_not_called()
        mock_configurar_webhook.assert_called_once_with(canal, db, forcar=True)
        mock_obter_qr_code.assert_called_once_with(
            canal.config["evolution"]["instance_name"],
            instance_id="instance-id-1",
            instance_token="instance-token-1",
            retries=4,
        )

    @patch("app.api.canais._get_canal_or_404")
    @patch("app.api.canais._exigir_admin_canal")
    @patch("app.api.canais.evo_service.criar_instancia")
    @patch("app.api.canais._instancia_evolution_exata")
    def test_conectar_canal_protegido_nao_recria_instancia_legada(
        self,
        mock_instancia_exata,
        mock_criar_instancia,
        mock_exigir_admin,
        mock_get_canal,
    ):
        canal = _fake_canal_sem_instancia(nome="rudy_zap")
        db = _FakeDb()
        usuario = SimpleNamespace(role="platform_admin", id=uuid.uuid4())

        mock_get_canal.return_value = canal
        mock_instancia_exata.return_value = None

        with self.assertRaises(canais.HTTPException) as ctx:
            canais.conectar_canal(canal.id, db=db, usuario=usuario)

        self.assertEqual(ctx.exception.status_code, 409)
        mock_criar_instancia.assert_not_called()

    @patch("app.api.canais._get_canal_or_404")
    @patch("app.api.canais._exigir_admin_canal")
    @patch("app.api.canais.evo_service.estado_conexao")
    @patch("app.api.canais.evo_service.obter_qr_code")
    def test_status_evolution_inclui_pairing_code_em_conexao(
        self,
        mock_obter_qr_code,
        mock_estado_conexao,
        mock_exigir_admin,
        mock_get_canal,
    ):
        canal = _fake_canal(connection_status="connecting")
        db = _FakeDb()
        usuario = SimpleNamespace(role="platform_admin", id=uuid.uuid4())

        mock_get_canal.return_value = canal
        mock_estado_conexao.return_value = {"state": "connecting", "instance": {"state": "connecting"}}
        mock_obter_qr_code.return_value = {
            "code": "654-321",
            "pairing_code": "654-321",
            "status": "PAIRING_CODE",
            "raw": {"data": {"Code": "654-321"}},
        }

        resposta = canais.status_evolution(canal.id, db=db, usuario=usuario)

        self.assertEqual(resposta["connection_status"], "connecting")
        self.assertEqual(resposta["evolution_state"], "connecting")
        self.assertIsNone(resposta["qr_code"])
        self.assertEqual(resposta["pairing_code"], "654-321")
        self.assertEqual(db.commits, 1)
        mock_obter_qr_code.assert_called_once_with(
            canal.evolution_instance_id,
            instance_id="instance-id-1",
            instance_token="instance-token-1",
            retries=1,
        )

    @patch("app.api.canais.evo_service.configurar_webhook")
    def test_configurar_webhook_evolution_usa_url_publica_e_events_all(self, mock_configurar_webhook):
        canal = _fake_canal(connection_status="connected")
        canal.status = "ativo"
        db = _FakeDb()

        canais._configurar_webhook_evolution(canal, db)

        mock_configurar_webhook.assert_called_once()
        args, kwargs = mock_configurar_webhook.call_args
        self.assertEqual(args[0], canal.evolution_instance_id)
        self.assertEqual(
            args[1],
            f"{settings.SERVER_URL.rstrip('/')}/webhook/evolution/{canal.webhook_token}",
        )
        self.assertEqual(kwargs["instance_id"], "instance-id-1")
        self.assertEqual(kwargs["instance_token"], "instance-token-1")
        self.assertEqual(kwargs["subscribe"], ["ALL"])
        self.assertTrue(kwargs["immediate"])

    @patch("app.api.canais._configurar_webhook_evolution")
    def test_reaplicar_webhooks_evolution_ativos_processa_so_canais_ativos(self, mock_configurar_webhook):
        ativo = _fake_canal(connection_status="connected")
        ativo.status = "ativo"
        inativo = _fake_canal(connection_status="connected")
        inativo.status = "inativo"
        db = _ReapplyDb([ativo, inativo])

        total = canais.reaplicar_webhooks_evolution_ativos(db)

        self.assertEqual(total, 1)
        mock_configurar_webhook.assert_called_once_with(ativo, db)

    def test_enviar_mensagem_texto_usa_instance_token_como_apikey_sem_fallback_legacy(self):
        responses = [_FakeResponse(200, {"message": "success"})]
        calls = []

        class _ClientFactory:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self_inner):
                return _FakeHttpxClient(responses, calls)

            def __exit__(self_inner, exc_type, exc, tb):
                return False

        with patch("app.services.evolution.httpx.Client", _ClientFactory):
            result = evo_service.enviar_mensagem_texto(
                "instance-name",
                "554391673791",
                "teste",
                instance_id="instance-id-1",
                instance_token="instance-token-1",
            )

        self.assertEqual(result["message"], "success")
        self.assertEqual(len(calls), 1)
        url, headers, body = calls[0]
        self.assertTrue(url.endswith("/send/text"))
        self.assertEqual(headers["apikey"], "instance-token-1")
        self.assertEqual(headers["instanceId"], "instance-id-1")
        self.assertEqual(headers["instanceToken"], "instance-token-1")
        self.assertEqual(body["number"], "554391673791")

    def test_configurar_webhook_usa_instance_token_como_apikey_sem_fallback_legacy(self):
        responses = [_FakeResponse(200, {"status": "OK"})]
        calls = []

        class _ClientFactory:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self_inner):
                return _FakeHttpxClient(responses, calls)

            def __exit__(self_inner, exc_type, exc, tb):
                return False

        with patch("app.services.evolution.httpx.Client", _ClientFactory):
            result = evo_service.configurar_webhook(
                "instance-name",
                "https://api.op7franquia.com.br/webhook/evolution/token",
                instance_id="instance-id-1",
                instance_token="instance-token-1",
                subscribe=["ALL"],
                immediate=True,
            )

        self.assertEqual(result["status"], "OK")
        self.assertEqual(len(calls), 1)
        url, headers, body = calls[0]
        self.assertTrue(url.endswith("/instance/connect"))
        self.assertEqual(headers["apikey"], "instance-token-1")
        self.assertEqual(headers["instanceId"], "instance-id-1")
        self.assertEqual(headers["instanceToken"], "instance-token-1")
        self.assertEqual(body["webhookUrl"], "https://api.op7franquia.com.br/webhook/evolution/token")
        self.assertEqual(body["subscribe"], ["ALL"])
        self.assertTrue(body["immediate"])

    def test_enviar_mensagem_midia_e_template_usam_instance_token_como_apikey(self):
        responses = [
            _FakeResponse(200, {"media": "ok"}),
            _FakeResponse(200, {"template": "ok"}),
        ]
        calls = []

        class _ClientFactory:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self_inner):
                return _FakeHttpxClient(responses, calls)

            def __exit__(self_inner, exc_type, exc, tb):
                return False

        with patch("app.services.evolution.httpx.Client", _ClientFactory):
            media = evo_service.enviar_mensagem_midia(
                "instance-name",
                "554391673791",
                "image",
                "https://example.com/image.png",
                instance_id="instance-id-1",
                instance_token="instance-token-1",
            )
            template = evo_service.enviar_template_hsm(
                "instance-name",
                "554391673791",
                "hello",
                instance_id="instance-id-1",
                instance_token="instance-token-1",
            )

        self.assertEqual(media["media"], "ok")
        self.assertEqual(template["template"], "ok")
        self.assertEqual(calls[0][1]["apikey"], "instance-token-1")
        self.assertEqual(calls[1][1]["apikey"], "instance-token-1")

    def test_extract_evolution_message_id_reconhece_shapes_reais(self):
        cases = [
            ({"key": {"id": "key-id"}}, "key-id"),
            ({"message": {"key": {"id": "message-key-id"}}}, "message-key-id"),
            ({"data": {"Info": {"ID": "info-id"}}}, "info-id"),
            ({"id": "root-id"}, "root-id"),
            ({"messageId": "message-id"}, "message-id"),
        ]

        for payload, expected in cases:
            with self.subTest(payload=payload):
                self.assertEqual(evo_service.extract_evolution_message_id(payload), expected)

    @patch("app.api.canais.publish_whatsapp_event")
    @patch("app.api.canais._exigir_admin_canal")
    @patch("app.api.canais._get_canal_or_404")
    @patch("app.api.canais.evo_service.enviar_mensagem_texto")
    def test_enviar_mensagem_canal_persiste_evolution_msg_id_do_response_alternativo(
        self,
        mock_enviar_texto,
        mock_get_canal,
        mock_exigir_admin,
        mock_publish,
    ):
        canal = _fake_canal(connection_status="connected")
        canal.status = "ativo"
        conversa_id = uuid.uuid4()
        contato_id = uuid.uuid4()
        db = _OutboundDb(
            (
                str(conversa_id),
                str(contato_id),
                "554391996849@s.whatsapp.net",
                "554391996849",
                "554391996849@s.whatsapp.net",
            )
        )
        usuario = SimpleNamespace(role="platform_admin", nome="Agente Teste", email="agente@example.com")
        payload = canais.EnviarMensagemIn(conversa_id=str(conversa_id), texto="teste", tipo="texto")

        mock_get_canal.return_value = canal
        mock_enviar_texto.return_value = {"data": {"Info": {"ID": "text-id-123"}}}

        resultado = canais.enviar_mensagem_canal(canal.id, payload, db=db, usuario=usuario)

        self.assertTrue(resultado.ok)
        self.assertEqual(resultado.mensagem_id, "message-id-1")
        self.assertEqual(db.message_insert_params["evid"], "text-id-123")
        self.assertEqual(db.message_insert_params["msg"], "teste")
        self.assertEqual(db.message_insert_params["jid"], "554391996849@s.whatsapp.net")
        self.assertEqual(db.commits, 1)
        mock_publish.assert_called_once()

    @patch("app.api.canais.publish_whatsapp_event")
    @patch("app.api.canais._exigir_admin_canal")
    @patch("app.api.canais._get_canal_or_404")
    @patch("app.api.canais.evo_service.enviar_mensagem_midia")
    def test_enviar_mensagem_canal_media_tambem_persiste_evolution_msg_id(
        self,
        mock_enviar_midia,
        mock_get_canal,
        mock_exigir_admin,
        mock_publish,
    ):
        canal = _fake_canal(connection_status="connected")
        canal.status = "ativo"
        conversa_id = uuid.uuid4()
        contato_id = uuid.uuid4()
        db = _OutboundDb(
            (
                str(conversa_id),
                str(contato_id),
                "554391996849@s.whatsapp.net",
                "554391996849",
                "554391996849@s.whatsapp.net",
            )
        )
        usuario = SimpleNamespace(role="platform_admin", nome="Agente Teste", email="agente@example.com")
        payload = canais.EnviarMensagemIn(
            conversa_id=str(conversa_id),
            texto="imagem",
            tipo="image",
            media_url="https://example.com/foto.png",
            caption="Legenda",
        )

        mock_get_canal.return_value = canal
        mock_enviar_midia.return_value = {"message": {"key": {"id": "media-id-456"}}}

        resultado = canais.enviar_mensagem_canal(canal.id, payload, db=db, usuario=usuario)

        self.assertTrue(resultado.ok)
        self.assertEqual(resultado.mensagem_id, "message-id-1")
        self.assertEqual(db.message_insert_params["evid"], "media-id-456")
        self.assertEqual(db.message_insert_params["msg"], "imagem")
        self.assertEqual(db.message_insert_params["jid"], "554391996849@s.whatsapp.net")
        self.assertEqual(db.commits, 1)
        mock_publish.assert_called_once()

    @patch("app.api.canais.publish_whatsapp_event")
    @patch("app.api.canais._exigir_admin_canal")
    @patch("app.api.canais._get_canal_or_404")
    @patch("app.api.canais.waha_service.enviar_mensagem_voz")
    @patch("app.services.object_storage.get_minio_client")
    def test_enviar_mensagem_canal_audio_waha_usa_send_voice(
        self,
        mock_get_minio_client,
        mock_enviar_voz,
        mock_get_canal,
        mock_exigir_admin,
        mock_publish,
    ):
        canal_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        canal = SimpleNamespace(
            id=canal_id,
            workspace_id=workspace_id,
            tipo="whatsapp_waha",
            nome="Canal WAHA",
            config={
                "waha": {
                    "session": "op7-waha",
                    "api_base_url": "http://waha:3000",
                    "api_key_ref": "WAHA_API_KEY",
                }
            },
            mensagem_boas_vindas=None,
            webhook_token="webhook-token-1",
            status="ativo",
            numero_telefone=None,
            conectado_em=None,
            evolution_instance_id=None,
            connection_status="connected",
        )
        conversa_id = uuid.uuid4()
        contato_id = uuid.uuid4()
        db = _OutboundDb(
            (
                str(conversa_id),
                str(contato_id),
                "554391996849@s.whatsapp.net",
                "554391996849",
                "554391996849@s.whatsapp.net",
            )
        )
        usuario = SimpleNamespace(role="platform_admin", nome="Agente Teste", email="agente@example.com")

        class _FakeStat:
            size = 2048
            content_type = "audio/webm"

        class _FakeMinioClient:
            def stat_object(self, bucket, object_key):
                self.bucket = bucket
                self.object_key = object_key
                return _FakeStat()

            def presigned_get_object(self, bucket, object_key, expires):
                self.bucket = bucket
                self.object_key = object_key
                self.expires = expires
                return "http://minio:9000/whatsapp-media/voice.webm"

        mock_get_minio_client.return_value = _FakeMinioClient()
        mock_get_canal.return_value = canal
        mock_enviar_voz.return_value = {"id": "voice-id-789"}
        payload = canais.EnviarMensagemIn(
            conversa_id=str(conversa_id),
            texto="",
            tipo="audio",
            media_url="https://api.op7franquia.com.br/meta/storage/whatsapp-media/voice.webm",
        )

        resultado = canais.enviar_mensagem_canal(canal.id, payload, db=db, usuario=usuario)

        self.assertTrue(resultado.ok)
        self.assertEqual(resultado.mensagem_id, "message-id-1")
        self.assertEqual(db.message_insert_params["evid"], "voice-id-789")
        self.assertEqual(db.message_insert_params["mt"], "audioMessage")
        self.assertEqual(db.message_insert_params["msg"], "[mídia]")
        self.assertEqual(db.message_insert_params["ms"], "ready")
        self.assertEqual(db.commits, 1)
        mock_publish.assert_called_once()
        mock_enviar_voz.assert_called_once()
        _, kwargs = mock_enviar_voz.call_args
        self.assertEqual(kwargs["media_url"], "http://minio:9000/whatsapp-media/voice.webm")
        self.assertEqual(kwargs["mimetype"], "audio/webm")
        self.assertEqual(kwargs["filename"], "voice.webm")


if __name__ == "__main__":
    unittest.main()
