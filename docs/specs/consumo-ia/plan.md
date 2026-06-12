# Plano técnico — Consumo & Custo de IA (Fase 2)

## Backend

### Migration `071_ai_usage.py` (down_revision `070`)
- `ai_usage_log`: `id`, `created_at timestamptz`, `feature varchar(20)`, `workspace_id uuid null`, `model varchar(120)`, `provider varchar(40)`, `kind varchar(10)` (text|image), `tokens_prompt int default 0`, `tokens_completion int default 0`, `tokens_total int default 0`, `image_count int default 0`, `image_quality varchar(10) null`, `image_size varchar(20) null`, `cost_usd numeric(12,6) null`, `pricing_source varchar(20)` (db|sem_preco), `request_id text null`, `status varchar(20) default 'ok'`. Índices: `(created_at)`, `(feature, created_at)`, `(workspace_id, created_at)`, `(model)`.
- `ai_model_pricing`: `id`, `model varchar(120) unique`, `kind varchar(10)`, `input_usd_1m numeric(12,4) null`, `output_usd_1m numeric(12,4) null`, `image_prices_json jsonb null` (`{"low":..,"medium":..,"high":..}`), `ativo bool default true`, timestamps. Seed: `gpt-4o-mini`, `gpt-4.1-mini`, `gpt-4.1`, `gpt-image-2` com defaults aproximados (editáveis).
- `fx_rates`: `id`, `dia date unique`, `usd_brl numeric(10,4)`, `fonte varchar(40)`, `fetched_at timestamptz`.

### Models
- `app/models/ai_usage_log.py`, `app/models/ai_model_pricing.py`, `app/models/fx_rate.py`.

### Serviço de custo + registro — `app/services/ai_usage.py`
- `preco_de(model, db) -> AiModelPricing | None` (cache curto, igual padrão do resolver).
- `calcular_custo_usd(pricing, kind, tokens_prompt, tokens_completion, image_count, quality) -> Decimal | None`.
- `registrar_uso(db, *, feature, workspace_id, model, provider, kind, usage=None, image_count=0, quality=None, size=None, request_id=None, status='ok')`: calcula custo (snapshot) e insere em `ai_usage_log`. **Envolto em try/except** — nunca propaga exceção (best-effort).

### Câmbio — `app/services/fx.py`
- `cotacao_usd_brl(db) -> {dia, valor, fonte}`: se há linha de hoje em `fx_rates`, devolve; senão busca em `https://economia.awesomeapi.com.br/json/last/USD-BRL` (sem chave), grava e devolve; se a API falhar, usa a última linha conhecida.

### Instrumentação (call sites) — chamar `registrar_uso`
- `ia_insights.py`: capturar `resp.usage` em `_chamar_openai` (hoje descartado) e registrar (feature `insights`, workspace_id do contexto).
- `copy_assist.py`: 2 sites (já retornam `usage`) — registrar (feature `copy`).
- `creative_vision.py`: registrar (feature `vision`).
- `image_gen.py`: base e integrada (já têm `ger.usage`) — registrar (feature `image`, kind `image`, image_count=1, quality de `params_json`).
- Onde houver `db` e `workspace_id` no escopo do site (todos têm via o fluxo de geração/endpoint).

### API — `app/api/ai_usage.py` (`platform_admin`), registrar router no `main.py`
- `GET /ai/usage/summary?inicio&fim&group_by` → SQL agregando `ai_usage_log` (filtra período; soma chamadas/tokens/cost_usd; quebra por feature|model|workspace com JOIN em `workspaces` p/ nome). Converte BRL via `cotacao_usd_brl`.
- `GET /ai/usage/pricing` + `PUT /ai/usage/pricing/{model}` (upsert; invalida cache de preço).
- `GET /ai/usage/fx`.

## Frontend
- Hook `src/hooks/use-ai-usage.ts` (SWR): `useAiUsageSummary(inicio, fim, groupBy)`, `useAiPricing()`/`atualizarPreco`, `useAiFx()`.
- Aba **Consumo & Custo** em `/admin/ia` (3ª aba, hoje placeholder): filtro de período (presets 7/30 dias), KPIs (chamadas, tokens, custo USD, custo BRL + cotação), tabelas de quebra por feature/modelo/workspace (toggle de `group_by`), aviso para modelos `sem_preco`.
- Sub-seção/expandable **Preços** (editar input/output por 1M e preços de imagem por qualidade).

## Decisões
- Custo **snapshot** no log → histórico estável; preço só afeta o futuro.
- Imagem cobrada por imagem×qualidade (não por token) — `gpt-image-2` reporta tokens mas o billing é por imagem; guardamos tokens p/ referência mas custo vem do preço por qualidade.
- BRL derivado na exibição (não congelado) — custo "verdade" é USD; BRL é conveniência com cotação do dia.
- `registrar_uso` best-effort: telemetria nunca derruba feature de produto.

## Riscos
- Volume de `ai_usage_log`: 1 linha/chamada. Índices por data/feature/workspace; rollup diário fica para depois se crescer muito.
- API de câmbio externa: mitigado por cache diário + fallback última cotação.
