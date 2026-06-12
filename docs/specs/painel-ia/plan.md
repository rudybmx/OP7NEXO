# Plano técnico — Painel Central de IA

## Arquitetura

Resolução de config de IA passa de `settings.openai_*` (import-time, imutável) para um **resolver DB-first com fallback `.env` e cache TTL**. Serviços param de ler `settings` direto e passam a chamar `get_ai_config(feature)`.

### Backend

1. **Migration `070_ai_settings.py`** (down_revision `069`):
   - Tabela `ai_settings`: `id uuid pk`, `feature varchar(20) unique not null`, `provider varchar(40)`, `model varchar(120)`, `base_url text`, `api_key text`, `ativo bool default true`, `created_at/updated_at timestamptz`.
   - Seed das 5 features (`insights|image|vision|copy|agent`) com overrides NULL; `agent` com `ativo=false`.
   - `ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS model_usado varchar(120)`.

2. **`app/models/ai_setting.py`** — model SQLAlchemy (padrão `meta_token.py`).

3. **`app/core/ai_config.py`** — `get_ai_config(feature) -> AiConfig(model, api_key, base_url, source)`:
   - Defaults por feature a partir de `settings` (vision/copy herdam chave/base de imagem).
   - Lê `ai_settings` via `SessionLocal()` própria (resolver não recebe `db`), aplica campos não-nulos de linha `ativo=true`.
   - Cache em memória com lock + TTL 60s; `invalidate_cache(feature=None)`.
   - Banco indisponível → `.env` (try/except, warning).

4. **Refator dos serviços** (trocar `settings.openai_*` por resolver):
   - `ia_insights.py`: `_chamar_openai` usa `get_ai_config("insights")`; `gerar_e_salvar_insights` resolve o modelo e grava `model_usado` no INSERT.
   - `image_gen.py`: `_client_for(feature)` genérico; `_image_client()` = `_client_for("image")`; `settings.openai_image_model` → `get_ai_config("image").model` (helper `_image_model()`).
   - `creative_vision.py`: client `_client_for("vision")`, model `get_ai_config("vision").model`.
   - `copy_assist.py`: client `_client_for("copy")`, model `get_ai_config("copy").model`.

5. **`app/api/ai_settings.py`** (`platform_admin`):
   - `GET /ai/settings` — itera as features, junta efetivo (resolver) + metadados da linha; `api_key_mask` server-side.
   - `PUT /ai/settings/{feature}` — upsert por feature; `api_key` opcional (não envia = mantém); `invalidate_cache(feature)` após salvar.
   - `GET /ai/insights` — `SELECT ... FROM ai_insights WHERE workspace_id = :ws ORDER BY gerado_em DESC LIMIT n`.
   - Registrar router em `app/main.py`.

### Frontend

6. **`src/hooks/use-ai-settings.ts`** — SWR (padrão `use-google-ads-credentials.ts`): `useAiSettings()` + `useAiInsights()` + `updateAiSetting(feature, payload)`.

7. **`src/app/(plataforma)/admin/ia/page.tsx`** — guarda `platform_admin`; abas:
   - Modelos & Chaves: linha por feature, edita model/provider/base_url/chave (Sheet/drawer); badge `source` (env/db); `agent` desabilitado.
   - Insights de IA: lista de `GET /ai/insights` com badge tipo + model_usado.

## Decisões

- `api_key` em plaintext (segue padrão `meta_tokens`); mitiga vazamento com mascaramento no Out e nunca logando valor.
- `feature` é chave natural do upsert (sem expor uuid na UI).
- vision/copy default herda chave de imagem; painel permite chave própria via override.

## Riscos

- Resolver com sessão própria por cache-miss: TTL 60s limita carga; aceitável.
- Refator do `image_gen` toca muitas linhas de `settings.openai_image_model` — mecânico, cobrir com verificação de fallback.
