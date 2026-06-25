# OP7NEXO — Context de Arquitetura e Negócio

> Atualizado: 2026-06-24
> Mantenha este arquivo atualizado conforme o sistema evolui.

> **Link público de conexão (2026-06):** o admin gera `POST /canais/{id}/link-conexao` e envia
> ao cliente; endpoints públicos sem auth `/public/conectar/{token}` (info/iniciar/status/parear)
> conectam canais Evolution/WAHA via QR ou pareamento por número. Tabela `canal_connect_tokens`
> (migration 090, índice parcial = 1 token ativo/canal). Núcleo `_conectar_evolution` /
> `_status_evolution_core(publico=)` extraído em `app/api/canais.py` (admin idêntico; regra de ouro
> só no modo público — não toca status administrativo, não ressuscita 'disconnected'). Consumo
> anti-hijack no webhook `process_evolution_connection_event`. Front: `/conectar/[token]`.
> Spec: `docs/specs/link-conexao-publico/`.

> **Transferência IA→humano (Fase 4, 2026-06):** o agente tem `agentes.codigo_responsavel`
> (FK users, migration 099). Quando definido, no **handoff** (`agent_service._handoff`, worker) a
> conversa é roteada para esse humano e ganha uma mensagem interna `remetente_tipo='sistema'` com
> o resumo do handoff (reusa a análise da Fase 1: `resumo_ia`/`contexto_ia`). Núcleo da
> transferência extraído em `whatsapp_crm_persistence.aplicar_transferencia` (compartilhado pelo
> endpoint humano `POST /conversas/{id}/transferir` e pelo worker — evita drift de
> `historico_transferencias`/`crm_conversation_assignments`). Opt-in: sem `codigo_responsavel`, o
> handoff só marca `ai_escalado` (comportamento antigo). Transferência por agente: `actor_user_id`
> nulo, `payload.source='agente.handoff'`.

## O QUE É O SISTEMA

SaaS de Marketing + CRM multi-tenant. Cada cliente é um **workspace**. O produto gerencia campanhas de Meta Ads, canais de comunicação (WhatsApp via Evolution API) e dados de performance.

**Cliente piloto:** Doutor Feridas (rede de franquias de saúde)
- Múltiplas unidades (Matriz, Osasco, SBC, etc.)
- Cada unidade tem sua própria conta de Meta Ads
- Um workspace agrupa todas as contas

---

## ARQUITETURA

```
op7nexo-api (Python/FastAPI · SQLAlchemy · Alembic · PostgreSQL)     op7nexo-front (Next.js)
├── /auth                                  ├── /admin
├── /meta                                  │   ├── contas-ads
│   ├── /ads-accounts                      │   ├── tokens
│   ├── /campanhas                         │   └── ...
│   ├── /publicos                          ├── /[workspace]
│   ├── /criativos                         │   ├── meta-ads
│   └── /tokens                            │   │   ├── visao-geral
├── /channels                              │   │   ├── campanhas
│   └── /whatsapp (Evolution API)          │   │   ├── conjuntos
│                                          │   │   ├── criativos
VPS: api.op7franquia.com.br               │   │   └── publicos
     nexo.op7franquia.com.br               └── ...
     evo.op7franquia.com.br (Evolution)
```

---

## BANCO DE DADOS (PostgreSQL)

### Multi-tenancy
- TODA tabela de dados tem `workspace_id UUID` com FK para `workspaces`
- TODA query de leitura filtra por `workspace_id` — nunca expor dados cross-tenant
- Soft delete padrão: `ativo BOOLEAN DEFAULT true`

### Tabelas principais

```sql
workspaces          -- tenant raiz
                    -- campos: id, nome, razao_social, cnpj, telefone_principal, telefone_responsavel, endereco(JSONB), ativo (telefones na migration 072)
ads_accounts        -- contas Meta Ads vinculadas ao workspace
                    -- campos: id, workspace_id, account_id, nome, token, valido_ate, ativo, plataforma
meta_tokens         -- tokens de acesso globais do admin (migration 016+017)
                    -- campos: id, nome, token, valido_ate, ativo
                    -- NÃO tem workspace_id — token pertence ao admin/agência, compartilhado entre todos os clientes
meta_campanhas_insights     -- dados de campanhas
meta_conjuntos_insights     -- dados de ad sets / conjuntos
meta_publicos_insights      -- dados de públicos (tem campaign_id desde migration 015)
meta_criativos_insights     -- dados de criativos
meta_videos_catalog         -- catálogo de vídeos com source_url, thumbnail_url e image_url_hq persistido no MinIO
criativo_carrosseis         -- Criativos 2.0: carrossel newsjacking (migration 083); director_json = roteiro do Diretor LLM (texto queimado pelo gpt-image-2)
criativo_carrossel_slides   -- slides do carrossel; cada um referencia criativo_geracoes (base/usage); formatos_json = url por formato
```

### Migrations
- Numeradas: `001_` ... `072_` (último: `072_workspace_telefones` — add telefone_principal/telefone_responsavel em workspaces)
- Localização: `/root/op7nexo-api/alembic/versions/` (NÃO existe `migrations/` — ver constituição 2.5)
- Sempre rodar após criar: `bash /root/deploy.sh api` + testar endpoint
- Migration 089: `group_avatar_fetched_at` em `crm_whatsapp_conversas` (TTL de re-fetch de avatar de grupo; encadeada em 086 — 087/088 reservados p/ pgvector adiado)
- Migration 092: `marcada_nao_lida` (bool) em `crm_whatsapp_conversas` — marcação manual "não lida" (selo vermelho no Atendimento), distinta do contador `nao_lidas`; `marcar-nao-lido` seta, `marcar-lido` limpa; encadeada em 091

### Avatares de contatos/grupos (foto de perfil na tela de conversas)
- Avatar é **fonte única** no worker job (`app/services/contact_avatar_enrichment.py`): re-hospeda a URL crua do CDN (pps/fbcdn, que expira) no MinIO (`whatsapp-avatars` → `/meta/storage/...`); falha transitória re-tenta sem gravar `*_fetched_at` (não envenena o TTL de 7d); "sem foto" zera URL efêmera legada → front cai nas iniciais
- Contato: `crm_whatsapp_contatos.avatar_url`/`avatar_fetched_at`. Grupo: `crm_whatsapp_conversas.group_avatar_url`/`group_avatar_fetched_at` (TTL, não mais guard por presença — evita busy-loop quando o provider devolve nome sem foto)
- `_enriquecer_contato_background` (canais.py) é **só nome** (nunca avatar); enriquecimento dispara por mensagem inbound (persistence enfileira job) + backfill de TODOS contatos/grupos na transição `connected` (`_disparar_backfill_avatares`) + endpoint `POST /canais/{id}/enriquecer-todos`
- Reset/backfill manual: `python -m scripts.backfill_avatares --dry-run|--apply [--include-null-tried]` (limpa pps + des-envenena + re-enfileira)

---

## META ADS — Regras de negócio

### Estrutura de dados Meta (hierarquia)
```
Account
└── Campaign (meta_campanhas_insights)
    └── Ad Set / Conjunto (meta_conjuntos_insights)
        ├── Público (meta_publicos_insights)  — filtro por campaign_id ativo
        └── Criativo (meta_criativos_insights) — filtro por campaign_id + adset_id (a implementar)
```

### Sincronização
- Sync manual: POST `/meta/sync/{account_id}` → retorna `{job_id, status: "pending"}` imediatamente (HTTP 202)
- Polling: GET `/meta/sync/job/{job_id}` → campos: status (pending|running|done|error), etapa_atual, progresso (0-100), totais, erro
- Sync automático: APScheduler no `op7nexo-worker`. **Spec 002 (Sync Inteligente)**: os crons ENFILEIRAM `sync_jobs` (não chamam sync inline) — `meta_sync_leve` 06/12/18h (tipo=leve), `meta_sync_pesado` 03h (tipo=pesado), `meta_insights_ia` +40min, `meta_sweeper` 15min. O worker executa com "nunca desistir": rate limit RE-AGENDA o job (`status='pending'`, `next_run_at` futuro, `attempts++`) — só desconexão da BM vira `error`+`sync_paused`. Claim atômico `FOR UPDATE SKIP LOCKED` + cap global `META_SYNC_MAX_PARALLEL_ACCOUNTS`; worker só processa `plataforma='meta'`.
- **Escopo (migration 074, `sync_jobs.tipo`)**: LEVE = só insights recentes 3d (~12 req/conta, pula catálogo/vídeos/públicos); PESADO = tudo (catálogo incremental + públicos); BACKFILL = tudo desde `periodo_sync_inicio`. `sincronizar_conta(..., escopo=)`.
- **Cliente quota-aware (`meta_graph.py`)**: `extract_buc_details` lê tier (`ads_api_access_tier`) + `estimated_time_to_regain_access` (header BUC, min→seg); rate limit espera o tempo informado pela Meta. Tier atual da app = `development_access` (quota baixa — solicitar Advanced Access resolve a raiz).
- **Sweeper**: enfileira backfill p/ conta com gasto+catálogo mas 0 insights/defasada, gate `last_success_at>12h` (não re-backfilla conta parada). Nota: conta com `amount_spent` lifetime mas 0 insights no período é conta PARADA legítima, não bug.
- Tabela `sync_jobs` persiste histórico de jobs — migration 018 (+ `tipo`/`next_run_at`/`attempts` na 074)
- **Sync incremental (migration 053)**: catálogo usa `updated_since` (unix ts) da Meta API baseado em watermarks salvos em `meta_sync_states.watermarks` — reduz ~80% das chamadas de catálogo em contas sem alterações
- **Histórico de sync**: tabela `meta_sync_log` (migration 053) registra cada execução com status, contagens, duração e request_count; endpoint GET `/meta/sync/historico/{account_id}`
- Após cadastro de conta: sync automático a implementar

### Filtros implementados
- ✅ Públicos: dropdown de campanha filtrando por `campaign_id`
- ⏳ Criativos: mesmo padrão, adicionar `campaign_id` + `adset_id` (próxima tarefa)

---

## TOKENS META ADS

### Regra de negócio
- Token é **global** — pertence ao admin/agência, não ao cliente (workspace)
- Cadastrado em **Gestão de Tokens** (/admin/tokens) com nome e validade
- Ao cadastrar Conta Ads, seleciona token do dropdown (lista todos os tokens ativos, sem filtro de workspace)
- Token único pode ser usado em múltiplas contas de múltiplos workspaces
- Status visual: Verde (ativo) / Amarelo (expira em < 30 dias) / Vermelho (expirado/inativo)
- GET /meta/tokens retorna todos — sem filtro de workspace_id

---

## CONTAS ADS

### Estados
- `ativo = true` → aparece em todos os filtros, dropdowns e relatórios
- `ativo = false` → invisível para o usuário final, só admin vê com `?include_inactive=true`
- Toggle via: `PATCH /meta/ads-accounts/:id/toggle`

---

## CANAIS — Meta Oficial (WhatsApp Cloud + Instagram)

Canais oficiais da Meta com conexão por **token manual** (MVP; login/OAuth atrás de flag).
Versão da Graph API centralizada em `settings.META_GRAPH_API_VERSION`.

- **WhatsApp Oficial** (`tipo=whatsapp_oficial`): `app/services/meta_cloud.py`. Config: `phone_number_id`, `waba_id`, `access_token` (write-only, redigido), `verify_token` (autogerado). Conectar = valida `GET /{phone}` + `subscribed_apps`. Webhook `GET/POST /webhook/meta/{token}` (challenge texto puro + HMAC `X-Hub-Signature-256`). Envio texto/template (erro `131047` → 409). Dedup por `wamid`.
- **Instagram Direct** (`tipo=instagram`): `app/services/instagram_cloud.py` (graph.instagram.com). Config: `ig_id`, `access_token`, `verify_token`. Conectar = valida `GET /{ig_id}`. Webhook `GET/POST /webhook/instagram/{token}` (formato `messaging`). Persiste com `instance="instagram"`, `remote_jid=IGSID` (sem migration). Dedup por `mid`.
- Stubs flag-gated (front): Embedded Signup (`NEXT_PUBLIC_META_EMBEDDED_SIGNUP`) e Instagram Login (`NEXT_PUBLIC_INSTAGRAM_LOGIN`).
- Spec: `docs/specs/instagram-direct/spec.md`.

## CANAIS — WhatsApp (Evolution Go)

### Base URL
`https://evo.op7franquia.com.br`

### Stack atual
- Evolution Go `evoapicloud/evolution-go:v0.7.1`
- Redis `evolution-redis:7.4`

### Fluxo de conexão
1. Criar instância na Evolution Go com `name` e `token`
2. Persistir `instance_name`, `instance_id` e `instance_token` em `config.evolution`
3. Chamar `POST /instance/connect` com `webhookUrl`, `subscribe: ["ALL"]` e `immediate: true`
4. Ler QR Code em `GET /instance/qr` e estado em `GET /instance/status`
5. Manter `evolution_instance_id` como nome determinístico `op7-{workspace_id}-{canal_id}` para compatibilidade com o CRM

### Webhook / realtime
- `POST /webhook/evolution/{token}` processa `Message`, `Receipt`, `Connected`, `LoggedOut` e `QRCode`
- `Message` cria/atualiza contato, conversa e mensagem
- `Receipt` atualiza o status da mensagem
- `whatsapp:events` é o canal Redis usado pelo SSE do front
- O payload bruto é salvo para auditoria e debug
- Normalizar eventos com `event.upper().replace(".", "_")` e tratar tanto o legado (`messages.upsert`, `messages.update`, `connection.update`) quanto o Go novo

### Reconciliação de status na listagem (2026-06)
- `GET /canais?validate_waha=1` reconcilia o `connection_status` real **dos dois providers**: `_reconciliar_waha_status` (WAHA) e `_reconciliar_evolution_status` (Evolution) em `app/api/canais.py`.
- Evolution: 1 chamada **read-only** `evolution.listar_instancias(timeout=5.0, retry=False)` (GET /instance/all) — **nunca** `/instance/connect` (re-arm storm). Mapeia open→connected / connecting / close→disconnected; anti-flap (não rebaixa connected→connecting); grava número (jid) só na transição p/ connected, com guard de tamanho (anti-LID). Falha de rede silenciada (mantém DB).

### Dedup de conversas (variante do 9º dígito BR)
- O mesmo celular aparece como 12 díg (legado, sem o 9) e 13 díg (atual); o envio manual gravava JID *bare* (sem `@s.whatsapp.net`). Ambos geravam contatos/conversas duplicados.
- Prevenção (em `whatsapp_crm_persistence.py`): helpers `_br_jid_candidates`/`_canonical_br_jid` (gate de celular, 5º díg ∈ 6-9). Inbound (`process_evolution_message`) tem ramo não-LID `_resolve_existing_br_conversation` que roteia para a conversa ativa da variante; o ramo `@lid` (`_resolve_lid_contact`) é separado e inalterado. Envio manual/template em `canais.py` faz lookup por candidato e grava JID canônico com sufixo.
- `_merge_duplicate_conversations`/`_move_conversation_children_to_canonical` movem as **9** tabelas-filhas (inclui `agente_uso_tokens`, `crm_conversa_etiquetas`, `crm_painel_cards` com tratamento de colisão).
- Consolidação de dados existentes: `scripts/consolidar_conversas_duplicadas.py` (dry-run read-only por default; `--apply` numa transação com `CREATE UNIQUE INDEX` como invariante).

## PADRÕES FRONT-END

### Stack
- Next.js (App Router)
- Tailwind CSS
- Radix UI (primitivos de UI — sempre preferir Radix antes de instalar lib nova)
- Lucide React (ícones)

### Convenções de arquivo
```
src/hooks/use-[recurso].ts          ← data fetching, lógica de estado
src/components/[modulo]/            ← componentes do módulo
src/app/admin/[recurso]/page.tsx    ← páginas admin
src/app/[workspace]/[rota]/         ← páginas por workspace
```

### Padrão de hook
```ts
// Sempre recebe workspace_id como param
// Sempre retorna { data, isLoading, error, refetch }
// Passa filtros como query params para a API
```

### Dropdowns/Selects com dados remotos
- Usar Radix UI Select com scroll
- Referência implementada: dropdown de campanhas em filtros de Públicos
- Sempre incluir estado de loading e "Todas" como opção padrão

---

## PADRÕES BACK-END

### Estrutura de endpoint padrão
```
GET    /meta/[recurso]?workspace_id=...&filtro=...
POST   /meta/[recurso]
PUT    /meta/[recurso]/:id
DELETE /meta/[recurso]/:id          ← soft delete (ativo=false)
PATCH  /meta/[recurso]/:id/toggle   ← inverte campo ativo
```

### Autenticação
- JWT Bearer token em todas as rotas
- `workspace_id` validado contra o token do usuário

---

## ESTADO ATUAL DO PROJETO (atualizar conforme progresso)

### ✅ Implementado (2026-06-25) — Inteligência de IA: followup automático (Fase 3)
- Campo `agentes.tempo_followup_min` (migration **098**): min sem resposta do lead → etiqueta automática (vazio = desligado). Job novo `scheduler._job_followup_etiqueta` (5min) → `followup_automacao.aplicar_followup_etiquetas` aplica a **etiqueta 'followup'** (= **fonte única** do estado; **NÃO toca `lead_status`**, que é lifecycle) nas conversas de canal com agente cujo lead parou de responder > `tempo_followup_min`; **idempotente** (pula quem já tem) + `find_or_create_etiqueta`. **Pausa sozinho** (lead responde → `ultima_direcao='entrada'` deixa de casar). Endpoints `GET /crm/followups/leads` + `/metricas` (montam `FollowupLead` de conversa+contato+`contexto_ia` da Fase 1; `status_followup` derivado de timing) + `PATCH /crm/followups/conversa/{id}/fechamento` (coluna nova `crm_whatsapp_conversas.followup_fechamento`). Front: página `/crm/followup` ligada ao real (mock→hook real), campo `tempo_followup` no cadastro. Fechamento (ganho/perda) persiste; temperatura read-only; pausar/override "em breve".

### ✅ Implementado (2026-06-25) — Inteligência de IA: feedback de qualidade (Fase 2)
- Tabela `agente_ajustes_resposta` (migration **097**): admin/supervisor sugere uma "resposta melhor" na tela de conversas → salva na Central do agente p/ curadoria + treino futuro (few-shot, **ainda NÃO injetado** — "melhorar depois"). `POST /conversas/{id}/ajuste-resposta` (CRM, `get_usuario_atual` + `eh_supervisor`; resolve o agente pelo canal da conversa). Curadoria: `GET`/`DELETE /workspaces/{ws}/agentes/{id}/ajustes` (platform_admin). Schemas `AjusteRespostaIn`/`AjusteRespostaOut`. Front: ícone sutil na bolha do agente (só admin) + modal (shadcn Dialog) + lista no drawer do agente.

### ✅ Implementado (2026-06-25) — Inteligência de IA sobre conversas (Fase 1: análise)
- `agent_service.analisar_conversa(db, agente, conversa_id)` roda análise com o **modelo do agente**
  (`chamar_json`) → `{resumo, temperatura (quente/morno/frio), temperatura_score 0-100, interesse,
  observacoes}`. Prompt de análise é constante no backend (`_ANALISE_INSTRUCOES`, versionado em
  `_ANALISE_PROMPT_VERSAO`) — fora do prompt editável do agente. Txn-safe (degrada p/ None).
- Trigger assíncrono: `enfileirar_analise` (job `conversa_analise` em `crm_message_jobs`; debounce
  20s + cooldown 180s/conversa) chamado em `process_evolution_message` só em msg de ENTRADA,
  **INDEPENDENTE do `ai_ativo`** (analisa atendimento humano também); `whatsapp_event_worker` ganha
  branch → `processar_analise` grava `conversa.resumo_ia` + `conversa.contexto_ia` (JSONB) + publica
  `whatsapp.refresh`. Campo novo `agentes.objetivo` (migration **096**) guia o "interesse".
  `contexto_ia` serializado em `ConversaOut`. Front: painel "Análise IA" real + termômetro SVG.

### ✅ Implementado (2026-06-25) — Central de Agentes: contexto temporal + diretrizes por workspace
- `agent_service._montar_system` injeta um **bloco CONTEXTO TEMPORAL** (via `_contexto_temporal()`, UTC-3 fixo sem tzdata): hoje por extenso + ISO + hora + instrução para calcular datas relativas (amanhã/semana que vem/daqui N dias). Vale p/ `/testar` e worker, em TODOS os agentes — **sem tool**.
- **Diretrizes por workspace**: nova tabela `agente_diretrizes_workspace` (migration **095**, 1 linha/workspace, `workspace_id` UNIQUE FK). Endpoints `GET/PUT /workspaces/{ws}/diretrizes` (platform_admin; schemas `DiretrizesIn` max_length 4000 / `DiretrizesOut`). `agent_service._diretrizes_workspace(db, ws_id)` injeta o texto no system prompt de todos os agentes do workspace, logo após o prompt do agente. **Txn-safe**: guard `has_table` cacheado + rollback (espelha `embedding_service._kb_table_existe` — diretriz nunca envenena a transação nem derruba o reply). Front: aba "Diretrizes" em `/admin/central-agentes` (`use-diretrizes` + textarea por workspace).
- Tuning de config (sem deploy, do ajuste anterior): threshold do "Teste" 0.5 + prompt publicado que orienta o `score_confianca` (auto-score do `deepseek-v4-flash` é ruidoso 0.3~1.0).

### ✅ Implementado (2026-06-13) — Auto-refresh de Insights de IA (Meta + Google)
- Insights de IA gerados automaticamente no `op7nexo-worker` para todos os workspaces com dados nos últimos 7 dias — antes só sob demanda. `scheduler._gerar_insights_ia()` (best-effort, sessão por workspace). **Spec 002**: agora em cron próprio (`meta_insights_ia` 06/12/18h+40min), pós-enfileiramento, não mais acoplado ao job de sync.
- `ia_insights.py`: KPIs+geração extraídos do endpoint para `gerar_insights_meta()` (reusado pelo endpoint `/meta/insights/ia` E pelo scheduler) e novo `gerar_insights_google()` (KPIs de `google_dados_diarios`: custo→spend, conversoes→leads; prompt `PROMPT_GESTOR_GOOGLE` sem reach/frequência). `gerar_e_salvar_insights`/`deve_regenerar`/`buscar_*` agora filtram por `modulo` (meta_ads|google_ads) p/ não colidirem no cache.
- Google Ads passa a ter insights de IA (`modulo='google_ads'` em `ai_insights`). Front: badge Plataforma (Meta/Google) na tabela de insights.

### ✅ Implementado (2026-06-12) — Consumo & Custo de IA (Fase 2)
- Migration 071: `ai_usage_log` (1 linha/chamada de IA, custo USD snapshot), `ai_model_pricing` (preços por modelo, editável; seed gpt-4o-mini/4.1-mini/4.1/image-2), `fx_rates` (cotação USD-BRL diária). Spec: `docs/specs/consumo-ia/`.
- `app/services/ai_usage.py::registrar_uso` — abre sessão PRÓPRIA (não recebe `db`), best-effort (nunca quebra a chamada de produto), custo congelado no registro. `app/services/fx.py` busca cotação do dia (AwesomeAPI, sem chave, timeout 3s, fallback última).
- Instrumentado: image_gen (base+integrada), ia_insights (passa a capturar `usage`), e endpoints de copy/vision em `criativos_design.py` (funções de copy/vision são puras → log no endpoint, onde há `workspace_id`).
- API `app/api/ai_usage.py` (platform_admin): `/ai/usage/summary` (totais + quebra por feature/model/workspace, USD+BRL), `/ai/usage/pricing` (GET/PUT), `/ai/usage/fx`. Front: aba "Consumo & Custo" em `/admin/ia`.

### ✅ Implementado (2026-06-12) — Painel Central de IA
- Migration 070: tabela `ai_settings` (config de IA por feature: insights/image/vision/copy/agent, global/platform_admin) + coluna `ai_insights.model_usado`. Spec: `docs/specs/painel-ia/`.
- Resolver `app/core/ai_config.py` (`get_ai_config(feature)`): DB-first → fallback `.env`, cache por-processo TTL 60s. Substitui leitura direta de `settings.openai_*` em ia_insights/image_gen/creative_vision/copy_assist → modelo/chave mutáveis sem redeploy.
- API `app/api/ai_settings.py`: GET/PUT `/ai/settings` (chave SEMPRE mascarada) + GET `/ai/insights` (agregado, platform_admin, filtro opcional por workspace_id). Front: `/admin/ia`.

### ✅ Implementado
- Meta Ads: 5 abas com dados reais (Visão Geral, Campanhas, Conjuntos, Públicos, Criativos)
- Filtro de campanha em Públicos
- Migration 015: campaign_id em meta_publicos_insights
- Dropdown campanhas com Radix UI + scroll
- Botões Sincronizar/Ativar/Desativar em Contas Ads
- Migration 016: tabela meta_tokens
- Migration 017: removido workspace_id FK (tokens globais)
- Migration 018: tabela sync_jobs para tracking de sync assíncrono
- Sync assíncrono: POST /meta/sync retorna job_id em <1s, background thread atualiza progresso
- Gestão de Tokens (página admin, CRUD) — sem filtro por workspace
- Cadastro de Conta Ads com select de token (carrega todos os tokens globais)
- Modal de Anúncios com vídeo: `AdVideo.source`, poster HQ no MinIO e retenção por quartis `P25/P50/P75/P100`
- `/meta/insights/anuncios-performance` retorna `video_id`, `video_source_url`, `video_thumbnail_url` e `video_thumbnail_hq_url`
- **HQ images fix (2026-05-20)**: criativos `object_type=SHARE` (posts impulsionados, sem `image_hash`) e capas de vídeo agora resolvem thumbnail via `/?ids={creative_id}&fields=thumbnail_url&thumbnail_width=1200` → 1080×1080. `hq_source` values: `adimage_minio` (hash presente), `creative_thumbnail_hq_minio` (SHARE/VIDEO). Guarda anti-regressão no UPSERT nunca sobrescreve HQ bom com fallback. Endpoint `POST /meta/reprocessar-imagens/{ads_account_id}` para backfill idempotente.

### ✅ Implementado (2026-05-13) — CRM Atendimento + Realtime
- Webhook `/webhook/evolution/{token}` processa eventos `Message`, `Receipt`, `Connected`, `LoggedOut` e `QRCode` da Evolution Go
- Salva contato (`crm_whatsapp_contatos`), conversa (`crm_whatsapp_conversas`) e mensagem (`crm_whatsapp_mensagens`)
- Regra: conversa `resolvido` + nova msg de entrada -> cria **NOVA** conversa (não reabre)
- Publica eventos no Redis (`whatsapp:events`) para consumo em tempo real pelo front
- Serviço `app/services/redis_pub.py` para publicação de eventos
- Dependência `redis==5.2.1` adicionada
- **Bugfix**: normalização de eventos Evolution Go/legado com `.upper().replace(".", "_")` antes do roteamento interno

### ✅ Implementado (2026-06-24) — Filtro de conversas por etiqueta
- `GET /conversas` aceita query param `etiqueta_ids` (repetível, `list[UUID]`). Quando informado, faz `JOIN Conversa.etiquetas` + `IN (...)` + `DISTINCT` → conversas com **pelo menos uma** das etiquetas (lógica OR). Isolamento por `workspace_id` mantido (etiqueta de outro ws não casa). Usado pela caixinha de filtro da tela de Atendimento (front).
- ⚠️ **Bug pré-existente (NÃO meu)**: `POST/DELETE /conversas/{id}/etiquetas/{etiqueta_id}` dá 500 — `c.etiquetas` vem `None` (relationship M2M; `_conversa_out` já tinha guard `or []`). Nenhum workspace tem etiquetas porque aplicar nunca funcionou. O filtro está correto (usa JOIN no SQL, não a coleção da instância), mas fica inerte até a relationship ser corrigida.

### ✅ Implementado (2026-05-15) — Grupos WhatsApp e @mentions
- Migration 033: `is_group`, `group_name` em `crm_whatsapp_conversas`; `participant_jid`, `participant_name`, `is_mentioned` em `crm_whatsapp_mensagens`
- Webhook detecta grupos via `@g.us` no `remote_jid`, extrai remetente real do `key.participant`
- Detecta `@mentions` comparando `mentionedJid` no `extendedTextMessage.contextInfo` com número do canal
- Upsert automático de contato do participant em mensagens de grupo
- API responde com campos `is_group`, `group_name` (conversa) e `participant_jid`, `participant_name`, `is_mentioned` (mensagem)
- Frontend exibe ícone 👥 + nome do grupo na inbox, nome do participant no chat, e badge @mention

### ✅ Implementado (2026-05-28) — CRM View Vetorial
- Migrations 045/046 criam e saneiam `vw_crm_whatsapp_vector_documents` para pipeline futuro de embeddings.
- A view expõe mensagens textuais/legendas e resumos de conversa por `workspace_id` + `embedding_status`, sem payload bruto.
- `crm_whatsapp_mensagens.embedding_status` passa a ter default SQL `'pendente'`.

### ✅ Implementado (2026-05-28) — CRM WhatsApp Canal Obrigatório
- Backfill de produção vinculou conversas/mensagens/eventos antigos ao canal `rudy_zap` (`workspace_id=9647ad83-20c6-416a-a5f1-527aee1e48ce`).
- Migration 047 torna `workspace_id` e `canal_id` NOT NULL em `crm_whatsapp_conversas`, `crm_whatsapp_mensagens` e `crm_whatsapp_eventos`.

### ✅ Implementado (2026-05-29) — Hardening Webhook Evolution
- `POST /webhook/evolution/{token}` agora só valida token/canal, persiste evento bruto + job e responde rápido.
- Worker passou a processar mensagens, receipts e connection events via `crm_message_jobs`; o webhook não faz mais processamento pesado em-request.
- Idempotência usa `event_hash` e `message_hash` canônicos estáveis; quando não há `evolution_msg_id`, campos instáveis do payload não entram na chave.

### ✅ Implementado (2026-05-29) — Redis Realtime/SSE
- API e front passaram a resolver Redis a partir de `REDIS_URL` ou `REDIS_PASSWORD`; o password vem de `/root/infra/redis/.env` via `env_file`.
- O SSE do WhatsApp degrada para modo polling quando o Redis não está disponível, evitando quebra feia da resposta.

### ✅ Implementado (2026-05-28) — Evolution Go Auth de Envio
- Endpoints de envio Evolution Go (`/send/text`, `/send/media`, template) usam `instance_token` como `apikey`.
- Fallback legado `/message/sendText/{instance}` removido porque a Evolution Go 0.7.1 retorna 404.

### ✅ Implementado (2026-05-28) — Workspaces do Usuário
- `GET /me/workspaces` serializa `ativo`, `criado_em` e `padrao` em cada workspace para o seletor do frontend.

### ✅ Implementado (2026-06-03) — Fase 1+2a: Identidade e avatares WhatsApp

- `waha_service.py`: `buscar_avatar_chat(session, jid, cfg)` e `buscar_nome_grupo(session, group_jid, cfg)` via WAHA API
- `contact_avatar_enrichment.py` (novo): jobs `contact_avatar_enrichment` e `group_enrichment`; TTL 7 dias; dedup por `avatar_fetched_at`; `@lid` ignorado sem NOWEB Store
- `whatsapp_event_worker.py`: rota dos job_types `contact_avatar_enrichment` e `group_enrichment` para o módulo acima
- `whatsapp_crm_persistence.py`: enfileira enrichment após upsert; fix `_upsert_contact` — nome só sobrescreve se anterior era JID raw; fix `process_evolution_receipt_event` — `instance` vem do payload WAHA (não `canal.evolution_instance_id`)

### ✅ Implementado (2026-06-05) — Dedup de mídias em _mensagem_out

- `_dedup_midias()` em `app/api/mensagens.py`: mensagens outbound gerariam dois registros em `crm_whatsapp_midia` (um no envio, outro pelo echo webhook da Evolution). A função deduplica por `tipo` em leitura, preferindo `storage_status='ready'` e desempatando por `created_at` mais antigo. Corrige players de áudio duplicados no painel de chat.
- Migrações 048–051: WAHA LID enrichment, media pipeline hardening, Meta sync state incremental.

### ✅ Implementado (2026-06-07) — Integração Google Ads (Fase 1+2+3+4)

- **Migration 058**: tabela `google_ads_credentials` (global, sem workspace_id) para credenciais OAuth2 + developer_token + manager_customer_id (MCC)
- **Migration 059**: tabelas de insights snapshot de janela (`google_campanhas_insights`, `google_grupos_insights`, `google_keywords_insights`, `google_anuncios_insights`, `google_publicos_insights`, `google_dados_diarios`)
- **Migration 062**: tabelas diárias por entidade (`google_grupos_diarios`, `google_keywords_diarios`, `google_anuncios_diarios`, `google_publicos_diarios`) + `valor_conversoes` em `google_dados_diarios`. As `*_insights` viram snapshot de janela (metadados + impression_share + quality_score, não-somáveis); métricas somáveis vêm das `*_diarios` fatiadas por data. Os endpoints agregam `SUM ... WHERE data BETWEEN ... GROUP BY entidade` e fazem overlay no snapshot (padrão Meta). Sync popula ambos; IS/QS ficam a nível de janela.
- **API**: `GET/POST/PUT/DELETE /google-ads/credentials` (platform_admin)
- **API**: `GET /google-ads/descobrir-contas?credential_id=` — lista contas acessíveis via MCC
- **API**: `POST /google-ads/vincular-conta` — cria ads_account (plataforma='google') + workspace_access + dispara sync
- **API**: `POST /google-ads/sync/{ads_account_id}` + `GET /google-ads/sync/job/{job_id}`
- **API**: `GET /google-ads/visao-geral|campanhas|grupos|keywords|anuncios|publicos|dados-diarios` (todos com workspace_id obrigatório)
- **Serviços**: `google_ads_client.py` (GoogleAdsClient com login_customer_id MCC, search_stream, 8 queries GAQL, conversão de micros correta) + `google_ads_sync.py` (upsert em lote)
- **Front**: 6 hooks atualizados para dados reais via SWR + hook `use-google-ads-credentials.ts` novo
- **Nota crítica**: QS sem `segments.date`, PMax usa `asset_group`, `conversions_value` NÃO divide por 1M

### ✅ Implementado (2026-06-08) — PMP: Edição de Plano e Tarefa (backend)

- **Migration 061**: tabela `pmp_unidades` (workspace_id FK, soft delete); `pmp_plans` ganha `ativo` (soft delete) e `unidade_id` (FK nullable); `pmp_tasks` ganha `prioridade VARCHAR(20) CHECK(baixa|media|alta)`
- **`PATCH /pmp/plans/{id}`**: edição parcial (UPDATE dinâmico via `model_fields_set`)
- **`DELETE /pmp/plans/{id}`**: soft delete; `GET /plans` e `GET /plans/{id}` agora filtram `ativo=true`
- **`POST /pmp/plans/{id}/duplicate`**: clona plano + tarefas ativas (status reset para TODO)
- **CRUD `/pmp/workspaces/{ws}/unidades`**: `GET`, `POST`, `PATCH /unidades/{id}`, `DELETE /unidades/{id}`
- **`PATCH .../tasks/{task_id}`**: body ampliado para `TaskUpdate` (todos os campos opcionais); retrocompat com drawer (status-only); RETURNING projeção completa com `prioridade`
- Spec: `docs/specs/pmp-edicao-plano-tarefa/` (spec.md, plan.md, tasks.md, contracts/)
- **Pendente**: deploy + rodada 2 de front

### ✅ Implementado (2026-06-10) — Estúdio de Criativos: base de dados (Fase 1)

- **Migration 063 + models** (`app/models/criativo/`): 7 tabelas multi-tenant — `criativo_logos`, `criativo_templates`, `criativo_estilos`, `criativo_brand_kits`, `criativo_geracoes`, `criativo_projetos`, `criativo_export_jobs`. Estilos/templates com `workspace_id NULL = global`.
- **Princípio**: `gpt-image-2` gera só a **base visual** (`criativo_geracoes`, com auditoria: model_snapshot/prompt_final/params_json/request_id/usage/error_code); o OP7NEXO monta o **criativo final editável** (`criativo_projetos`, com snapshots de brand kit/logo/template). Export = job no worker (`criativo_export_jobs`).
- **Geração da base (gpt-image-2) funcionando**: `app/services/image_gen.py` (`criar_geracao`+`executar_geracao`, `resolve_generation_size`, guardrail anti-texto/logo), `upload_validation.py` (Pillow), config dedicado `OPENAI_IMAGE_*` (chave separada do gateway de texto; base_url explícito `api.openai.com`). Rotas `app/api/criativos_design.py`: `POST /design/gerar-base` (SSE: created→completed|failed), `GET /design/gerar-base/{id}` (recuperação), `GET /design/estilos`. Validado por curl na API pública.
- **Montagem/export funcionando**: `app/services/criativo_render.py` (Pillow — base+scrim+headline/subtítulo/CTA+logo no tamanho do canal; **decisão MVP: síncrono, sem Chromium**; fontes DejaVu no Dockerfile). Endpoint `POST /design/exportar` (busca base no MinIO, normaliza logo best-effort, salva export em `workspaces/{ws}/criativos/exports/`, registra `criativo_projetos`). Validado por curl (PNG 1080² servido). Storage: `GET /meta/storage` agora aceita prefixo `workspaces/` (antes só `ads-accounts/`).
- Spec: `docs/specs/gerador-criativos/` (spec.md, plan.md, tasks.md, contracts/design-api.md). Deployado e verificado (alembic_version=063).
- **Assistente de copy cirúrgico (2026-06-11)** `app/services/copy_assist.py`: `gerar_pacote_copy` (1 chamada `json_object` → pacote headline/sub/cta +bullets/selo/copy no rico, coerente e sem repetição) e `melhorar_copy` (1 campo). Rotas `POST /design/gerar-copy` (botão master "Gerar textos") e `POST /design/melhorar-copy` (✨ por campo), ambas devolvem `usage`. Direção por objetivo (gatilho embutido) + `tone`/`audience` opcionais (também consumidos por `montar_prompt_integrado`). **NUNCA travessão** (`_sem_travessao` por campo). Validado por curl.
- **F5 — Modelos curados + Meus modelos (2026-06-11)** migration **065** `criativo_modelos` (curado global `workspace_id NULL` | manual do workspace), seed de 8 curados com `estrutura_json`+`ai_porque`. Rotas `GET/POST/DELETE /design/modelos` (`app/api/criativos_design.py`): GET = curados+meus (filtros nicho/objetivo/formato); POST salva Meu modelo (imagem em `workspaces/.../criativos/modelos/`); DELETE soft (curados read-only). Spec `docs/specs/gerador-criativos-modelos/`. ⚠️ migration original colidia com `064_google_ctr_overflow` (outro agente) → renumerada p/ 065. Validado E2E por curl.
- **Estúdio AI — Stripe Checkout (2026-06-11, TEST)** `app/api/estudio_stripe.py`: `POST /estudio/checkout` (Checkout Session R$1/token) + `/checkout/confirmar` (credita no retorno) + `/stripe/webhook` (assinatura verificada). Crédito **idempotente por session_id**. Chaves `stripe_*` só no `.env` (gitignored); `stripe` no requirements. Falta: criar webhook no Dashboard + pôr `whsec_` no .env; rotacionar chaves; ativar PIX. Validado: sessão criada (checkout.stripe.com).
- **Estúdio AI — admin de tokens (2026-06-11)** `GET /estudio/admin/saldos` (todos os workspaces+saldo) e `GET /estudio/admin/recargas-pendentes` (cross-workspace), `platform_admin`. Front: `/admin/tokens` virou 2 abas (Conexões + Token Estúdio = `TokenEstudioAdmin.tsx`: resumo, confirmar recargas, liberar tokens p/ clientes). Validado por curl.
- **Estúdio AI — débito por geração (2026-06-11)** `/design/gerar` debita tokens: reverso 3 / alta 2 / medium 1 (`custo_tokens` em `criativos_design.py`). Pré-check `estudio_wallet.tem_saldo` antes da OpenAI → sem saldo = `generation.failed saldo_insuficiente` (não gera); débito só no sucesso (`estudio_wallet.debitar`, referencia=generation_id); completed traz custo_tokens/saldo_tokens. Análise/copy grátis. Lógica de saldo centralizada em `app/services/estudio_wallet.py`. Validado E2E por curl (medium −1, bloqueio instantâneo sem saldo).
- **Estúdio AI — apagar criativo do histórico (2026-06-12)** `DELETE /design/historico/{geracao_id}?workspace_id=` (`criativos_design.py`): soft-delete (`CriativoGeracao.ativo=False`), multi-tenant (403 outro ws / 404 inexistente). `/design/historico` já filtra `ativo` → some da listagem; arquivo fica no MinIO. Validado por curl. Front: lixeira + modal no `HistoricoCriativos.tsx`.
- **Estúdio AI — gestão de tokens admin (2026-06-12)** migration **069** add `origem` em `estudio_token_transacoes` (concedido|comprado|consumo|remocao|transferencia, backfill). `estudio_wallet.buckets(ws)` = {saldo, comprado_restante, removivel, transferivel} (consumo grátis-primeiro; comprado é piso protegido). Endpoints `platform_admin`: `POST /estudio/recarga/{id}/cancelar` (pendente→cancelado, /transacoes esconde cancelado do cliente), `POST /estudio/remover` (até removivel), `POST /estudio/transferir` (origem→destino, até transferivel, crédito comprado no destino). `/admin/saldos` traz breakdown. Validado E2E por curl (cancelar/remover cap 400/transferir). Front `TokenEstudioAdmin.tsx`.
- **Estúdio AI — Brand Kit por workspace (2026-06-12)** `app/services/brand_kit.py` + `app/api/brand_kit.py` (`/design/brand-kit` GET/PUT + `/brand-kit/logo` POST/DELETE). Um kit por workspace em `criativo_brand_kits`/`criativo_logos` (tabelas **já existiam**, sem migration): cores, fonte, tom, regras "sempre/nunca", logo (MinIO `workspaces/{ws}/criativos/logos/{logo_id}.png`, alpha preservado). `/design/gerar` carrega o kit → `aplicar_no_spec` (preenche cores/tom/regras só onde o usuário não setou) + usa a logo salva quando não há upload; `montar_prompt_integrado` injeta visual_rules/forbidden_rules. Validado por curl (CRUD + logo + prompt contém cor/regras, sem gastar token). Spec `docs/specs/brand-kit/`. Front: tela `/marketing/estudio-ai/brand-kit`.
- **Estúdio AI — carteira de tokens (2026-06-11)** migration **067** `estudio_token_saldo` (1 linha/workspace) + `estudio_token_transacoes` (ledger). Router `app/api/estudio_tokens.py` (`/estudio`): `GET /saldo`, `GET /transacoes`, `POST /recarga` (pendente), `POST /recarga/{id}/confirmar` (**platform_admin** credita), `POST /creditar` (admin direto). 1 token = R$1; multi-tenant. Fase 1 = recarga manual/admin (gateway automático + débito por geração = fases seguintes). Spec `docs/specs/estudio-tokens/`. Nome distinto de `meta_tokens` (OAuth).
- **Modelo Reverso — descrição só-visual (2026-06-11)** `creative_vision._SCHEMA_PROMPT`: `descricao` descreve SÓ a cena visual (sem os textos; textos só em `conteudo_textual`); removidos do JSON os campos objetivo/estilo/tom/personagem/composicao. `image_gen._prompt_reverso` sem linhas de categoria + guarda "textos só da lista". Resolve duplicação (texto editado em 2 lugares). Validado: headline não aparece literal na descrição extraída.
- **Refinamentos Estúdio (2026-06-11)** migration **066** `criativo_paletas` (esquemas de cores 60/30/10 por workspace, máx 10). `GET/POST/DELETE /design/paletas` (POST bloqueia em 10; DELETE cross-tenant → 403) e `GET /design/historico` (gerações done do workspace + `?desde` p/ box diário; estrutura de params_json). **Tenant validado com 2 workspaces** (dado de A não vaza p/ B). Spec atualizada em `docs/specs/gerador-criativos-modelos/`.
- **Próximo**: persistir brand-kit/logos por workspace; templates reais (DB) com áreas seguras; partials progressivos; (opcional) Playwright WYSIWYG no worker. F5.2 ingestão Ad Library pública. Billing/vídeo em specs separados.

### ✅ Implementado (2026-06-24) — Central de Agentes: Fase 1 (schema + CRUD)
- **Migrations 084/085** (`down_revision` 083). **084**: `llm_providers`/`llm_provider_tokens`/`llm_provider_modelos` (seed OpenAI/OpenRouter/DeepSeek + modelos; token cifrado com **Fernet**, nunca devolvido inteiro — só máscara). **085**: `agentes` (provider_id+modelo, status, tom, idiomas[], blacklist_topicos[], threshold_confianca, `debounce_segundos`=40, limites/alerta), `agente_canais` (índice parcial `uq_agente_canal_ativo` = **1 agente ativo por canal**), `agente_prompts` (draft/publicado), `agente_horarios`, `agente_habilidades`. Models em `app/models/agente/`.
- **Routers platform_admin**: `app/api/llm_providers.py` (`/llm-providers/*` + token cifra/máscara) e `app/api/agentes.py` (`/workspaces/{id}/agentes/*` CRUD + `/toggle`; conflito de canal ativo → **409**; soft delete libera o canal). Cifra em `app/core/llm_crypto.py` (env `LLM_TOKEN_ENC_KEY`; `cryptography==49.0.0` pinado). Validado E2E (TestClient + clone de schema em DB scratch; 84/85 aplicam, head único). Worker/RAG/dashboard/feedback = fases 2-4. Spec `docs/specs/central-agentes-fase1.md`; plano `PLANO_CENTRAL_AGENTES.md`.

### ✅ Implementado (2026-06-24) — Providers: carregar modelos via token + provider opencode
- `POST /llm-providers/{id}/carregar-modelos` (`app/api/llm_providers.py`, schema `CarregarModelosOut`): decifra o token salvo → `httpx GET {base_url}/models` (openai-compatible) → **upsert** em `llm_provider_modelos` (não apaga existentes; filtro leve descarta ids não-chat: embedding/whisper/tts/dall-e/image/audio/etc.). Serve OpenAI/OpenRouter/DeepSeek/**opencode** (todos openai-compatible). **Migration 094**: seed provider `opencode` (`https://opencode.ai/zen/go/v1`, plano Go; base_url ajustável via `PUT /llm-providers/{id}`). Front: botão "Carregar modelos" na aba Providers → a cascata provider→modelo (já existente) mostra a lista viva.

### ✅ Implementado (2026-06-24) — Central de Agentes: Fase 2 (worker do agente + debounce)
- **Migration 086**: `agente_uso_tokens` (uso por chamada) + colunas `ai_respondido`/`ai_escalado`/`ai_agente_id`/`ai_score_confianca` em `crm_whatsapp_conversas` (ADD COLUMN IF NOT EXISTS; **não confundir** `ai_agente_id` com a coluna `agente` VARCHAR já existente).
- **`app/services/llm_client_service.py`**: resolve provider+modelo+token do banco (Fernet, decifra só em memória; fallback `.env`) e chama o LLM via client `openai` (json_object). **`app/services/agent_service.py`**: `gerar_resposta` (monta prompt + parse do JSON `{resposta,score_confianca,intent}`; JSON malformado → score 0 = handoff) + helpers `dentro_do_horario`/`tokens_usados_hoje`/`registrar_uso` (grava `agente_uso_tokens` + espelha `ai_usage_log` feature='agent').
- **Endpoint `POST /workspaces/{id}/agentes/{id}/testar`** (sandbox dry-run; não grava, não envia). Validado E2E (TestClient, LLM stubado; sandbox não grava, malformado→score 0, helpers OK).
- **Fluxo vivo integrado:** hook em `whatsapp_crm_persistence.process_evolution_message` (após commit; só `entrada`/não-grupo/agente ativo) → `agent_service.enfileirar_agente_reply` (debounce: UPDATE com guarda `status='pending'` por `payload->>'conversa_id'`, senão INSERT em `crm_message_jobs` job_type=`agente_reply`; reusa `next_run_at`). Branch `agente_reply` no `whatsapp_event_worker._process_job` → `agent_service.processar_reply` (resolve agente do canal, gates horário/limite→handoff, contexto das últimas mensagens, `gerar_resposta`; score≥threshold → **envia via Evolution** + marca `ai_respondido`/`ultima_mensagem` + `registrar_uso`; senão **handoff** marca `ai_escalado`). Validado E2E em DB scratch (debounce dedup, guarda de race, send-path, handoff, dispatch do worker — 9/9; redis best-effort).
- **Envio outbound (Fase 2.x):** `_enviar_resposta` faz dispatch por `canal.tipo` — **whatsapp_evolution**, **whatsapp_waha** (`config.waha.session`/`_waha_chat_id`) e **whatsapp_oficial** (Meta Cloud: `config.phone_number_id`/`access_token`, `to`=dígitos do jid). Instagram/Facebook/webhook → handoff. Qualquer erro de envio → handoff. Validado (unit dos 5 caminhos).
- **Robustez:** `processar_reply` faz handoff em **qualquer** falha de geração (não só `LLMConfigError`) — evita retry-loop/dead_letter.
- **PENDENTE:** envio Instagram/Facebook (hoje → handoff); seed de preço em `ai_model_pricing` (sem isso, custo no dashboard = 'sem_preco'); msg de saída persiste via echo fromMe do provider. **Deploy do worker exige `deploy.sh worker`** (não entra no `both`); migration deve subir junto do código (deploy.sh NÃO roda alembic).

### ✅ Implementado (2026-06-24) — Central de Agentes: Fase 3 (RAG + pgvector) [backend]
- **Migrations 087/088**: **087** `CREATE EXTENSION IF NOT EXISTS vector` (gate — falha se a imagem do Postgres não for `pgvector/pgvector:pg16`); **088** `agente_base_conhecimento` (chunks: `tipo` documento/url/faq, `titulo`, `conteudo`, `embedding vector(1536)`, índice **hnsw** `vector_cosine_ops`). Model `app/models/agente/agente_base_conhecimento.py` (coluna `embedding` NÃO mapeada — manipulada via SQL cru, sem pgvector-python).
- **`app/services/embedding_service.py`**: `embed` (OpenAI `text-embedding-3-small` 1536d; chave do provider OpenAI no banco, fallback `.env`; cache Redis best-effort), `chunk_text` (800/overlap 120), `indexar` (chunk+embed+INSERT `CAST(:v AS vector)`), `retrieve` (top-K `embedding <=> CAST(:q AS vector)`, guard "sem KB→[]", degrada a [] em qualquer falha). `agent_service.gerar_resposta` injeta os chunks no system prompt e retorna `rag_chunks_usados` (sandbox `/testar` agora mostra).
- **Endpoints** (`app/api/agentes.py`): `POST/GET/DELETE /workspaces/{id}/agentes/{id}/base-conhecimento` (POST: faq/documento por texto, url via fetch+strip HTML; **PDF não suportado** — enviar texto). Validado E2E em **pgvector isolado** (migrations 084..088; indexar/retrieve/injeção/endpoints — 10/10).
- ⚠️ **DEPLOY:** 087/088 exigem pgvector. **Antes do swap da imagem, migrar só até `086`** (`alembic upgrade 086`), NÃO `head` — senão 087 falha. Front (BaseConhecimentoManager) e Fase 4 pendentes.

### ✅ Implementado (2026-06-24) — Central de Agentes: Fase 4 parcial (versionamento de prompt + dashboard) [backend, SEM migration]
- **`app/api/agentes.py`** (usa tabelas existentes — `agente_prompts`, `agente_uso_tokens`, `ai_model_pricing`; **nenhuma migration** → deploy seguro no Postgres alpine atual). Endpoints platform_admin: `POST /agentes/{id}/publicar` (snapshot do rascunho → versão `publicado` com autor+timestamp), `GET /agentes/{id}/prompts` (histórico draft+publicadas, diff `difflib` entre publicadas adjacentes), `POST /agentes/{id}/reverter/{prompt_id}` (nova publicada com conteúdo do alvo + reflete no rascunho), `GET /workspaces/{id}/agentes/uso/dashboard` (totais tokens/custo via `ai_model_pricing`/conversas/handoff/score + série diária; filtros agente/canal/modelo/período). Validado E2E em scratch (publicar/histórico+diff/reverter/dashboard — 10/10).
- **PENDENTE Fase 4:** front (UsoDashboard + PromptEditor publicar/reverter); feedback de conversa (tabela `agente_conversa_feedback` — migration, agrupar c/ pgvector); few-shot dinâmico (`agente_exemplos_feedback` vector — depende de pgvector).

### ✅ Implementado (2026-06-24) — Central de Agentes: chave do agente por conversa (Switch)
- **Migration 091**: `ai_ativo BOOLEAN NOT NULL DEFAULT false` em `crm_whatsapp_conversas` — liga/desliga do agente **por conversa**, inicia DESLIGADO em todas (opt-in; antes o agente respondia todo contato de um canal ativo). Gate autoritativo em `agent_service.processar_reply` (`if not conversa.ai_ativo: return` — silencioso, sem handoff = humano cuida); `enfileirar_agente_reply` pula o enfileiramento quando desligado. Serializado em `ConversaOut`/`_conversa_out`. Front: Switch (HeroUI v3) no compositor de `/crm/atendimento/conversas` acima do "+", grava via proxy Next `/conversations/{id}/atualizar` (`iaAtiva`→`ai_ativo`, SQL direto).

### ✅ Implementado (2026-06-24) — Central de Agentes: marcação de falha (handoff) + resposta 1ª classe
- **Migration 093**: `ai_handoff_motivo VARCHAR(40)` + `ai_handoff_at` em `crm_whatsapp_conversas`. `agent_service._handoff` grava o motivo do handoff (`limite_tokens`/`baixa_confianca`/`erro_llm`/`fora_horario`/`config`/`envio_falhou`); `processar_reply` limpa (`ai_escalado=false`, `ai_handoff_motivo=NULL`) ao responder com sucesso. Serializado `ai_escalado`+`ai_handoff_motivo` em `ConversaOut`. Front exibe selo na conversa (inbox) com label do motivo — antes o handoff só ia pro log e o atendente via "sem resposta" sem saber.
- **Reforço (1ª classe):** `_enviar_resposta` retorna `(enviado, evolution_msg_id)`; o INSERT da resposta grava `evolution_msg_id` (Evolution) → habilita recibo de entrega/leitura. `_publish` ganhou `instance`/`messageType` (paridade com envio humano).

### ⏳ Em andamento / Próximas tarefas
1. Fase 2c: avatar de contatos `@lid` (depende de NOWEB Store — não implementado)
2. Filtro campaign_id + adset_id em Criativos
3. Sync automático ao cadastrar conta
4. Google Ads: UI para cadastrar credenciais em /admin/tokens e vincular contas em /administracao/contas-ads

### 🔴 Débito técnico conhecido
- Contatos `@lid` nunca terão avatar sem NOWEB Store habilitado (esperado)

---

## SPECS DOCUMENTADAS (spec-kit)

```
op7nexo-api/docs/specs/
├── auth-multitenancy/spec.md   — Auth JWT + hierarquia multi-tenant
├── meta-ads/spec.md            — Meta Ads sync + insights + scheduler
├── canais-entrada/spec.md      — Canais WhatsApp/webhook
└── gerador-criativos/spec.md   — Estúdio de Criativos (gpt-image-2 gera base; OP7NEXO monta criativo final)

op7nexo-front/docs/specs/
├── marketing/spec.md           — Meta Ads UI, filtros, insights IA
├── crm/spec.md                 — CRM painéis, follow-up, agenda, NPS
└── administracao/spec.md       — Usuários, canais, contas-ads, empresas
```

Para nova feature: `/speckit.specify [nome]` → cria `spec.md`, depois `/speckit.plan` e `/speckit.tasks`.

---

## Notificações (migration 100)

Notificações in-app genéricas. Tabelas: `notificacoes` + `notificacao_leituras` (leitura POR
usuário, broadcast sem fan-out) + `notificacao_config` (audiência por workspace×tipo).
- Service `app/services/notificacoes.py`: `criar_notificacao` resolve audiência (config ou
  default por papel), dedupe por `dedupe_key` (1 "viva" sem leitura), roda em SAVEPOINT (nunca
  derruba o chamador); `contar_nao_lidas`/`listar`/`marcar_*` filtram por papel (JSONB `@>`).
- Endpoints `app/api/notificacoes.py`: `GET /notificacoes`, `/contador`, `POST /{id}/lida`,
  `/marcar-todas-lidas`, `GET|PUT /config` (admin).
- Gatilhos: `channel_health.py::run_channel_health_check` → `canal_offline` (anti-spam Redis 12h,
  **roda no worker**); `whatsapp_crm_persistence.py` inbound → `mensagem_nova` (agregada por
  conversa). Realtime: polling no front + publish Redis `notifications:events`.
- Spec: `docs/specs/notificacoes/`. Deploy: precisa de `deploy.sh worker` (gatilho de canal).

---

## COMO ATUALIZAR ESTE ARQUIVO

Sempre que implementar uma feature:
1. Mover item de "Em andamento" para "Implementado"
2. Adicionar novas regras de negócio descobertas
3. Registrar qualquer débito técnico identificado
4. Atualizar schema se migration foi aplicada
