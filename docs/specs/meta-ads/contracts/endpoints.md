# Contratos de API — Meta Ads

## GET /meta/insights/visao-geral
**Query:** `workspace_id` (uuid, required) · `data_inicio` (YYYY-MM-DD) · `data_fim` (YYYY-MM-DD) · `conta_ids` (string, comma-separated account_ids, optional)

**Response 200:**
```json
{
  "kpis": { "spend": 0, "leads": 0, "impressions": 0, "reach": 0, "clicks": 0, "ctr": 0, "cpc": 0, "cpm": 0, "cpl": 0, "frequencia": 0 },
  "contas": [{ "id": "uuid", "account_id": "act_...", "account_name": "string", "spend": 0, "leads": 0 }],
  "dados_diarios": [{ "data": "YYYY-MM-DD", "spend": 0, "leads": 0, "impressions": 0, "clicks": 0 }],
  "leads_por_canal": [{ "canal": "facebook|feed", "leads": 0, "spend": 0, "percentual": 0 }],
  "periodo": { "inicio": "YYYY-MM-DD", "fim": "YYYY-MM-DD" }
}
```

## GET /meta/insights/campanhas
**Query:** mesmos de visao-geral

**Response 200:**
```json
[{ "campaign_id": "string", "nome": "string", "status": "string", "objetivo": "string", "spend": 0, "leads": 0, "cpl": 0, "ctr": 0, "cpc": 0, "cpm": 0, "impressions": 0, "reach": 0, "clicks": 0 }]
```

## GET /meta/insights/anuncios-performance
**Query:** `workspace_id` · `data_inicio` · `data_fim` · `conta_ids` (optional) · `campaign_ids` (optional) · `campaign_id` (optional) · `platform_filter` (optional) · `status_filter` (optional) · `tipo` (optional) · `page` · `limit` · `ordenar_por` · `resultado`

The front should send the same visible campaign set used by `Campanhas` via `campaign_ids`. `campaign_id` remains as a compatibility fallback for older callers.

**Response 200:**
```json
{
  "items": [{
    "id": "ad_id",
    "nome": "string",
    "creative_id": "string|null",
    "creative_type": "VIDEO|IMAGE|CAROUSEL",
    "result_count": 0,
    "result_indicator": "actions:onsite_conversion.messaging_conversation_started_7d|null",
    "video_id": "string|null",
    "video_source_url": "https://...",
    "video_thumbnail_url": "https://...",
    "video_thumbnail_hq_url": "https://...",
    "video_metrics": { "video_views": 0, "thruplay": 0, "p25": 0, "p50": 0, "p75": 0, "p100": 0, "video_3_sec": 0, "avg_watch_time": 0 },
    "video_retention_data": [{ "label": "P25", "percentage": 0, "views_count": 0 }]
  }],
  "page": 1,
  "limit": 15,
  "total": 0,
  "has_more": false,
  "resumo": { "investimento_total": 0, "leads_total": 0, "ctr_medio": 0, "frequencia_media": 0 },
  "campanhas_disponiveis": [{ "id": "string", "nome": "string" }],
  "plataformas_disponiveis": [{ "codigo": "facebook", "label": "Facebook" }]
}
```

## GET /meta/insights/videos
**Query:** `workspace_id` · `data_inicio` · `data_fim` · `conta_ids` (optional) · `campaign_id` (optional) · `status` (optional)

**Response 200:**
```json
[{ "video_id": "string", "creative_id": "string", "ad_id": "string", "thumbnail_url": "https://...", "source_url": "https://...", "video_views": 0, "video_p25": 0, "video_p50": 0, "video_p75": 0, "video_p100": 0, "thruplay": 0, "cost_per_thruplay": 0 }]
```

## GET /meta/insights/ia
**Query:** `workspace_id` · `data_inicio` · `data_fim`

**Response 200:**
```json
[{ "tipo": "OPORTUNIDADE|ALERTA", "mensagem": "string", "acao": "string" }]
```

## POST /meta/sync/{ads_account_id}
**Response 200:**
```json
{ "ok": true, "conta": "act_...", "totais": { "diarios": 30, "campanhas": 120, "anuncios": 450, "publicos": 200 } }
```

## GET /meta/sync/ativos
**Query:** `ads_account_id` *(opcional)*

**Response 200:**
```json
[{ "id": "uuid", "ads_account_id": "uuid", "status": "pending|running", "etapa_atual": "string|null", "progresso": 57, "totais": null, "erro": null, "created_at": "ISO8601", "updated_at": "ISO8601" }]
```

## GET /meta/sync/scheduler
**Response 200:**
```json
{ "running": true, "jobs": [{ "id": "meta_sync", "trigger": "cron[...]","next_run_time": "ISO8601|null", "timezone": "America/Sao_Paulo" }] }
```

## POST /meta/importar-contas
**Body:**
```json
{ "workspace_id": "uuid", "token": "string", "token_expira_em": "ISO8601|null", "periodo_sync": "mes_atual|1_mes|2_meses|3_meses", "contas": [{ "account_id": "act_...", "nome": "string" }] }
```
**Response 200:** `{ "criadas": 2, "atualizadas": 1 }`
