import unittest
from unittest.mock import patch

from app.core.config import settings
from app.services.object_storage import public_url, reescrever_carousel_urls, resolve_creative_image_url_hq
from app.services.meta_sync import (
    _campanhas_publicos_relevantes,
    _carregar_objetivos_catalogo,
    _carregar_hq_cache_imagens,
    _merge_hq_image_data,
    _meta_erro_terminal,
    _resolver_mapa_adimages_hq,
    _fetch_videos_by_ids,
    _sync_catalog_anuncios_criativos_videos,
    _sync_video_metrics,
    MetaContaInacessivelError,
    registrar_rate_limit_cooldown,
    sincronizar_conta,
)
from app.services.meta_graph import MetaGraphClient, MetaRateLimitError
from scripts.repair_meta_creative_image_urls import _build_candidates


class _MappingResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def fetchall(self):
        return self._rows

    def scalar(self):
        if not self._rows:
            return None
        first = self._rows[0]
        if isinstance(first, tuple):
            return first[0]
        return first


class _FakeDbWithRows:
    def __init__(self, rows):
        self._rows = rows
        self.calls = []

    def execute(self, stmt, params=None):
        self.calls.append((stmt, params))
        return _MappingResult(self._rows)


class _FakeDbByQuery:
    def __init__(self, rows_by_query):
        self.rows_by_query = rows_by_query
        self.calls = []

    def execute(self, stmt, params=None):
        sql = str(stmt)
        self.calls.append((sql, params))
        for needle, rows in self.rows_by_query.items():
            if needle in sql:
                return _MappingResult(rows)
        return _MappingResult([])


class _FakeDb:
    def __init__(self):
        self.calls = []
        self.commits = 0

    def execute(self, stmt, params=None):
        self.calls.append((stmt, params))
        return None

    def commit(self):
        self.commits += 1


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None, text: str = "", headers: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text
        self.headers = headers or {}
        self.content = b""

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, responses: list[_FakeResponse]):
        self.responses = list(responses)
        self.calls: list[tuple[str, dict | None]] = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url, params=None, follow_redirects=False, timeout=None, headers=None):
        self.calls.append((url, params))
        if not self.responses:
            raise AssertionError("Unexpected request")
        return self.responses.pop(0)


class _FakeContaSync:
    def __init__(self):
        self.id = "uuid-1"
        self.workspace_id = "workspace-1"
        self.account_id = "act_1"
        self.account_name = "Conta teste"
        self.meta_account_name = None
        self.balance = None
        self.amount_spent = None
        self.spend_cap = None
        self.config = {}
        self.status = "ativo"
        self.sync_paused = False
        self.bm_token = "token"
        self.token_expira_em = None
        self.account_status = 1
        self.periodo_sync_inicio = None


class _FakeDbSync:
    def __init__(self, conta):
        self.conta = conta
        self.commits = 0
        self.rollbacks = 0
        self.calls = []

    def get(self, model, key):
        return self.conta

    def execute(self, stmt, params=None):
        self.calls.append((stmt, params))
        sql = str(stmt)
        if "pg_try_advisory_lock" in sql:
            return _MappingResult([(True,)])
        if "pg_advisory_unlock" in sql:
            return _MappingResult([(True,)])
        return _MappingResult([])

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class _FakeContaConfig:
    def __init__(self):
        self.config = {"existing": {"keep": True}, "meta_sync": {"previous": "value"}}


class MetaSyncTests(unittest.TestCase):
    def test_fetch_videos_by_ids_top_level_permission_error_tenta_fallback_sem_source(self):
        responses = [
            _FakeResponse(
                400,
                {"error": {"message": "Application does not have permission for this action", "code": 10}},
                text="permission",
            ),
            _FakeResponse(
                200,
                {"video-1": {"id": "video-1", "picture": "https://cdn.example.com/thumb.jpg"}},
            ),
        ]
        client = _FakeClient(responses)
        totais = {"catalog_videos_ignorados_permissao": 0}

        result = _fetch_videos_by_ids(client, "token", ["video-1"], totais=totais)

        self.assertIn("video-1", result)
        self.assertEqual(result["video-1"]["thumbnail_url"], "https://cdn.example.com/thumb.jpg")
        self.assertEqual(totais["catalog_videos_ignorados_permissao"], 0)
        self.assertEqual(len(client.calls), 2)
        self.assertIn("source", client.calls[0][1]["fields"])
        self.assertNotIn("source", client.calls[1][1]["fields"])

    def test_fetch_videos_by_ids_permission_error_por_id_preserva_sucessos(self):
        permission_error = {
            "error": {
                "message": "Application does not have permission for this action",
                "code": 10,
            }
        }
        responses = [
            _FakeResponse(
                200,
                {
                    "video-1": {"id": "video-1", "picture": "https://cdn.example.com/v1.jpg"},
                    "video-2": permission_error,
                    "video-3": {"id": "video-3", "picture": "https://cdn.example.com/v3.jpg"},
                },
            ),
            _FakeResponse(
                200,
                {"video-2": {"id": "video-2", "picture": "https://cdn.example.com/v2.jpg"}},
            ),
        ]
        client = _FakeClient(responses)
        totais = {"catalog_videos_ignorados_permissao": 0}

        result = _fetch_videos_by_ids(client, "token", ["video-1", "video-2", "video-3"], totais=totais)

        self.assertEqual(set(result.keys()), {"video-1", "video-2", "video-3"})
        self.assertEqual(totais["catalog_videos_ignorados_permissao"], 0)
        self.assertEqual(client.calls[1][1]["ids"], "video-2")
        self.assertNotIn("source", client.calls[1][1]["fields"])

    def test_fetch_videos_by_ids_permission_error_por_id_conta_apenas_falhas(self):
        permission_error = {
            "error": {
                "message": "Application does not have permission for this action",
                "code": 10,
            }
        }
        responses = [
            _FakeResponse(
                200,
                {
                    "video-1": {"id": "video-1", "picture": "https://cdn.example.com/v1.jpg"},
                    "video-2": permission_error,
                    "video-3": {"id": "video-3", "picture": "https://cdn.example.com/v3.jpg"},
                },
            ),
            _FakeResponse(200, {"video-2": permission_error}),
        ]
        client = _FakeClient(responses)
        totais = {"catalog_videos_ignorados_permissao": 0}

        result = _fetch_videos_by_ids(client, "token", ["video-1", "video-2", "video-3"], totais=totais)

        self.assertEqual(set(result.keys()), {"video-1", "video-3"})
        self.assertEqual(totais["catalog_videos_ignorados_permissao"], 1)
        self.assertTrue(totais["videos_permission_skipped"])
        self.assertEqual(totais["videos_permission_error_count"], 1)
        self.assertEqual(totais["videos_permission_error_code"], 10)

    def test_fetch_videos_by_ids_fallback_top_level_permission_conta_batch_fallback(self):
        responses = [
            _FakeResponse(
                400,
                {"error": {"message": "Application does not have permission for this action", "code": 10}},
            ),
            _FakeResponse(
                400,
                {"error": {"message": "Application does not have permission for this action", "code": 10}},
            ),
        ]
        client = _FakeClient(responses)
        totais = {"catalog_videos_ignorados_permissao": 0}

        result = _fetch_videos_by_ids(client, "token", ["video-1", "video-2"], totais=totais)

        self.assertEqual(result, {})
        self.assertEqual(totais["catalog_videos_ignorados_permissao"], 2)
        self.assertEqual(totais["videos_permission_error_count"], 2)
        self.assertNotIn("source", client.calls[1][1]["fields"])

    @patch("app.services.meta_sync._persist_hq_images_to_minio")
    @patch("app.services.meta_sync._aplicar_thumbnail_hq")
    @patch("app.services.meta_sync._resolver_mapa_adimages_hq", return_value={})
    @patch("app.services.meta_sync._fetch_criativos_batch")
    @patch("app.services.meta_sync._paginar")
    @patch("app.services.meta_sync._fetch_videos_by_ids", side_effect=RuntimeError("optional video failure"))
    def test_sync_catalog_anuncios_criativos_videos_nao_falha_por_video_opcional(
        self,
        mock_fetch_videos,
        mock_paginar,
        mock_fetch_criativos,
        _mock_adimages,
        _mock_thumb,
        _mock_minio,
    ):
        mock_paginar.return_value = [{
            "id": "ad-1",
            "name": "Ad 1",
            "campaign_id": "camp-1",
            "adset_id": "adset-1",
            "effective_status": "ACTIVE",
            "status": "ACTIVE",
        }]
        mock_fetch_criativos.return_value = {
            "ad-1": {
                "id": "creative-1",
                "tipo": "VIDEO",
                "video_id": "video-1",
                "thumbnail_url": "https://cdn.example.com/thumb.jpg",
            }
        }
        conta = _FakeContaSync()
        db = _FakeDb()
        totais = {
            "catalog_campanhas": 0,
            "catalog_conjuntos": 0,
            "catalog_anuncios": 0,
            "catalog_criativos": 0,
            "catalog_videos": 0,
            "catalog_videos_ignorados_permissao": 0,
            "diarios": 0,
            "campanhas": 0,
            "anuncios": 0,
            "publicos": 0,
            "publicos_campanhas_processadas": 0,
            "publicos_campanhas_puladas": 0,
        }

        _sync_catalog_anuncios_criativos_videos(db=db, client=object(), conta=conta, account_id="act_1", token="token", totais=totais)

        mock_fetch_videos.assert_called_once()
        self.assertEqual(db.commits, 1)

    def test_meta_code_10_em_etapa_essencial_continua_terminal(self):
        response = _FakeResponse(
            400,
            {"error": {"message": "Application does not have permission for this action", "code": 10}},
            text="Application does not have permission for this action",
        )

        terminal, _ = _meta_erro_terminal(response)

        self.assertTrue(terminal)

    def test_carregar_objetivos_catalogo_usa_coluna_objetivo(self):
        rows = [{"campaign_id": "camp-1", "objetivo": "OUTCOME_TRAFFIC"}]
        db = _FakeDbWithRows(rows)

        result = _carregar_objetivos_catalogo(db, "uuid-1")

        self.assertEqual(result, rows)
        self.assertEqual(len(db.calls), 1)
        stmt, params = db.calls[0]
        sql = str(stmt)
        self.assertIn("MAX(objetivo) AS objetivo", sql)
        self.assertNotIn("MAX(objective)", sql)
        self.assertEqual(params, {"ads_account_id": "uuid-1"})

    @patch("app.services.meta_sync._fetch_criativos_batch")
    @patch("app.services.meta_sync._paginar")
    def test_sync_video_metrics_omite_video_3_sec_e_grava_zero(self, mock_paginar, mock_fetch_criativos):
        mock_fetch_criativos.return_value = {"ad-1": {"video_id": "video-1"}}
        paginar_calls = []

        def paginar_side_effect(client, url, params):
            paginar_calls.append((url, params))
            if url.endswith("/ads"):
                return [{"id": "ad-1"}]
            if url.endswith("/insights"):
                return [{
                    "ad_id": "ad-1",
                    "date_start": "2026-05-18",
                    "video_play_actions": [{"value": "2"}],
                    "video_avg_time_watched_actions": [{"value": "3"}],
                    "video_30_sec_watched_actions": [{"value": "4"}],
                    "video_p25_watched_actions": [{"value": "5"}],
                    "video_p50_watched_actions": [{"value": "6"}],
                    "video_p75_watched_actions": [{"value": "7"}],
                    "video_p95_watched_actions": [{"value": "8"}],
                    "video_p100_watched_actions": [{"value": "9"}],
                    "video_thruplay_watched_actions": [{"value": "10"}],
                    "actions": [{"action_type": "video_view", "value": "11"}],
                }]
            raise AssertionError(f"Unexpected URL {url}")

        mock_paginar.side_effect = paginar_side_effect

        db = _FakeDb()
        _sync_video_metrics(object(), db, "act_1", "token", "{\"since\":\"2026-05-01\",\"until\":\"2026-05-18\"}", "uuid-1")

        self.assertEqual(len(paginar_calls), 2)
        self.assertTrue(paginar_calls[0][0].endswith("/ads"))
        self.assertTrue(paginar_calls[1][0].endswith("/insights"))
        self.assertNotIn("video_3_sec_watched_actions", paginar_calls[1][1]["fields"])
        self.assertEqual(db.commits, 1)
        self.assertEqual(len(db.calls), 1)
        _, params = db.calls[0]
        self.assertEqual(params["video_views"], 11)
        self.assertEqual(params["video_play_actions"], 2)
        self.assertEqual(params["video_complete_watched_actions"], 4)
        self.assertEqual(params["thruplay"], 10)
        self.assertEqual(params["video_3_sec"], 0)

    @patch("app.services.meta_sync._fetch_adimages_by_hashes")
    def test_resolver_mapa_adimages_hq_reaproveita_cache_e_pula_hashes_ja_resolvidos(self, mock_fetch):
        db = _FakeDbByQuery({
            "FROM meta_creatives_catalog": [{
                "image_hash": "hash-1",
                "image_url_hq": "https://api.op7franquia.com.br/meta/storage/criativos-meta/ads-accounts/uuid-1/criativos/creative-1.jpg",
                "meta_image_url_tmp": None,
                "meta_permalink_url": None,
                "original_width": 1200,
                "original_height": 628,
                "hq_source": "adimage_minio",
            }],
            "FROM meta_creative_cards_catalog": [],
        })
        mock_fetch.return_value = {
            "hash-2": {
                "hash": "hash-2",
                "url": "https://graph.facebook.com/mock.jpg",
                "hq_source": "adimage",
                "meta_image_url_tmp": "https://graph.facebook.com/mock.jpg",
            }
        }

        result = _resolver_mapa_adimages_hq(
            object(),
            db,
            "act_1",
            "token",
            ["hash-1", "hash-2"],
            "uuid-1",
        )

        self.assertEqual(mock_fetch.call_args.args[3], ["hash-2"])
        self.assertEqual(result["hash-1"]["hq_source"], "adimage_minio")
        self.assertEqual(result["hash-2"]["hq_source"], "adimage")

    @patch("app.services.meta_sync._fetch_adimages_by_hashes")
    def test_resolver_mapa_adimages_hq_ignora_cache_legado_storage_assinado(self, mock_fetch):
        db = _FakeDbByQuery({
            "FROM meta_creatives_catalog": [
                {
                    "image_hash": "hash-1",
                    "image_url_hq": "https://api.op7franquia.com.br/meta/storage-assinado?token=redacted",
                    "meta_image_url_tmp": None,
                    "meta_permalink_url": None,
                    "original_width": 1200,
                    "original_height": 628,
                    "hq_source": "adimage_minio",
                },
                {
                    "image_hash": "hash-2",
                    "image_url_hq": "https://api.op7franquia.com.br/meta/storage/criativos-meta/ads-accounts/uuid-1/criativos/creative-2.jpg",
                    "meta_image_url_tmp": None,
                    "meta_permalink_url": None,
                    "original_width": 1200,
                    "original_height": 628,
                    "hq_source": "adimage_minio",
                },
            ],
            "FROM meta_creative_cards_catalog": [],
        })
        mock_fetch.return_value = {}

        result = _resolver_mapa_adimages_hq(
            object(),
            db,
            "act_1",
            "token",
            ["hash-1", "hash-2", "hash-3"],
            "uuid-1",
        )

        self.assertEqual(mock_fetch.call_args.args[3], ["hash-1", "hash-3"])
        self.assertEqual(result["hash-2"]["image_url_hq"], "https://api.op7franquia.com.br/meta/storage/criativos-meta/ads-accounts/uuid-1/criativos/creative-2.jpg")

    def test_resolve_creative_image_url_hq_reescreve_legado_quando_objeto_existe(self):
        with patch("app.services.object_storage.stat_object") as mock_stat:
            mock_stat.return_value = object()
            url = resolve_creative_image_url_hq(
                "https://api.op7franquia.com.br/meta/storage-assinado?token=redacted",
                "uuid-1",
                "creative-1",
            )

        expected = public_url(
            settings.MINIO_BUCKET_CRIATIVOS,
            "ads-accounts/uuid-1/criativos/creative-1.jpg",
        )
        self.assertEqual(url, expected)

    def test_resolve_creative_image_url_hq_retorna_none_quando_objeto_ausente(self):
        with patch("app.services.object_storage.stat_object", side_effect=RuntimeError("missing")):
            url = resolve_creative_image_url_hq(
                "https://api.op7franquia.com.br/meta/storage-assinado?token=redacted",
                "uuid-1",
                "creative-1",
            )

        self.assertIsNone(url)

    def test_repair_script_ignora_registro_sem_objeto_no_minio(self):
        rows = [
            {
                "creative_id": "creative-1",
                "ads_account_id": "uuid-1",
                "image_url_hq": "https://api.op7franquia.com.br/meta/storage-assinado?token=redacted",
                "hq_source": "adimage_minio",
                "updated_at": "2026-06-03T12:00:00+00:00",
            },
            {
                "creative_id": "creative-2",
                "ads_account_id": "uuid-1",
                "image_url_hq": "https://api.op7franquia.com.br/meta/storage-assinado?token=redacted",
                "hq_source": "adimage_minio",
                "updated_at": "2026-06-03T12:00:00+00:00",
            },
        ]

        def stat_side_effect(bucket, object_name):
            if object_name.endswith("creative-1.jpg"):
                return type("Stat", (), {"size": 123, "content_type": "image/jpeg"})()
            raise RuntimeError("missing")

        with patch("scripts.repair_meta_creative_image_urls.stat_object", side_effect=stat_side_effect):
            candidates, missing = _build_candidates(rows, settings.MINIO_BUCKET_CRIATIVOS)

        self.assertEqual(len(candidates), 1)
        self.assertEqual(len(missing), 1)
        self.assertEqual(candidates[0]["creative_id"], "creative-1")
        self.assertEqual(candidates[0]["new_image_url_hq"], public_url(
            settings.MINIO_BUCKET_CRIATIVOS,
            "ads-accounts/uuid-1/criativos/creative-1.jpg",
        ))

    def test_merge_hq_image_data_preserva_cache_minio_e_nao_rebaixa_para_thumbnail(self):
        creative = {
            "image_hashes": ["hash-1"],
            "hq_source": "thumbnail_fallback",
        }
        adimage_map = {
            "hash-1": {
                "hash": "hash-1",
                "url": "https://api.op7franquia.com.br/meta/storage/criativos-meta/ads-accounts/uuid-1/criativos/creative-1.jpg",
                "hq_source": "adimage_minio",
                "original_width": 1200,
                "original_height": 628,
            }
        }

        _merge_hq_image_data(creative, adimage_map)

        self.assertEqual(creative["hq_source"], "adimage_minio")
        self.assertEqual(creative["image_url_hq"], adimage_map["hash-1"]["url"])
        self.assertIsNone(creative.get("meta_image_url_tmp"))

    def test_reescrever_carousel_urls_retorna_picture_e_image_url_hq_estaveis(self):
        items = [
            {
                "card_index": 0,
                "picture": "https://fbcdn.example.com/card-0.jpg",
                "image_url_hq": "https://fbcdn.example.com/card-0-hq.jpg",
            },
            {
                "card_index": 1,
                "picture": "https://fbcdn.example.com/card-1.jpg",
            },
        ]

        result = reescrever_carousel_urls(items, "uuid-1", "creative-1")
        expected_0 = public_url(
            settings.MINIO_BUCKET_CRIATIVOS,
            "ads-accounts/uuid-1/criativos/creative-1_card_0.jpg",
        )
        expected_1 = public_url(
            settings.MINIO_BUCKET_CRIATIVOS,
            "ads-accounts/uuid-1/criativos/creative-1_card_1.jpg",
        )

        self.assertEqual(result[0]["image_url_hq"], expected_0)
        self.assertEqual(result[0]["picture"], expected_0)
        self.assertEqual(result[1]["image_url_hq"], expected_1)
        self.assertEqual(result[1]["picture"], expected_1)

    def test_fetch_videos_by_ids_retorna_parcial_e_contabiliza_permissao(self):
        responses = [
            _FakeResponse(
                200,
                {
                    f"v{i}": {
                        "id": f"v{i}",
                        "picture": f"https://cdn.example.com/v{i}.jpg",
                        "thumbnails": [{"uri": f"https://cdn.example.com/v{i}-hq.jpg", "width": 1200, "height": 628, "is_preferred": True}],
                    }
                    for i in range(50)
                },
            ),
            _FakeResponse(
                400,
                {"error": {"message": "Application does not have permission for this action", "code": 10}},
                text="Application does not have permission for this action",
            ),
            _FakeResponse(
                400,
                {"error": {"message": "Application does not have permission for this action", "code": 10}},
                text="Application does not have permission for this action",
            ),
        ]
        client = _FakeClient(responses)
        totais = {"catalog_videos_ignorados_permissao": 0}

        result = _fetch_videos_by_ids(client, "token", [f"v{i}" for i in range(51)], totais=totais)

        self.assertEqual(len(result), 50)
        self.assertEqual(totais["catalog_videos_ignorados_permissao"], 1)
        self.assertEqual(result["v0"]["thumbnail_url"], "https://cdn.example.com/v0-hq.jpg")

    def test_sincronizar_conta_mantem_error_terminal_em_saldo(self):
        conta = _FakeContaSync()
        db = _FakeDbSync(conta)
        response = _FakeResponse(
            400,
            {"error": {"message": "Application does not have permission for this action", "code": 10}},
            text="Application does not have permission for this action",
        )
        client = _FakeClient([response])

        with patch("app.services.meta_sync.httpx.Client", return_value=client):
            with self.assertRaises(MetaContaInacessivelError):
                sincronizar_conta("uuid-1", db)

    def test_rate_limit_nao_e_terminal(self):
        resp = _FakeResponse(
            400,
            {"error": {"message": "User request limit reached", "code": 17}},
            text="User request limit reached",
        )

        terminal, _ = _meta_erro_terminal(resp)

        self.assertFalse(terminal)

    def test_meta_graph_client_retry_rate_limit_com_backoff(self):
        responses = [
            _FakeResponse(400, {"error": {"message": "too many calls", "code": 17}}, text="too many calls"),
            _FakeResponse(200, {"data": []}),
        ]
        raw_client = _FakeClient(responses)
        sleeps = []
        graph = MetaGraphClient(raw_client, sleep=sleeps.append)

        resp = graph.get("https://graph.facebook.com/v21.0/act_1/insights", params={"access_token": "secret"})

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(graph.rate_limit_retries, 1)
        self.assertEqual(len(sleeps), 1)
        self.assertGreaterEqual(sleeps[0], 30)

    def test_meta_graph_client_header_alto_gera_cooldown_antes_da_proxima_chamada(self):
        responses = [
            _FakeResponse(
                200,
                {"data": []},
                headers={"x-app-usage": '{"call_count": 85, "total_cputime": 10, "total_time": 10}'},
            ),
            _FakeResponse(200, {"data": []}),
        ]
        raw_client = _FakeClient(responses)
        sleeps = []
        graph = MetaGraphClient(raw_client, sleep=sleeps.append)

        graph.get("https://graph.facebook.com/v21.0/act_1/campaigns", params={"access_token": "secret"})
        graph.get("https://graph.facebook.com/v21.0/act_1/adsets", params={"access_token": "secret"})

        self.assertEqual(graph.last_usage_percent, 85)
        self.assertEqual(len(sleeps), 1)
        self.assertGreaterEqual(sleeps[0], 30)

    def test_meta_graph_client_rate_limit_persistente_levanta_erro_temporario(self):
        raw_client = _FakeClient([
            _FakeResponse(429, {"error": {"message": "Application request limit", "code": 4}}, text="Application request limit")
            for _ in range(6)
        ])
        sleeps = []
        graph = MetaGraphClient(raw_client, sleep=sleeps.append)

        with self.assertRaises(MetaRateLimitError):
            graph.get("https://graph.facebook.com/v21.0/act_1/insights", params={"access_token": "secret"})

        self.assertEqual(graph.rate_limit_retries, 5)

    def test_registrar_rate_limit_cooldown_preserva_config_existente(self):
        conta = _FakeContaConfig()
        db = _FakeDb()
        exc = MetaRateLimitError(
            "limit",
            endpoint="/v21.0/act_1/insights",
            error_code=17,
            cooldown_seconds=60,
            usage_percent=96,
        )

        cooldown_until = registrar_rate_limit_cooldown(db, conta, exc)

        self.assertEqual(conta.config["existing"], {"keep": True})
        self.assertEqual(conta.config["meta_sync"]["previous"], "value")
        self.assertEqual(conta.config["meta_sync"]["cooldown_reason"], "rate_limited")
        self.assertEqual(conta.config["meta_sync"]["last_rate_limit_error_code"], 17)
        self.assertEqual(db.commits, 1)
        self.assertIsNotNone(cooldown_until)

    def test_campanhas_publicos_relevantes_respeita_limite(self):
        rows = [(f"camp-{i}",) for i in range(3)]
        db = _FakeDbWithRows(rows)

        result = _campanhas_publicos_relevantes(db, "uuid-1", limit=3)

        self.assertEqual(result, ["camp-0", "camp-1", "camp-2"])
        _, params = db.calls[0]
        self.assertEqual(params["limit"], 3)

    def test_logs_meta_graph_nao_expoem_token(self):
        raw_client = _FakeClient([
            _FakeResponse(400, {"error": {"message": "too many calls", "code": 17}}, text="too many calls"),
            _FakeResponse(200, {"data": []}),
        ])
        graph = MetaGraphClient(raw_client, sleep=lambda _: None)

        with self.assertLogs("app.services.meta_graph", level="WARNING") as logs:
            graph.get("https://graph.facebook.com/v21.0/act_1/insights", params={"access_token": "secret-token"})

        output = "\n".join(logs.output)
        self.assertNotIn("secret-token", output)


if __name__ == "__main__":
    unittest.main()
