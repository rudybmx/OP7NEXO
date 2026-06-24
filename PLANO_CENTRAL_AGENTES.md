# PLANO — Central de Agentes (OP7NEXO)

> Módulo administrativo (platform_admin) para gerenciar agentes de IA de atendimento
> omnichannel, integrado ao sistema de conversas CRM existente.

## Context

O OP7NEXO já recebe e persiste mensagens omnichannel (Evolution/WAHA/Cloud API/Z-API)
em `crm_whatsapp_conversas` / `crm_whatsapp_mensagens`, com enriquecimento de IA assíncrono
(`resumo_ia`, `contexto_ia`). **Hoje não existe um agente de IA interno que responda
automaticamente o lead.** A Central de Agentes preenche essa lacuna e passa a ser o **único**
respondedor automático de inbound (sem coexistência com sistema externo).

A Central de Agentes adiciona:
1. Tela admin (3 abas: **Agentes**, **Uso & Consumo**, **Providers & Modelos**) para configurar agentes por workspace.
2. Worker que intercepta mensagens recebidas, **consolida mensagens picotadas (debounce)**, responde via LLM e faz handoff por confiança.
3. **Multi-provider de LLM configurável via banco** (OpenAI / OpenRouter / DeepSeek / Anthropic) — tokens no DB, não no `.env`.
4. RAG sobre base de conhecimento (pgvector).
5. **Self-improvement** via few-shot dinâmico: correções de atendentes retroalimentam o agente sem fine-tuning.
6. Observabilidade de consumo/custo.

O plano **reaproveita** infraestrutura de IA já existente em vez de recriá-la, e **corrige**
pontos do enunciado que conflitam com as convenções reais do repositório (seção "Desvios").

---

## Mapa de Reúso (não recriar)

| Necessidade | Já existe no repo — reusar |
|---|---|
| Tabela de preço por modelo | `app/models/ai_model_pricing.py` (`ai_model_pricing`: input/output USD por 1M, editável) |
| Registro de consumo/custo de IA | `app/models/ai_usage_log.py` (`ai_usage_log`: tokens, `cost_usd` snapshot, workspace, feature) |
| Dashboard de custo + cotação USD→BRL | `app/api/ai_usage.py` (`/ai/usage/summary`, `/ai/usage/pricing`) + `app/services/fx.py` |
| Client openai-compatible | SDK `openai` (já em `requirements.txt`) — instanciado pelo novo `LLMClientService` a partir de `llm_providers` (DB) |
| Auth platform_admin + workspaces | `app/core/deps.py`: `get_usuario_atual`, `exigir_platform_admin`, `listar_workspaces_autorizados` |
| Fila de jobs pós-mensagem + timer | `crm_message_jobs` (`app/models/crm/message_job.py`: já tem `next_run_at`, `payload jsonb`, `job_type`, `priority`) + `whatsapp_event_worker.py` (poll `FOR UPDATE SKIP LOCKED`) |
| Ponto de enfileiramento pós-inbound | `whatsapp_crm_persistence.process_evolution_message` (~linha 399, junto a `sincronizar_paineis_apos_mensagem`) |
| Envio outbound por canal | `evolution.enviar_mensagem_texto`, `waha_service.enviar_mensagem_texto`, `meta_cloud.enviar_mensagem_texto`; provider via `canal_labels.canal_provider` |
| Toggle ativo / handoff em tempo real | `redis_pub.publish_whatsapp_event` |
| Mascaramento de segredo | `app/api/ai_settings.py::_mask` (primeiros 6 + últimos 4) |
| Padrão de tela admin + drawer | `src/app/(plataforma)/admin/tokens/page.tsx`, `components/ui/ws-sheet`, `ws-table` |
| Estado remoto no front | **SWR** (`src/lib/swr.ts`, hooks `use-meta-tokens.ts`) |
| Config do menu lateral | `src/lib/contexto-layout.tsx` (itens admin) + `components/layout/barra-lateral.tsx` (ícones lucide-react) |

---

## Desvios do enunciado → convenção do projeto

1. **Sem `/api/v1`.** `FastAPI()` em `app/main.py:100` não tem prefixo de versão; rotas são `/conversas`, `/ai/usage`, workspace-scoped como `@router.get("/workspaces/{workspace_id}/canais")` (`app/api/canais.py:826`). → **Usar `/workspaces/{workspace_id}/agentes/...`** e `/llm-providers/...`, sem `/api/v1`. *(Decidido: seguir o repo.)*
2. **SWR, não TanStack Query.** Não há `@tanstack/react-query`; o projeto usa `swr ^2.4.1`. → Polling de 30s via `useSWR(..., { refreshInterval: 30000 })`; mutações via `mutate()`. *(Decidido: seguir o repo.)*
3. **Ícone lucide-react `Bot`, não Tabler `ti-robot`.** `barra-lateral.tsx` importa de `lucide-react`. *(Decidido: seguir o repo.)*
4. **LLM multi-provider via banco, não `.env`/`get_ai_config("agent")`.** *(Ajuste estrutural — ver Fase 1.)* Em vez de depender de `ai_settings`, criam-se tabelas `llm_providers` / `llm_provider_tokens` / `llm_provider_modelos` geridas no admin. Todos os providers seed são `tipo=openai_compatible` (OpenAI, OpenRouter, DeepSeek), então o mesmo client `openai` atende a todos mudando só `base_url` + nome do modelo. `anthropic` permanece **fora** de `requirements.txt` (Anthropic, se usada, via wrapper openai-compatible). Score de confiança via structured-output JSON (`response_format`) pedido no system prompt.
5. **Custo/uso: reusar `ai_model_pricing` + `ai_usage_log`.** Criar `agente_uso_tokens` (campos específicos: `escalado`, `score_confianca`, `canal_id`, `conversa_id`) **e** espelhar cada chamada em `ai_usage_log` com `feature='agent'`, para o dashboard global `/ai/usage` já agregar. Custo via `ai_model_pricing`.
6. **Acesso = `platform_admin`** *(decidido)*, gerenciando agentes de **todos** os workspaces. Os agentes têm `workspace_id` (isolamento de dado); a tela mostra **seletor de workspace no topo** para filtrar a lista. Rotas mantêm `/workspaces/{workspace_id}/agentes`, mas auth é `Depends(exigir_platform_admin)` (não `verificar_acesso_workspace`). **Fase futura (não agora):** frontend separado para o cliente (owner do workspace) ver/configurar seu próprio agente.

---

## Riscos & Gates Obrigatórios (todas as fases)

- **Numeração de migration (GATE).** Última na árvore atual (`api/production`) é **074**. As migrations 075–081 podem existir na branch de port CRM **não-mergeada**. Antes de criar qualquer migration: `ls alembic/versions/ | grep -oE '^[0-9]+' | sort -n | tail -1` e **numerar a partir do próximo**; confirmar branch com `git branch --show-current` (a working tree pode trocar de branch por agente concorrente). Os números abaixo (075–080) são **lógicos** — renumerar conforme o gate.
- **ALTER em tabela existente (GATE).** Antes de alterar `crm_whatsapp_conversas`: `SELECT column_name FROM information_schema.columns WHERE table_name='crm_whatsapp_conversas';` — usar `ADD COLUMN IF NOT EXISTS`. Atenção: já existe coluna `agente VARCHAR` (display name, default "Op7 Nexo") — **não confundir** com a nova `ai_agente_id UUID`. Idem antes de tocar `crm_message_jobs` (já tem `next_run_at`, `payload`, `job_type`).
- **Hook no inbound não pode quebrar o fluxo existente.** O AgentService é acionado **apenas** por enfileiramento de `crm_message_jobs` (`job_type='agente_reply'`) no ponto pós-persistência de inbound, dentro de try/except que **nunca** propaga erro para a persistência da mensagem.
- **pgvector (Fase 3).** Postgres é `postgres:16-alpine` em `/root/infra/postgres/docker-compose.yml` (container `postgres`, volume `postgres_data`). **Alpine não tem `apt-get`** → o procedimento do enunciado é inválido. Fix durável: trocar imagem para `pgvector/pgvector:pg16` (mantém o volume) — ver Fase 3.
- **Segredo de LLM em repouso (decidido: Fernet).** `llm_provider_tokens.token_encrypted` armazena o token **cifrado com Fernet** (`cryptography.fernet`, chave em `LLM_TOKEN_ENC_KEY`). A API nunca retorna o valor decifrado — só máscara (`ai_settings._mask`: primeiros 6 + últimos 4 do token original, antes de cifrar). `LLMClientService` decifra **em memória** no momento da chamada, nunca persiste o valor decifrado. Provisionar `LLM_TOKEN_ENC_KEY` no `.env` do op7nexo-api **antes** da Fase 1.
- **Race condition no debounce (GATE Fase 2).** O `FOR UPDATE SKIP LOCKED` do worker bloqueia outros `SELECT FOR UPDATE` sobre a linha do job, mas **não** bloqueia um `UPDATE` direto feito pelo hook de inbound. Se o hook reseta `next_run_at` de um job que o worker acabou de pegar (status transitando `pending`→`processing`), o `UPDATE` pode pegar a linha ainda como `pending` por um instante e corromper o estado em silêncio (timer reseta, mas o job já está em processamento e não será reprocessado). **Correção obrigatória (regra de implementação da Fase 2):** o `UPDATE` de reset deve conter `... WHERE conversa_id=:conversa_id AND job_type='agente_reply' AND status='pending'`; se afetar **0 linhas** (job já pego pelo worker), **inserir novo job** com `next_run_at = NOW() + debounce` — não tentar atualizar de novo.
- **Deploy.** Tudo sob `lock-deploy bash /root/deploy.sh ...`. Worker em container separado (`op7nexo-worker`, `command: python -m app.worker`); `deploy.sh both` **não** inclui o worker — mudanças no worker exigem `deploy.sh worker`.
- **Concorrência de árvore.** Commitar cedo, stage só do escopo, re-deploy da árvore commitada (memórias op7nexo).

---

## FASE 1 — Fundação (schema + CRUD de agente + Providers de LLM)

**Objetivo:** tela com listagem/formulário completo de agente e gestão de providers/modelos de LLM; criar/editar/ativar/inativar/excluir. Sem worker, sem RAG.

### Migration `075_llm_providers.py`
- `llm_providers`: `id uuid PK`, `nome varchar`, `base_url varchar`, `tipo varchar` (`openai_compatible`/`anthropic_native`), `ativo boolean default true`, `descricao text`, `criado_em`. **Seed:** OpenAI (`https://api.openai.com/v1`), OpenRouter (`https://openrouter.ai/api/v1`), DeepSeek (`https://api.deepseek.com/v1`) — todos `openai_compatible`.
- `llm_provider_tokens`: `id uuid PK`, `provider_id FK llm_providers(id)`, `token_encrypted text` (token cifrado com **Fernet**/`LLM_TOKEN_ENC_KEY`; nunca retornado inteiro), `ativo boolean default true`, `criado_em`, `atualizado_em`. Um token global por provider (escopo plataforma).
- `llm_provider_modelos`: `id uuid PK`, `provider_id FK`, `nome_modelo varchar` (ex: `gpt-4o`, `gpt-4o-mini`, `deepseek-chat`, `deepseek-r1`), `label_display varchar`, `ativo boolean default true`, `criado_em`. **Seed:** OpenAI → `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`; DeepSeek → `deepseek-chat`, `deepseek-r1`; OpenRouter → campo livre no admin.

### Migration `076_central_agentes_core.py`
Tabelas com `id uuid PK default gen_random_uuid()`, `workspace_id FK workspaces(id)`:
- `agentes`: `nome`, `descricao text`, **`provider_id FK llm_providers(id)`**, **`modelo varchar`** (nome do modelo no provider), `status varchar default 'inativo'` (CHECK ativo/inativo), `tom varchar`, `idiomas text[]`, `blacklist_topicos text[]`, `threshold_confianca float default 0.7`, `tempo_resposta_target_ms int`, **`debounce_segundos int default 40`**, `limite_tokens_dia int`, `alerta_threshold_pct int default 80`, `mensagem_abertura text`, `criado_em`, `atualizado_em`, `deleted_at timestamptz null`. Seed do front: provider OpenAI + modelo `gpt-4o`.
- `agente_canais` (M:N): `agente_id` FK, `canal_id FK canais_entrada(id)`, `ativo boolean default true`.
  - **"1 agente ativo por canal":** `ativo` mora **na junção** (partial-unique não atravessa join). `CREATE UNIQUE INDEX uq_agente_canal_ativo ON agente_canais (canal_id) WHERE ativo=true;` — espelha `uq_crm_open_conversation_per_channel`. App sincroniza `agente_canais.ativo` com `agentes.status`.
- `agente_prompts`: `agente_id` FK, `prompt_texto text`, `status varchar` (draft/publicado), `criado_em`, `publicado_em timestamptz null`, `publicado_por uuid FK users(id)`.
- `agente_horarios`: `agente_id` FK, `dia_semana int CHECK (0..6)`, `hora_inicio time`, `hora_fim time`, `ativo boolean default true`.
- `agente_habilidades`: `agente_id` FK, `tipo varchar`, `nome varchar`, `config_json jsonb default '{}'`, `ativo boolean default true`.

> `agente_uso_tokens`, `agente_base_conhecimento`, `agente_conversa_feedback`, `agente_exemplos_feedback` e o ALTER em `crm_whatsapp_conversas` ficam para fases posteriores.

### Backend
- **Models:** pacote `app/models/agente/` (espelha `app/models/crm/`): `agente.py`, `agente_canal.py`, `agente_prompt.py`, `agente_horario.py`, `agente_habilidade.py`, `llm_provider.py`, `llm_provider_token.py`, `llm_provider_modelo.py`, `__init__.py`. Registrar em `app/models/__init__.py`.
- **Schemas:** `app/schemas/agente.py` + `app/schemas/llm_provider.py` (Pydantic In/Out/Update).
- **Router `app/api/agentes.py`** (sem prefixo de versão; auth `Depends(exigir_platform_admin)`; registrar em `app/main.py`):
  - `GET  /workspaces/{workspace_id}/agentes` — lista com canais vinculados + última atividade (null na Fase 1).
  - `POST /workspaces/{workspace_id}/agentes` — cria (+ canais, horários, prompt draft, provider/modelo, debounce).
  - `GET  /workspaces/{workspace_id}/agentes/{agente_id}` — detalhe completo.
  - `PUT  /workspaces/{workspace_id}/agentes/{agente_id}` — edita.
  - `DELETE /workspaces/{workspace_id}/agentes/{agente_id}` — soft delete (`deleted_at`) se houver histórico; hard delete se nunca usado.
  - Toggle: `PUT` com `status` (valida "1 ativo por canal" → **409** se conflito) ou `POST .../{agente_id}/toggle`.
- **Router `app/api/llm_providers.py`** (auth `exigir_platform_admin`; registrar em `app/main.py`):
  - `GET  /llm-providers` — providers ativos + modelos disponíveis (sem tokens).
  - `POST /llm-providers` · `PUT /llm-providers/{provider_id}`.
  - `POST /llm-providers/{provider_id}/token` — salva/atualiza token (cifra com Fernet em `llm_provider_tokens`); retorna só máscara.
  - `GET  /llm-providers/{provider_id}/token` — retorna só máscara.
  - `POST /llm-providers/{provider_id}/modelos` · `DELETE /llm-providers/{provider_id}/modelos/{modelo_id}`.

### Frontend
- **Rota:** `src/app/(plataforma)/admin/central-agentes/page.tsx` — `Tabs` HeroUI v3: **Agentes** | **Uso & Consumo** (placeholder na Fase 1) | **Providers & Modelos**. **Seletor de workspace** no topo (platform_admin vê todos via `listar_workspaces_autorizados`).
- **Componentes** em `src/components/admin/central-agentes/`:
  - `AgentList.tsx`, `AgentCard.tsx` (toggle inline otimista via `mutate`).
  - `AgentFormModal.tsx` (drawer `ws-sheet` + `Accordion` HeroUI: Identidade, Canais, **Modelo (cascata provider→modelo)**, Prompt, Horários, Habilidades, **Handoff (inclui "Tempo de debounce (segundos)", default 40, com tooltip)**, Limites — seções RAG/Sandbox/Exemplos desabilitadas com selo "em breve").
  - `HorariosFuncionamento.tsx` (grid 7 dias), `PromptEditor.tsx` (Fase 1: textarea + Salvar).
  - `LLMProviderManager.tsx` (aba Providers): lista de providers (status), editar token (campo senha mascarado, mostra só últimos 4), modelos por provider com toggle; **botões de seed rápido** "Adicionar OpenAI / OpenRouter / DeepSeek" que pré-preenchem `base_url` (usuário só cola o token).
- **Hooks (SWR, espelhando `use-meta-tokens.ts`):** `src/hooks/use-agentes.ts`, `src/hooks/use-llm-providers.ts`.
- **Menu:** adicionar `{ nome: "Central de Agentes", rota: "/admin/central-agentes" }` no grupo administrativo de `src/lib/contexto-layout.tsx` (perto da linha 170, ao lado de "Canais"); ícone `Bot` (lucide) na `barra-lateral.tsx`.

### Gates (Fase 1)
- `cd op7nexo-front && npx tsc --noEmit` sem regressão.
- `python -c "import app.main"` OK.
- `cryptography` **pinado explicitamente** em `requirements.txt` (hoje só vem transitivo via `python-jose[cryptography]==3.3.0` — não depender do extra de outra lib) e `LLM_TOKEN_ENC_KEY` provisionada no `.env`.
- Smoke httpx: criar provider + salvar token → **`GET /llm-providers/{id}/token` retorna apenas máscara, nunca o token completo** → criar agente (provider/modelo/debounce) → listar → ativar → 2º agente ativo no mesmo canal retorna **409** → DELETE.

### Critério de done
CRUD de agente e de providers/modelos funcionais; token só mascarado; regra "1 ativo por canal" validada; `tsc --noEmit` limpo; smoke httpx verde.

---

## FASE 2 — Worker de atendimento (core do agente) + debounce

**Objetivo:** agente intercepta inbound, **consolida mensagens picotadas (debounce)**, responde via LLM (provider do banco) ou faz handoff, registra tokens.

### Migration `077_agente_uso_e_conversa_ai.py`
- `agente_uso_tokens`: `agente_id` FK, `workspace_id` FK, `canal_id uuid null` FK, `modelo varchar`, `tokens_input int`, `tokens_output int`, `conversa_id uuid null FK crm_whatsapp_conversas(id)`, `escalado boolean default false`, `score_confianca float null`, `criado_em`. Índices `(workspace_id, criado_em)`, `(agente_id, criado_em)`.
- **ALTER `crm_whatsapp_conversas`** (após GATE `information_schema`): `ADD COLUMN IF NOT EXISTS ai_respondido boolean DEFAULT false`, `ai_escalado boolean DEFAULT false`, `ai_agente_id uuid NULL REFERENCES agentes(id) ON DELETE SET NULL`, `ai_score_confianca float NULL`. Atualizar `app/models/crm/conversa.py`.
- **Timer de debounce (DECIDIDO: reusar `next_run_at`):** `crm_message_jobs` já tem `next_run_at` e o worker já filtra `next_run_at <= NOW()` — **nenhuma coluna nova, nenhuma mudança no filtro do worker**. Sem migration adicional para o debounce.

### Backend — debounce (mensagens picotadas)
No hook de inbound, ao enfileirar `agente_reply` para uma `conversa_id`, fazer um **UPDATE atômico com guarda de status** (ver "Race condition no debounce" nos Riscos):
- `UPDATE crm_message_jobs SET next_run_at = NOW() + (agente.debounce_segundos || ' seconds')::interval, payload = :novo_payload WHERE conversa_id = :conversa_id AND job_type = 'agente_reply' AND status = 'pending';` — **o `status='pending'` é obrigatório** (impede resetar um job já pego pelo worker).
- Se o `UPDATE` afetar **≥ 1 linha:** timer resetado, lote consolidado.
- Se afetar **0 linhas** (não havia job pendente, ou o existente já está em `processing`): **inserir novo job** com `next_run_at = NOW() + debounce`. Não tentar atualizar de novo.
- O worker só pega `agente_reply` quando `next_run_at <= NOW()`, então mensagens picotadas ("oi", "tudo bem?", "preciso de ajuda") consolidam-se em **uma única** chamada ao LLM, com **todas** as mensagens do intervalo no contexto. Aplica-se igualmente a texto e áudio (default 40s, configurável por agente).

### Backend — serviços
- `app/services/llm_client_service.py` (`LLMClientService`): dado o `agente`, resolve `provider` + token e instancia `openai.OpenAI(base_url=..., api_key=...)`. **Resolução do token: DB primeiro** (`llm_provider_tokens`, decifrado com Fernet em memória), **fallback no `.env`** se não houver linha no banco. Decifra só no momento da chamada, nunca persiste o valor claro. Para `tipo=openai_compatible` o mesmo client serve OpenAI/OpenRouter/DeepSeek; `model = agente.modelo`.
- `app/services/agent_service.py` — orquestração de `processar_reply(job)`:
  1. Resolver agente ativo do `canal_id` (via `agente_canais.ativo`).
  2. **Horário** (`agente_horarios`, timezone do workspace; `zoneinfo`/`pytz`). Fora do horário → **handoff automático** (escala com contexto, sem chamar LLM).
  3. **Limite diário de tokens** (`SUM(agente_uso_tokens)` do dia) → se atingido, **handoff automático** imediato sem LLM.
  4. Contexto: **todas as mensagens inbound desde o último outbound** + últimas N de `crm_whatsapp_mensagens` (consolida o lote do debounce).
  5. (RAG = no-op na Fase 2; few-shot = no-op até Fase 4.)
  6. Montar prompt: prompt publicado + `blacklist_topicos` + tom/idiomas + contexto. Pedir **structured output JSON** `{resposta, score_confianca, intent}`. **JSON malformado/não-parseável → handoff automático** (trata como baixa confiança).
  7. Chamar via `LLMClientService`. Registrar uso em `ai_usage_log` (`feature='agent'`) **e** `agente_uso_tokens`.
  8. `score >= threshold` → envia pelo canal (dispatch por `canal_provider`: `evolution`/`waha`/`meta_cloud`.`enviar_mensagem_texto`); marca `ai_respondido=true`, `ai_agente_id`, `ai_score_confianca`.
  9. `score < threshold` → **handoff**: marca `ai_escalado=true`, `escalado=true` no uso; payload (transcript + intent + score + dados do contato) para fila humana (reusar `responsavel_id`/`equipe_id`/`historico_transferencias`); publica via `redis_pub.publish_whatsapp_event`.
- **Hook de entrada (sem alterar o fluxo):** em `whatsapp_crm_persistence.process_evolution_message`, pós-persistência de inbound (`direcao=='entrada'`, não-grupo, `from_me=False`, ~linha 399, junto a `sincronizar_paineis_apos_mensagem`), aplicar a lógica de debounce acima — dentro de try/except que **nunca** propaga erro.
- **Dispatcher:** estender `whatsapp_event_worker.process_next_whatsapp_jobs` para rotear `job_type='agente_reply'` → `agent_service.processar_reply(job)` (mesmo loop `FOR UPDATE SKIP LOCKED`, sem novo poller).
- **Pricing:** garantir linhas em `ai_model_pricing` para os modelos configurados (seed via migration ou painel `/ai/usage/pricing`).

### Backend — sandbox (dry-run, já na Fase 2)
- `POST /workspaces/{workspace_id}/agentes/{agente_id}/testar` — reusa **o mesmo código** do `processar_reply`, mas em dry-run: **não grava** `agente_uso_tokens`, **não envia** ao canal, **não marca** `crm_whatsapp_conversas`. Contrato: recebe `{mensagem, historico_simulado[]}` → retorna `{resposta, score_confianca, rag_chunks_usados (vazio na Fase 2), tokens_estimados}`. Custo de implementação ~zero (mesmo pipeline); evita publicar prompts às cegas durante 3 fases. *(O componente front `SandboxChat.tsx` que consome este endpoint fica na Fase 4.)*

### Gates (Fase 2)
- `python -c "import app.main"` e `import app.worker` OK.
- Smoke httpx: inbound **picotado** (3 mensagens em < debounce) gera **1** job/1 chamada com as 3 no contexto; caso **score alto** (resposta enviada, `ai_respondido=true`, linha em `agente_uso_tokens`); caso **score baixo** (`ai_escalado=true`, `escalado=true`); idempotência (não responde a `from_me=true`).
- Smoke httpx: `POST .../testar` retorna resposta e **nenhuma linha é gravada** (`agente_uso_tokens` inalterado, conversa não marcada, nada enviado).
- Smoke httpx (race condition): mensagem chegando **durante** o processamento de um job (status `processing`) **cria um novo job** corretamente, em vez de atualizar o job em processamento.
- Deploy do worker com `deploy.sh worker`.

### Critério de done
E2E documentado: mensagens picotadas consolidadas; **debounce sem race** (UPDATE com `status='pending'`; 0 linhas → novo job); sandbox `/testar` funcional sem gravar; resposta automática **ou** handoff; tokens nas duas tabelas; provider lido do banco; fluxo existente intacto.

---

## FASE 3 — RAG + base de conhecimento

**Objetivo:** agente consulta documentos indexados ao responder.

### Pré-requisito (GATE pgvector — ANTES de qualquer migration)
1. Disponibilidade: `docker exec postgres psql -U postgres -d <db> -c "SELECT * FROM pg_available_extensions WHERE name='vector';"`.
2. Se indisponível: **trocar a imagem** em `/root/infra/postgres/docker-compose.yml` de `postgres:16-alpine` para `pgvector/pgvector:pg16` (Debian, traz a extensão; o volume `postgres_data` persiste os dados); `docker compose up -d`. *(O `apt-get install postgresql-16-pgvector` do enunciado NÃO se aplica: Alpine não tem apt e seria efêmero.)*
3. Confirmar: `CREATE EXTENSION IF NOT EXISTS vector;` OK.
4. **Só então** rodar a migration que usa `vector(1536)`.

### Migrations
- `078_pgvector_extension.py` — `CREATE EXTENSION IF NOT EXISTS vector;` (isolada, gated).
- `079_agente_base_conhecimento.py` — `agente_base_conhecimento`: `agente_id` FK, `tipo varchar` (documento/url/faq), `titulo`, `conteudo text`, `embedding vector(1536)`, `criado_em`. Índice: `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);` (criável só após `CREATE EXTENSION`).

### Backend
- `app/services/embedding_service.py` — wrapper OpenAI `text-embedding-3-small` (1536 dims) com retry + cache Redis (`redis_pub._get_redis`, chave `emb:{model}:{sha256(text)}`). Chave da OpenAI: usar o token do provider **OpenAI** em `llm_provider_tokens` (embedding precisa de OpenAI real) — ver Decisão Aberta.
- Endpoints em `app/api/agentes.py`:
  - `POST .../{agente_id}/base-conhecimento` — arquivo (PDF/TXT) | URL | FAQ; extrai texto (PDF: lib a definir — ver Decisões), chunk, embed, grava.
  - `DELETE .../base-conhecimento/{kb_id}` · `GET .../base-conhecimento`.
- **AgentService passo 5 (ativar RAG):** embed da mensagem consolidada → `ORDER BY embedding <=> :q LIMIT K` (cosine) filtrando `agente_id` → injeta top-K chunks no prompt; chunks usados entram no payload de handoff.

### Frontend
- `BaseConhecimentoManager.tsx` (upload + lista de itens indexados + estados de processamento) na seção RAG do `AgentFormModal`.

### Gates (Fase 3)
- `pg_available_extensions` confirma `vector`; `CREATE EXTENSION` OK **antes** da migration 079.
- `tsc --noEmit` limpo.
- Smoke httpx: upload gera chunks com `embedding` não-nulo; pergunta coberta retorna resposta referenciando o conteúdo (retrieval > 0 chunks).

### Critério de done
Upload → chunks com embedding; retrieval relevante no contexto; resposta cita conteúdo indexado.

---

## FASE 4 — Observabilidade + self-improvement + polimento

**Objetivo:** dashboard de uso em tempo real, versionamento de prompt, sandbox, feedback loop, **few-shot dinâmico (self-improvement)**, alertas de consumo.

### Migration `080_agente_feedback_e_exemplos.py`
- `agente_conversa_feedback`: `agente_id` FK, `conversa_id` FK, `avaliador_tipo varchar` (atendente/cliente), `nota int CHECK (1..5)`, `observacao text`, `criado_em`.
- `agente_exemplos_feedback`: `id uuid PK`, `agente_id` FK, `pergunta text`, `resposta_incorreta text`, `resposta_correta text null`, `embedding_pergunta vector(1536) null`, `criado_em`. Índice hnsw em `embedding_pergunta` (`vector_cosine_ops`).

### Backend — endpoints (`app/api/agentes.py`)
- `POST .../{agente_id}/publicar` — cria `agente_prompts` `status=publicado` (`publicado_em`, `publicado_por`); demais viram histórico.
- `GET  .../{agente_id}/prompts` — histórico + diff textual entre adjacentes (`difflib`).
- `POST .../{agente_id}/reverter/{prompt_id}` — nova versão publicada com conteúdo do `prompt_id`.
- *(O endpoint `POST .../{agente_id}/testar` já foi implementado na Fase 2; aqui só entra o front `SandboxChat.tsx` que o consome — e na Fase 3 ele passa a popular `rag_chunks_usados`.)*
- `GET  .../{agente_id}/uso` — métricas do agente (filtros canal/modelo/data_inicio/data_fim).
- `GET  .../agentes/uso/dashboard` (ou reusar `/ai/usage/summary` com `feature='agent'`) — agregado do workspace: tokens in/out/total, custo (`ai_model_pricing`), nº de conversas, taxa de handoff (`escalado`), tempo médio de resposta, score médio.
- `POST .../{agente_id}/feedback` — grava `agente_conversa_feedback`. **Se negativo com `resposta_correta` fornecida:** gerar `embedding_pergunta` via `EmbeddingService` e gravar em `agente_exemplos_feedback`.
- `GET .../{agente_id}/exemplos` · `DELETE .../{agente_id}/exemplos/{exemplo_id}`.

### Backend — self-improvement (few-shot dinâmico)
- No `AgentService`, **após** o retrieval RAG de documentos: 2º retrieval em `agente_exemplos_feedback` (top-3 por similaridade com a `pergunta` atual, filtrado por `agente_id`). Injetar no system prompt como bloco few-shot: *"Exemplos de perguntas similares e como responder corretamente: …"*. Retroalimenta o agente sem fine-tuning — melhora conforme atendentes corrigem respostas ruins.

### Backend — alertas
- Ao registrar uso, comparar consumo do dia vs `limite_tokens_dia * alerta_threshold_pct/100`; ao cruzar, publicar notificação admin (canal a definir — ver Decisões).

### Frontend
- `UsoDashboard.tsx` — filtros (workspace/canal/modelo/agente/período) + cards + `Recharts LineChart`; `useSWR(..., { refreshInterval: 30000 })`; alerta visual ao cruzar threshold. (Modelo: `admin/tokens/page.tsx`.)
- `PromptEditor.tsx` — **Publicar** separado de **Salvar**; histórico em `Drawer` (`ws-sheet`) com reverter.
- `SandboxChat.tsx` — chat simulado via `/testar`.
- **Feedback na conversa existente:** thumbs up/down no componente de conversa (CRM atendimento, `src/components/crm/...` — localizar na execução); no thumbs-down, campo **"Resposta correta"** (opcional, recomendado) → alimenta `agente_exemplos_feedback`.
- **Seção "Exemplos de correção"** no `AgentFormModal` (listagem + exclusão).

### Gates (Fase 4)
- `tsc --noEmit` limpo.
- Smoke httpx: publicar/reverter prompt; `SandboxChat` consome `/testar` (dry-run da Fase 2) e exibe a resposta; dashboard por filtro; feedback negativo com resposta correta cria `agente_exemplos_feedback` com embedding; few-shot aparece no prompt do sandbox quando há exemplo similar; alerta dispara ao cruzar threshold.

### Critério de done
Dashboard correto por filtro; versionamento publica/reverte; sandbox não grava; feedback + exemplos gravam; few-shot dinâmico ativo; alertas disparam; `tsc --noEmit` limpo.

---

## Verificação ponta-a-ponta (resumo)

- **API up:** `python -c "import app.main"` / `import app.worker`.
- **Front:** `npx tsc --noEmit` por fase.
- **Smoke httpx** por fase (providers+token; CRUD agente; inbound picotado/score alto/baixo; upload+retrieval; publicar/reverter/sandbox/feedback+exemplos/dashboard) — padrão dos `*.mjs` já no repo (`/root/op7nexo-smoke.mjs`).
- **Deploy** sob `lock-deploy`; worker via `deploy.sh worker`, API/front via `deploy.sh both`.

---

## Decisões Abertas (responder antes de cada fase)

**Antes da Fase 1**
- Confirmar o **maior prefixo de migration** na branch ativa (`ls alembic/versions/ | grep -oE '^[0-9]+' | sort -n | tail -1`) — 074 aqui, mas 075–081 podem estar na branch de port não-mergeada. Renumerar.
- ✅ **Criptografia de `token_encrypted` (DECIDIDO: Fernet).** Tokens de LLM são de alto valor (fatura OpenAI/OpenRouter); plaintext no banco expõe tudo numa leitura direta. Usar `Fernet` (`cryptography` — confirmar/garantir no `requirements.txt`). **Provisionar antes da Fase 1:** gerar a chave com `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` e adicionar como `LLM_TOKEN_ENC_KEY` no `.env` do op7nexo-api. `token_encrypted` guarda o token cifrado; a API só devolve máscara (`_mask`: 6 primeiros + 4 últimos do token original); `LLMClientService` decifra em memória no momento da chamada e nunca persiste o valor decifrado.
- ✅ **Precedência de token (DECIDIDO: DB sobrepõe `.env`).** O banco (`llm_provider_tokens`) tem precedência; o `.env` permanece como **fallback** durante a migração (sem downtime se algum token ainda não foi migrado). Tokens do `.env` ficam "a migrar para o banco via admin" — **não remover** automaticamente.
- ✅ **Seletor de workspace (DECIDIDO: todos os ativos).** Lista todos os workspaces ativos via `listar_workspaces_autorizados` (platform_admin recebe todos). Sem filtro adicional.
- ✅ **Chave Fernet provisionada.** `LLM_TOKEN_ENC_KEY` gerada; adicionar ao `.env` do op7nexo-api antes da Fase 1.

**Antes da Fase 2**
- ✅ **Debounce (DECIDIDO: reusar `next_run_at`).** Sem coluna nova; o worker já filtra `next_run_at <= NOW()`. Default `debounce_segundos = 40` (sem teto rígido; configurável por agente).
- ✅ **Política off-hours / limite atingido (DECIDIDO: handoff automático).** Escala para a fila humana com contexto. (Configurável por agente; off-hours e limite podem ter políticas distintas no futuro, mas o default é handoff em ambos.)
- ✅ **Fallback de JSON de confiança malformado (DECIDIDO: handoff automático).** Não-parseável = trata como baixa confiança e escala, sem custo extra de LLM.
- **Score de confiança é auto-reporte do LLM** (structured output) — *caveat de confiabilidade aceito* (não há ground-truth; é um proxy). Sem redesenho nesta entrega.
- **(Gate de código, não decisão) Ponto único de hook:** confirmar em execução que `whatsapp_crm_persistence.process_evolution_message` (`direcao=='entrada'`, `from_me=False`, ~linha 399) cobre **todos** os providers (Evolution/WAHA/Cloud/Z-API).

**Antes da Fase 3**
- Aprovação para **trocar a imagem do Postgres** para `pgvector/pgvector:pg16` (restart do container `postgres`, janela de manutenção).
- **Chave de embedding:** usar o token do provider OpenAI de `llm_provider_tokens` (recomendado) ou variável `.env` dedicada? (`text-embedding-3-small` exige OpenAI real.)
- **Extração de PDF** (`pypdf`/`pdfplumber` — não estão em requirements) e **scraping de URL** (Firecrawl? `httpx`+parser?). Chunking (tamanho/overlap) e `K` do retrieval.

**Antes da Fase 4**
- Canal de **notificação de alerta** ao admin (e-mail? in-app? `redis_pub`?).
- Localização exata do **componente de conversa** no front para o feedback (`src/components/crm/...`).
- `/agentes/uso/dashboard` dedicado **vs** reúso de `/ai/usage/summary` (`feature='agent'`).
- **Few-shot:** top-K de exemplos (3) e limiar mínimo de similaridade para injetar? Limite de tokens do bloco few-shot.

---

## Fase Futura (documentada, não implementada agora)
- **Portal do cliente (owner do workspace):** frontend separado para o dono do workspace visualizar e configurar **seu próprio** agente (subconjunto da tela admin, escopo restrito ao seu `workspace_id`, auth `verificar_acesso_workspace`).

---

## Nota de encerramento (passo pós-aprovação)

> Após aprovação deste plano, executar (ações de escrita, fora do plan mode):
> 1. Gravar **este mesmo conteúdo** em `/root/op7nexo-api/PLANO_CENTRAL_AGENTES.md`.
> 2. Imprimir as **primeiras 130 linhas** do arquivo para confirmação.
>
> *Nenhum código de implementação é gerado neste plano — apenas a estrutura faseada.*
