# Meta Ads — Integração, Sync e Insights

## Objetivo
Sincronizar dados de performance da Meta Graph API para o banco local e expô-los via endpoints de analytics. Os dados servem o dashboard de Marketing do front, incluindo a modal de Anúncios com vídeo.

## Estado atual
Implementado e em produção. Sync manual + automático. Insights com 4 níveis de granularidade. Fluxo de vídeo para Anúncios fechado com catálogo, poster HQ e métricas de retenção.

## Escopo
- In scope: sync de contas Meta, insights diários/campanha/anúncio/público, IA insights, scheduler, catálogo de vídeos e retenção
- Out of scope: Google Ads, TikTok Ads, LinkedIn Ads (estrutura preparada, não implementada)

## Regras de comportamento

### Tokens
- Token pertence ao admin/agência — **global**, sem `workspace_id`
- Um token pode ser usado em múltiplas contas de múltiplos workspaces
- Status: ativo (verde) / expira em <30 dias (amarelo) / expirado (vermelho)

### Contas de Anúncio
- Vinculadas ao workspace via `workspace_id`
- `ativo = true` → visível em filtros, dropdowns e relatórios
- `ativo = false` → invisível ao usuário final (soft delete)
- Toggle: `PATCH /meta/ads-accounts/:id/toggle`

### Sincronização
- Manual: `POST /meta/sync/{ads_account_id}` → sync imediato, retorna totais
- Automático: APScheduler — 06h, 12h, 18h (horário de Brasília)
- Jobs em andamento ficam persistidos em `sync_jobs` e podem ser reidratados pela UI via `GET /meta/sync/ativos`
- O scheduler expõe estado e próximo disparo via `GET /meta/sync/scheduler`
- Upsert por dia: `UNIQUE(ads_account_id, data)` em todas as tabelas de insights
- Se `bm_token` expirado → conta pulada com log de aviso
- Chamadas à Graph API usam throttle adaptativo por headers de uso (`X-App-Usage`, `X-Ad-Account-Usage`, `X-Business-Use-Case-Usage`) e backoff exponencial com jitter quando a Meta retorna rate limit.
- Rate limit é erro temporário: não pausa a conta; o sync manual finaliza o job com mensagem de rate limit e o scheduler registra cooldown por conta e segue para a próxima.
- `sync_paused` é reservado para erro permanente de permissão/acesso/token.
- Públicos por campanha no sync padrão rodam apenas para campanhas relevantes (ativas ou com gasto/leads nos últimos 3 dias), limitadas por configuração; backfill pesado fica desabilitado por padrão.

### Anúncios
- A listagem de anúncios segue o mesmo conjunto de campanhas visíveis na aba `Campanhas`
- `resultado=performance` mantém apenas itens com `result_count > 0`, usando o resultado bruto persistido do Meta; quando o período não tem `result_count` preenchido, o endpoint usa `leads > 0` como fallback para não esconder anúncios com performance real
- `result_count` só é persistido quando o Meta expõe um indicador primário de resultado, como mensagens iniciadas, leads, vídeo ou tráfego; métricas auxiliares de `reach`, `post_engagement` e `post_reaction` não entram no filtro
- A resolução do criativo na listagem usa `creative_id` do insight, depois `creative_id` canônico do catálogo de anúncios, e só então `ad_id`, porque a Meta pode reutilizar o mesmo criativo em anúncios diferentes
- `ordenar_por` aceita a cascata textual `campanha`, `conjunto` e `anuncio` além dos campos métricos já existentes
- Ordenação textual é ascendente e usa `campaign_name -> adset_name -> nome` como desempate para preservar a leitura em escada

### Criativos
- `meta_creatives_catalog` é a fonte canônica de thumbnail, capa HQ e link do anúncio
- A resolução do criativo prioriza `ad_id` e usa `creative_id` do catálogo quando o insight vier sem `creative_id`
- Se não houver correspondência no catálogo, o backend cai para `ad_id` como chave funcional para não quebrar a navegação
- `/meta/insights/criativos` e `/meta/insights/campanhas-por-criativo` usam essa chave canônica para manter a modal e os gráficos funcionando com `creative_id` nulo no insight

### Vídeos
- O `sync` resolve `video_id` do criativo tanto em `creative.video_id` quanto em `object_story_spec.video_data.video_id`
- O `AdVideo` é consultado com `source` e `thumbnails{uri,width,height,is_preferred}`
- A thumbnail preferencial usa `is_preferred = true`; sem isso, a maior resolução vence
- A melhor capa é persistida no MinIO e referenciada em `meta_videos_catalog.image_url_hq`
- `meta_videos_catalog` mantém `source_url`, `thumbnail_url`, `image_url_hq`, `creative_id`, `ad_id`, `campaign_id` e `adset_id`
- As métricas de retenção usam `video_3_sec_watched_actions`, `video_p25_watched_actions`, `video_p50_watched_actions`, `video_p75_watched_actions`, `video_p100_watched_actions` e `video_avg_time_watched_actions`

### Hierarquia de dados Meta
```
Account (ads_accounts)
└── Campaign (meta_campanhas_insights)
    └── Ad (meta_anuncios_insights)
        ├── Público (meta_publicos_insights) — breakdown demográfico e placement
        └── Nível diário (meta_insights_diarios) — agregado da conta
```

### Insights IA
- Endpoint: `GET /meta/insights/ia`
- Usa DeepSeek v4 via opencode.ai (`max_tokens=4000` — modelo reasoning consome ~1900 tokens internamente)
- Retorna `[]` se `OPENAI_API_KEY` não configurada
- Formato: `[{ tipo: "OPORTUNIDADE|ALERTA", mensagem, acao }]`

## Inputs e Outputs

### `GET /meta/insights/visao-geral`
- Params: `workspace_id`, `data_inicio`, `data_fim`, `conta_ids` (opcional)
- Retorna: KPIs agregados, dados diários, leads por canal, lista de contas

### `GET /meta/insights/campanhas`
- Params: mesmos de visao-geral
- Retorna: performance por campanha com spend/leads/cpl/ctr/cpc/cpm

### `GET /meta/insights/anuncios-performance`
- Params: `workspace_id`, `data_inicio`, `data_fim`, `conta_ids` (opcional), `campaign_ids` (opcional), `campaign_id` (opcional), `platform_filter` (opcional), `status_filter` (opcional), `tipo` (opcional), `page`, `limit`, `ordenar_por`, `resultado`
- Retorna: lista paginada de anúncios com `video_id`, `video_source_url`, `video_thumbnail_url`, `video_thumbnail_hq_url`, `video_metrics` e `video_retention_data`

### `GET /meta/insights/videos`
- Params: `workspace_id`, `data_inicio`, `data_fim`, `conta_ids` (opcional), `campaign_id` (opcional), `status` (opcional)
- Retorna: catálogo agregado de vídeos com `thumbnail_url`, `source_url`, métricas de retenção e `thruplay`

### Métricas calculadas
- `cpl = spend / leads`
- `cpc = spend / clicks`
- `cpm = (spend / impressions) * 1000`
- `ctr = (clicks / impressions) * 100`
- `frequencia = impressions / reach`

## Casos de erro
- `bm_token` inválido → sync falha silenciosamente, conta marcada com warning no log
- Período sem dados → retorna zeros (não erro)
- `OPENAI_API_KEY` ausente → `/meta/insights/ia` retorna `[]`
- Vídeo sem `source` ou sem thumbnail HQ → a modal do front exibe estado vazio/fallback visual sem quebrar o restante do anúncio

## Critérios de aceite
- [x] Sync manual executa e salva dados no banco
- [x] Scheduler dispara 3x/dia no horário correto
- [x] Upsert por dia não duplica registros
- [x] `conta_ids` filtra corretamente dados multi-conta
- [x] IA retorna insights estruturados quando API key presente

## Open Questions
- None
