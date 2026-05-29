import unittest
from unittest.mock import patch

from app.core.config import settings
from app.services.object_storage import public_url, reescrever_carousel_urls
from app.services.meta_sync import (
    _carregar_objetivos_catalogo,
    _merge_hq_image_data,
    _resolver_mapa_adimages_hq,
    _fetch_videos_by_ids,
    _sync_video_metrics,
    MetaContaInacessivelError,
    sincronizar_conta,
)


class _MappingResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows


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
    def __init__(self, status_code: int, payload: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

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
        return _MappingResult([])

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class MetaSyncTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
