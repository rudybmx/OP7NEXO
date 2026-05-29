import uuid
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.api import canais
from app.core.config import settings
from app.services import evolution as evo_service


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


def _fake_canal(connection_status: str = "disconnected"):
    canal_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    instance_name = f"op7-{workspace_id}-{canal_id}"
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
            _FakeResponse(200, {"base64": "abc123"}),
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

        self.assertEqual(result["base64"], "abc123")
        self.assertGreaterEqual(len(calls), 3)
        self.assertTrue(any("/instance/qr" in url for url, _ in calls))
        self.assertTrue(any("/instance/connect/instance-name" in url for url, _ in calls))
        mock_sleep.assert_called_once()

    @patch("app.api.canais._get_canal_or_404")
    @patch("app.api.canais._exigir_admin_canal")
    @patch("app.api.canais.evo_service.conectar_instancia")
    @patch("app.api.canais.evo_service.estado_conexao")
    @patch("app.api.canais.evo_service.obter_qr_code")
    def test_conectar_canal_retorna_qr_code_quando_evolution_ainda_estah_connecting(
        self,
        mock_obter_qr_code,
        mock_estado_conexao,
        mock_conectar_instancia,
        mock_exigir_admin,
        mock_get_canal,
    ):
        canal = _fake_canal()
        db = _FakeDb()
        usuario = SimpleNamespace(role="platform_admin", id=uuid.uuid4())

        mock_get_canal.return_value = canal
        mock_conectar_instancia.return_value = {"status": "OK"}
        mock_estado_conexao.return_value = {"state": "connecting", "instance": {"state": "connecting"}}
        mock_obter_qr_code.return_value = {"base64": "abc123"}

        resposta = canais.conectar_canal(canal.id, db=db, usuario=usuario)

        self.assertEqual(resposta.connection_status, "connecting")
        self.assertEqual(resposta.qr_code, "abc123")
        self.assertEqual(db.commits, 1)
        mock_conectar_instancia.assert_called_once()
        mock_obter_qr_code.assert_called_once_with(
            canal.evolution_instance_id,
            instance_id="instance-id-1",
            instance_token="instance-token-1",
            retries=4,
        )

    @patch("app.api.canais._get_canal_or_404")
    @patch("app.api.canais._exigir_admin_canal")
    @patch("app.api.canais.evo_service.estado_conexao")
    @patch("app.api.canais.evo_service.obter_qr_code")
    def test_status_evolution_inclui_qr_code_em_conexao(
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
        mock_obter_qr_code.return_value = {"base64": "abc123"}

        resposta = canais.status_evolution(canal.id, db=db, usuario=usuario)

        self.assertEqual(resposta["connection_status"], "connecting")
        self.assertEqual(resposta["evolution_state"], "connecting")
        self.assertEqual(resposta["qr_code"], "abc123")
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


if __name__ == "__main__":
    unittest.main()
