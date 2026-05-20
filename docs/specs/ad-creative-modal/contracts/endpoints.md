# Contrato — Endpoint de Detalhe do AdCreativeModal

Read-only. Agrega tudo do modal em 1 chamada. **Duas rotas servem o mesmo handler** (`anuncio_detalhe`):

- **Primária (usada pelo front):** `GET /meta/insights/anuncios/{ad_id}` (`meta_insights.py:2505`, `anuncio_detalhe_por_ad_id` → delega).
- **Legacy / fallback:** `GET /meta/insights/anuncio-detalhe?lookup_id=...` (`:1962`). O front (`ad-creative-detail.ts:149-150`) tenta a primária e cai na legacy em caso de falha.

Payload idêntico nas duas. Diferença é só a forma de passar o id (path vs query `lookup_id`).

## Request

```
GET /meta/insights/anuncios/{ad_id}        # primária
GET /meta/insights/anuncio-detalhe         # legacy (lookup_id na query)
Authorization: Bearer <token>
```

Query params:

| Param | Tipo | Obrigatório | Default | Notas |
|-------|------|-------------|---------|-------|
| `lookup_id` | string | sim | — | ad_id ou creative_id |
| `lookup_type` | enum(`ad`,`creative`) | não | `ad` | outro valor → 400 |
| `workspace_id` | uuid | não | workspace padrão do usuário | malformado → 400; sem acesso → 403 |
| `data_inicio` | date | não | `data_fim - 29d` | |
| `data_fim` | date | não | hoje | |
| `conta_ids` | CSV de uuid | não | todas do workspace | |

Variante REST equivalente: `GET /meta/insights/anuncio-detalhe/{ad_id}` (delega ao principal com `lookup_type=ad`).

## Response 200 (payload completo)

```jsonc
{
  "id": "120241554595130520",
  "lookup_type": "ad",
  "lookup_id": "120241554595130520",
  "period": { "inicio": "2026-04-01", "fim": "2026-05-20", "label": "01/04/2026 - 20/05/2026" },
  "ad_id": "120241554595130520",
  "creative_id": "1549787559580257",
  "name": "FERIDAS QUE NAO CICATRIZAM...mp4",
  "status": "Ativo",                  // Ativo | Pausado | Desativado
  "creative_type": "VIDEO",           // VIDEO | IMAGE
  "thumbnail_url": "https://...",
  "image_url_hq": "https://...",
  "meta_url": "https://...",
  "campaign_id": "120235782999070520",
  "campaign_name": "1ST_TRAFEGO_ABO_SAO_PAULO_PQ_VIDEOS",
  "adset_id": "120241554595120520",
  "adset_name": "02_AUTO_40+_WAR_LOCAL_SAO_PAULO_V1_API_371734",
  "spend": 2707.87, "leads": 256, "impressions": 234897, "reach": 202409,
  "clicks": 4138, "link_click": 1012,
  "cpl": 10.5776, "ctr": 1.76, "frequencia": 1.1605,
  "score_ia": 45,                      // alias de "score"
  "dias_ativo": 16,
  "trend": [ { "date": "2026-05-07", "cpl": 9.8, "leads": 12 }, ... ],   // 14 pontos
  "platforms": [ { "platform": "instagram", "leads": 0, "spend": 0, "ctr": 0, "cpl": 0 }, { "platform": "facebook", ... } ],
  "comparativo": [ { "ad_id": "...", "creative_id": "...", "name": "...", "thumbnail_url": "...", "status": "ACTIVE", "leads": 0, "spend": 0, "cpl": 0, "ctr": 0, "is_current": true } ],  // só relevante p/ lookup_type=ad
  "distribution": [ { "campaign_id": "...", "campaign_name": "...", "adset_id": "...", "adset_name": "...", "status": "...", "leads": 0, "spend": 0, "cpl": 0, "ctr": 0 } ],
  "headline": "Converse conosco ...",
  "destination_url": "https://www.instagram.com/p/...",
  "url_tags": null,
  "utm_source": null, "utm_medium": null, "utm_campaign": null, "utm_content": null, "utm_term": null,
  "pixel_id": null,
  "video_metrics": { "video_views": 0, "thruplay": 0, "p25": 0, "p50": 0, "p75": 0, "p100": 0, "video_3_sec": 0, "hook_rate": 0, "hold_rate": 0, "ctr_link": 0 },  // null se IMAGE
  "period_rank": 2,
  "period_total": 64
}
```

## Mapeamento variante → campos consumidos (front)

| Variante | lookup_type | Campos-chave |
|----------|-------------|--------------|
| Overview | `creative` | KPIs, `trend`, `platforms`, `frequencia`+`reach`, `score_ia`, `video_metrics`. **NÃO consome `comparativo`** (`comparativo=[]` é OK). |
| Campaign | `ad` | KPIs, `comparativo` (com `is_current`), `platforms`, tracking (`destination_url`, `utm_*`). |
| Ads | `ad` | KPIs, funil (impressions→clicks→leads), `video_metrics`, tracking, `distribution`, `score_ia`. |

## Erros

| HTTP | Quando |
|------|--------|
| 400 | `lookup_type` ∉ {ad,creative}; `workspace_id` malformado |
| 403 | usuário sem acesso ao workspace |
| 200 (vazio) | sem contas no workspace → payload estruturado zerado |

## Verificado em prod (2026-05-20)
- `lookup_type=ad`, ad `120241554595130520` → 200, payload completo, `score_ia=45`, `platforms[2]`, `comparativo[3]`, `trend[14]`.
- `lookup_type=creative`, creative `1549787559580257` → 200, `comparativo[0]` (esperado).

## Campos ausentes no payload (gap vs brief do modal)

O brief descreve dois painéis que **não têm campo no payload atual**:
- `quality_rankings` (rankings de qualidade do Meta — quality/engagement/conversion ranking) → consumido pela variante Overview como `qualityRankings`, hoje hardcoded `undefined` no front (`ad-creative-detail.ts:377`).
- `ai_insight` / recomendação (Escalar | Aguardar | Pausar + causa raiz) → consumido por Overview (`:378`) e Ads (`:454`), hoje hardcoded `undefined`.

`signals` e `funnel` (gargalo) da variante Ads **são derivados no front** a partir de KPIs (`buildSignals`/`buildFunnel`), não vêm do payload — funcionam, mas o "painel de IA" nomeado no brief não.

Decisão pendente do usuário: estender o payload (backend) para popular esses campos, OU marcar os painéis como placeholder não-implementado no front. Ver `tasks.md` T14/T15.
