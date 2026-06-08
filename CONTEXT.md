# OP7NEXO — Context de Arquitetura e Negócio

> Atualizado: 2026-05-15
> Mantenha este arquivo atualizado conforme o sistema evolui.

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
```

### Migrations
- Numeradas: `001_` ... `061_` (último: `061_pmp_unidades_e_campos` — tabela `pmp_unidades`; coluna `ativo` e `unidade_id` em `pmp_plans`; coluna `prioridade` em `pmp_tasks`. Anterior: `060_matriz_investimento` — tabela `matriz_investimento`)
- Localização: `/root/op7nexo-api/alembic/versions/` (NÃO existe `migrations/` — ver constituição 2.5)
- Sempre rodar após criar: `bash /root/deploy.sh api` + testar endpoint

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
- Sync automático: APScheduler 3x/dia (06h, 12h, 18h Brasília) via `app/services/scheduler.py`
- Tabela `sync_jobs` persiste histórico de jobs — migration 018
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
└── canais-entrada/spec.md      — Canais WhatsApp/webhook

op7nexo-front/docs/specs/
├── marketing/spec.md           — Meta Ads UI, filtros, insights IA
├── crm/spec.md                 — CRM painéis, follow-up, agenda, NPS
└── administracao/spec.md       — Usuários, canais, contas-ads, empresas
```

Para nova feature: `/speckit.specify [nome]` → cria `spec.md`, depois `/speckit.plan` e `/speckit.tasks`.

---

## COMO ATUALIZAR ESTE ARQUIVO

Sempre que implementar uma feature:
1. Mover item de "Em andamento" para "Implementado"
2. Adicionar novas regras de negócio descobertas
3. Registrar qualquer débito técnico identificado
4. Atualizar schema se migration foi aplicada
