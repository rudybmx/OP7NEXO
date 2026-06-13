# Painel Central de IA

## Objective

Centralizar, num painel `platform_admin`, toda a configuração de IA do OP7NEXO (modelo + token por feature de IA) e tornar a troca de modelo/chave **mutável em runtime, sem redeploy**. Surfacar num só lugar os insights de IA de campanha que hoje só aparecem numa aba do Meta ("insights perdidos"), incluindo qual modelo os gerou.

Sucesso = admin troca o modelo/chave de qualquer feature de IA pela UI e a próxima chamada já usa o novo valor, sem editar `.env` nem subir deploy; e os insights de IA aparecem agregados no painel.

## Current State

- Toda config de IA vive só no `.env`, lida em `app/core/config.py` e carregada 1x no import (`settings = Settings()`). Trocar modelo/chave exige editar `.env` + redeploy.
- Quatro features de IA, todas OpenAI-compatível:
  - `insights` — `app/services/ia_insights.py` (`OPENAI_MODEL`, chave/base de texto via gateway).
  - `image` — `app/services/image_gen.py` (`OPENAI_IMAGE_MODEL`, chave dedicada `OPENAI_IMAGE_*`).
  - `vision` — `app/services/creative_vision.py` (`OPENAI_VISION_MODEL`, reusa chave de imagem).
  - `copy` — `app/services/copy_assist.py` (`OPENAI_COPY_MODEL`, reusa chave de imagem).
- Drift: `OPENAI_MODEL` virou `deepseek-v4-flash` em silêncio; `OPENAI_VISION_MODEL`/`OPENAI_COPY_MODEL` nem estão no `.env` (default hardcoded).
- `ai_insights` (migration 012) é gerado e cacheado mas só exposto em `GET /meta/insights/ia`. Não guarda qual modelo gerou.
- Tokens Meta/Google já têm tabela + UI (`/admin/tokens`); IA não tem.

## Scope

- In scope:
  - Tabela `ai_settings` (override de modelo/provider/base_url/api_key por feature) + resolver DB-first com fallback `.env`.
  - Refatorar os 4 serviços para o resolver. Gravar `model_usado` em `ai_insights`.
  - API `platform_admin`: listar/atualizar config (chave mascarada no retorno) + listar insights de IA agregados do workspace.
  - Painel `/admin/ia` com aba Modelos & Chaves e aba Insights de IA. Slot `agent` reservado (desabilitado).
  - Página dedicada **`/admin/analises-ia`** (read-only) só para leitura das análises de IA — reusa o componente `InsightsIaTabela` da aba. Item próprio no menu Administração.
- Out of scope (Fase 2):
  - Ledger geral de chamadas de IA (tokens in/out, custo $) e dashboard de gasto.
  - Wiring real do agente de atendimento.
  - Config por-workspace (hoje é global).
  - Reaglomerar métricas de Meta/Google (o painel linka para as telas existentes).

## Behavior Rules

- A resolução é **DB-first → `.env` fallback**: com `ai_settings` vazia/inativa, o comportamento é byte-idêntico ao de hoje (zero regressão).
- Override só se aplica quando a linha está `ativo=true` e o campo é não-nulo; cada campo (model/api_key/base_url) cai independentemente para o `.env`.
- Config é **global** (`platform_admin`); não há filtro por workspace na config.
- `GET /ai/insights` é restrito a `platform_admin` (que não tem workspace único: `get_workspace_atual` retorna `None`). Lista insights de **todos** os workspaces, com filtro opcional por `workspace_id`. O isolamento entre tenants é garantido por `exigir_platform_admin` (nenhum usuário-tenant alcança o endpoint); a constituição 2.1 mira vazamento entre tenants, e `platform_admin` legitimamente vê tudo (igual ao resto do `deps.py`).
- API **nunca** retorna a `api_key` completa — sempre mascarada (constituição 6). Atualizar chave é opt-in (não enviar = não altera).
- `agent` existe como feature reservada, `ativo=false`, sem wiring.
- Cache do resolver é **por processo** com TTL ~60s. Troca pela UI invalida o cache do processo da API (efeito imediato em uvicorn single-worker); outros processos (ex. `op7nexo-worker`, que roda os insights) só refletem ao expirar o TTL (≤60s).

## Inputs and Outputs

- Inputs: feature (`insights|image|vision|copy|agent`), provider, model, base_url, api_key (opcional).
- Outputs:
  - `GET /ai/settings` → lista por feature: model/base_url efetivos, `source` (`db|env`), `api_key_mask`, `ativo`, `has_override`.
  - `PUT /ai/settings/{feature}` → upsert do override; devolve o item (mascarado).
  - `GET /ai/insights` → insights de IA recentes do workspace (tipo, titulo, mensagem, acao, conta, modulo, model_usado, gerado_em).

## Error Cases

- Feature inválida no PUT → 422.
- Banco indisponível na resolução → resolver usa `.env` e loga warning (não derruba a chamada de IA).
- Não-`platform_admin` em `/ai/settings` → 403.
- `api_key` ausente no PUT → mantém a chave atual (não apaga).

## Acceptance Criteria

- [ ] Com `ai_settings` vazia, gerar criativo/insight usa exatamente os modelos do `.env` atual.
- [ ] Trocar o modelo de `copy` pela UI faz `/api/design/gerar-copy` usar o novo modelo sem redeploy.
- [ ] `GET /ai/settings` nunca expõe a chave completa.
- [ ] `GET /ai/insights` (platform_admin) traz insights de todos os workspaces; `?workspace_id=` filtra; nenhum usuário-tenant alcança o endpoint (403).
- [ ] `ai_insights` novos guardam `model_usado`.
- [ ] `/admin/ia` lista as features e os insights; só acessível a `platform_admin`.

## Test Plan

- Manual: deploy api; conferir tabela `ai_settings` e coluna `ai_insights.model_usado`.
- Manual: PUT model de `copy` → curl `/api/design/gerar-copy` → confere modelo novo.
- Manual: `GET /ai/settings` retorna `api_key_mask`, nunca a chave inteira.
- Manual: front build + `/admin/ia` como `platform_admin`.

## Atualização (2026-06-13) — Auto-refresh + Google

- Insights de IA passaram a ser gerados **automaticamente** no `op7nexo-worker` ao fim de cada sync (06/12/18h), para todos os workspaces com dados nos últimos 7 dias — antes só geravam sob demanda ao abrir a tela do Meta, então o painel central (read-only) mostrava dados antigos.
- KPIs+geração extraídos para `ia_insights.gerar_insights_meta()` (reusado pelo endpoint e pelo scheduler) + novo `gerar_insights_google()` (`google_dados_diarios`). Cache/`buscar_*` agora filtram por `modulo` (`meta_ads`|`google_ads`).
- Google Ads passa a ter insights de IA (`modulo='google_ads'`). Front: badge Plataforma na tabela.

## Open Questions

- None
