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
meta_videos_catalog         -- catálogo de vídeos com source_url e poster HQ persistido no MinIO
```

### Migrations
- Numeradas: `001_` ... `047_` (último arquivo: 047_crm_whatsapp_channel_not_null; conferir no banco o que está de fato aplicado)
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
- UI: botão "Sync" na coluna Ações de contas Meta → progress bar durante sync → check/X ao finalizar
- Polling a cada 2s enquanto job ativo, cleanup automático 3s após done / 5s após error

### Filtros implementados
- ✅ Públicos: dropdown de campanha filtrando por `campaign_id`
- ✅ Públicos: `placements[].ctr` e `placements[].impressoes` calculados pelo backend (antes eram 0 fixo no hook)
- ⏳ Criativos: mesmo padrão, adicionar `campaign_id` + `adset_id` (próxima tarefa)

### Dívida conhecida — Meta Ads Públicos
- `demograficos[].alcance` retorna 0: `reach` não existe em `meta_publicos_insights` nem é solicitado à Meta API no breakdown demográfico; corrigir exige migration + sync (D1)
- `frequencia_media` não filtra por campanha: vem de `meta_insights_diarios` total; sem fonte agregada por `campaign_id` (D2)
- `campaign_id = 'ALL'` sentinel: embutido em sync + tabela + query; alterar exige migration + backfill (D3)

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

### UI `/administracao/contas-ads`
- Dialog de edição: componente `EditarContaDialog` centralizado em `src/components/administracao/contas-ads/editar-conta-dialog.tsx` (Radix UI Dialog, não Sheet lateral)
- Painel "Histórico de Sync" no dialog: exibe últimas 10 rodadas consumindo `GET /meta/sync/historico/{id}`
- Tabela: ícones de status na coluna "Última Atualização" (CheckCircle2/AlertTriangle/Clock/Loader2)

---

## GOOGLE ADS

### Páginas
- `/marketing/campanhas/google-ads` — dashboard Google Ads com abas: Visão geral, Campanhas, Grupos, Palavras-chave, Anúncios, Públicos
- Componente principal: `src/components/google-ads/pagina-google-ads.tsx`
- Seletor de conta: GlassSelect carrega `/workspaces/{wsId}/ads-accounts` filtrado por `plataforma === 'google'`; propaga `adsAccountId` para todas as abas

### Hooks
- `src/hooks/use-google-visao-geral.ts` — KPI, breakdown, QS, dadosDiarios
- `src/hooks/use-google-campanhas.ts`, `use-google-grupos.ts`, `use-google-palavras.ts`, `use-google-anuncios.ts`, `use-google-publicos.ts`
- Todos aceitam `adsAccountId?: string` como último parâmetro

### Rota de API
- `GET /google-ads/visao-geral?workspace_id&periodo&ads_account_id` 
- `GET /google-ads/campanhas?workspace_id&periodo&ads_account_id&tipo&status`
- Filtro de período usa **sobreposição** (`periodo_inicio <= :end AND periodo_fim >= :start`)

---

## CANAIS — WhatsApp (Evolution API)

### Base URL
`https://evo.op7franquia.com.br`

### Fluxo de conexão
1. Criar instância na Evolution API
2. GET `/instance/connect/{instance_name}` → retorna QR Code
3. Polling a cada 30s até status = connected
4. Exibir QR Code no Drawer do canal

---

## CADASTRO DE CLIENTES (workspaces)
- Lista: `/administracao/empresas/contas` (HeroUI Table) — só navega, não tem mais Modal.
- Cadastro/edição são PÁGINAS (não modal): `/administracao/empresas/contas/novo` e `/[id]/editar`.
- Form: `src/components/administracao/clientes/cliente-form.tsx` (HeroUI Tabs Cadastro/Módulos/Integrações + Input + Button); lógica em `src/hooks/use-cliente-form.ts` (autofill Receita Federal via `/api/cnpj/[cnpj]`, save POST/PUT + PATCH status).
- Padrão de referência ao converter outros cadastros de modal→página.

## CONTAS DE ANÚNCIOS (modal→página, parcial)
- **Editar** conta é PÁGINA: `/administracao/contas-ads/[id]/editar` (`src/components/administracao/contas-ads/editar-conta-page.tsx`; carrega por id via `GET /ads-accounts` + `.find`).
- **Nova** conta segue MODAL (`nova-conta-dialog.tsx`) — é wizard de importação Meta/Google, não cadastro simples. Decisão intencional.

## USUÁRIOS (modal→página)
- **Novo** e **Editar** usuário são PÁGINAS: `/administracao/usuarios/novo` e `/[id]/editar`
  (`src/components/administracao/usuarios/{novo,editar}-usuario-form.tsx`, HeroUI Input/Button/Switch).
- Lógica de vínculos de workspace reaproveitada de `src/lib/admin-users-edit.ts`.
- ⚠️ Listagem de usuários é `GET /usuarios`; mutações/vínculos são `/users/{id}...`. Não confundir.

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

### ✅ Implementado (2026-06-25) — Inteligência de IA: painel de análise da conversa (Fase 1)
- Painel "🤖 Análise IA" do contato (`painel-contato.tsx`) conectado a **dados reais**: resumo, interesse, observações + **termômetro** SVG (`termometro-lead.tsx`, quente/morno/frio por score 0-100). O proxy GET `conversations/route.ts` passa `resumoIa` + `temperatura`/`temperaturaScore`/`interesse`/`observacoes` (de `conversa.resumo_ia` + `contexto_ia`, servidos pela API). Campo `objetivo` no cadastro do agente (`central-agentes/page.tsx`) guia o "interesse". Backend: análise assíncrona no worker com o modelo do agente (migration 096 `agentes.objetivo`; job `conversa_analise`, independente do `ai_ativo`).

### 🔒 Implementado (2026-06-24) — Atendimento: teto de visibilidade + handoff de IA (Fase 1)
- **Teto por papel**: `company_agent` só vê/atende/transfere conversas onde é responsável; demais papéis veem TODAS. Enforçado na FastAPI (`GET /conversas`, `/conversas/{id}`→404, `/mensagens`→404). Lista e mensagens do chat já proxiam a FastAPI → teto cobre o front. Rotas BFF Postgres-direto restantes ganharam a cláusula: `conversations/arquivadas` (teto), `whatsapp/transfer` (atendente só as dele + `ai_ativo=false`), `conversations/[id]/assumir` (`ai_ativo=false` + não rouba de outro humano).
- **Handoff de IA**: assumir/transferir/iniciar desligam `ai_ativo` (humano assume → IA cala). O `transfer` antigo exigia admin-de-equipe (travava com 0 equipes) — substituído pela regra de papel. Backend: `app/services/crm_escopo.py` + `/reabrir` e `/remover-atribuicao` novos.

### ✅ Implementado (2026-06-24) — Central de Agentes: chave do agente por conversa (Switch)
- Switch (HeroUI v3) no compositor de `/crm/atendimento/conversas` (`src/components/crm/atendimento/input-mensagem.tsx`), acima do "+": liga/desliga o agente IA **por conversa** (estado `conversa.iaAtiva`, otimista + reverte em falha). Grava via `useAtualizarConversa` → proxy `PATCH /api/whatsapp/conversations/{id}/atualizar` (campo `iaAtiva` → coluna `ai_ativo`, SQL direto). O proxy GET (`conversations/route.ts`) agora mapeia `iaAtiva` da coluna real `ai_ativo` (antes hardcoded `true`). Backend: migration 091 + gate em `processar_reply` (default OFF). Desligado = humano cuida; ligado = agente responde só naquela conversa.

### ✅ Implementado (2026-06-24) — Central de Agentes: selo de falha do agente (handoff)
- Quando o agente IA escala (handoff sem responder), `painel-inbox.tsx` mostra um selo âmbar "⚠️ Agente: {motivo}" na conversa (mapa `AGENTE_HANDOFF_LABEL`: limite de tokens/baixa confiança/erro ao gerar/fora do horário/config inválida/falha no envio) + tooltip "assuma a conversa". Campos `aiEscalado`/`aiHandoffMotivo` em `ConversaApi` (mapeados de `ai_escalado`/`ai_handoff_motivo` no proxy GET `conversations/route.ts`). Backend: migration 093 + `_handoff` grava motivo, `processar_reply` limpa ao responder. Antes o handoff só ia pro log e o atendente via "sem resposta" sem saber o motivo.

### ✅ Implementado (2026-06-24) — CRM Atendimento: menu kebab + selo "Não lido" manual
- Botão de três pontinhos em cada item do inbox (`painel-inbox.tsx`) abre o `MenuContextoConversa` (favoritar/fixar/marcar não-lido/etiquetar/resolver); menu renderizado via **portal** (`createPortal(document.body)`) para escapar do `backdrop-filter`+`overflow:hidden` da coluna `.atd-col-bg`.
- **Marcar como não lido** grava `marcada_nao_lida` (backend migration 092) via proxy SQL `PATCH /conversations/{id}/marcar-nao-lido` (não mexe em `nao_lidas`); item mostra **selo vermelho "Não lido"** e fica em destaque, distinto do badge verde de mensagens reais. Entrar na conversa → `marcar-lido` limpa `nao_lidas` + `marcada_nao_lida`. GET (`conversations/route.ts`) mapeia `marcadaNaoLida`.

### ✅ Implementado (2026-06-25) — CRM Atendimento: filtros do inbox como icon-row + FilterX (desktop)
- `painel-inbox.tsx` (header) + `filtros-atendimento-v2.tsx`: no **desktop**, os 3 filtros (número/responsável/acompanhamento) viram **botões-ícone com popover** (`DropdownMenu` Radix — novo export `FiltrosDropdownsV2`) na icon-row do header; removidos o título "Conversas" e o badge "ao vivo". Busca ganhou botão **`FilterX`** que zera todos os filtros e fica verde quando há filtro ativo. Pills em 2 linhas; "Arquivadas" virou botão-ícone `Archive`. **Mobile mantém os `<select>` nativos** (redesenho é desktop-only).
- ⚠️ Gotcha: o filtro de **canal** (`canalSelecionadoId`/`onCanalChange`, default `'todos'`) vive **fora** do `FiltrosV2State` — o reset e o estado "verde" do FilterX precisam incluí-lo explicitamente.
- Só apresentação (lógica/handlers e `pagina-atendimento.tsx` intactos). Ícones **lucide** (Tabler não existe no projeto). Verificado ao vivo (Playwright). **Deployado prod 2026-06-25 (`production@41800f1`).**

### 🧩 Code-complete, INERTE (2026-06-24) — CRM Atendimento: filtros server-side V2 (`FILTROS_V2`)
- **Route handler** `GET /api/whatsapp/conversations`: sob `?v2=1`, repassa `canal_id/escopo/acompanhamento/tipo/arquivadas/nao_lidas/responsavel_id` ao FastAPI `GET /conversas` e **pula o filtro-em-memória pós-limit** (corrige bug de paginação). Caminho legado (sem `v2`) inalterado.
- `use-conversas.ts`: 6º arg opcional `V2Filtros` → caminho v2 com paginação real por **offset** (UI "carregar mais" é follow-up — `loadMore`/`hasMore` ainda não consumidos na página).
- `filtros-atendimento-v2.tsx` (novo) + `painel-inbox.tsx` (render condicional) + `pagina-atendimento.tsx` (flag `FILTROS_V2=false` + `usePersistedState`).
- **Default OFF** → zero regressão. Ao ligar: `EQUIPE` muda de equipe_id-based p/ "não é minha" (responsável-based). Backend exige o par `agent/crm-filtros-v2` (API). Spec: `docs/specs/crm-filtros-server-side` (na branch da API).

### ✅ Implementado (2026-06-13) — Insights de IA: badge de plataforma
- `InsightsIaTabela.tsx` ganhou coluna/badge **Plataforma (Meta/Google)** a partir do campo `modulo` que `/ai/insights` já retorna. Agora os insights de IA do Google também aparecem (gerados 3x/dia no worker, sem precisar abrir tela).

### ✅ Implementado (2026-06-12) — Consumo & Custo de IA (Fase 2)
- Aba "Consumo & Custo" em `/admin/ia`: KPIs (chamadas, tokens, custo USD/BRL com câmbio do dia), quebra por feature/modelo/workspace, filtro de período (7/30/90d) e editor da tabela de preços por modelo. Componente `src/components/admin/ConsumoIaPainel.tsx`, hook `src/hooks/use-ai-usage.ts`. API: `/ai/usage/summary|pricing|fx`.

### ✅ Implementado (2026-06-12) — Painel Central de IA
- Página `/admin/ia` (platform_admin): aba **Modelos & Chaves** (edita modelo/provider/base_url/chave por feature de IA, troca sem redeploy, chave mascarada, slot `agent` reservado) + aba **Insights de IA** (lista `ai_insights` agregados com tipo e modelo que gerou). Hook `src/hooks/use-ai-settings.ts` (SWR). Item de menu em Administração. API: `/ai/settings`, `/ai/insights`.
- Página dedicada `/admin/analises-ia` (read-only): só leitura das análises de IA, reusa o componente `src/components/admin/InsightsIaTabela.tsx` (compartilhado com a aba). Item próprio no menu Administração.

### ✅ Implementado
- Meta Ads: 5 abas com dados reais (Visão Geral, Campanhas, Conjuntos, Públicos, Criativos)
- Filtro de campanha em Públicos
- Migration 015: campaign_id em meta_publicos_insights
- Dropdown campanhas com Radix UI + scroll
- Botões Sincronizar/Ativar/Desativar em Contas Ads
- Migration 016: tabela meta_tokens
- Migration 017: removido workspace_id FK (tokens globais)
- Gestão de Tokens (página admin, CRUD) — sem filtro por workspace
- Cadastro de Conta Ads com select de token (carrega todos os tokens globais)
- Modal de Anúncios com player de vídeo nativo, poster HQ e métricas de retenção abaixo do player
- `/meta/insights/anuncios-performance` entrega `video_id`, `video_source_url`, `video_thumbnail_url` e `video_thumbnail_hq_url`

### ✅ Implementado (2026-05-13)
- CRM Atendimento v2: página glassmorphism com 3 colunas (Inbox | Chat | Contato)
- Hooks: useConversas, useMensagens, useEnviarMensagem, useTransferirConversa, useResolverConversa, useAssumirConversa, useEquipes, useAgentesDisponiveis
- API Routes: PATCH /conversations/[id]/status, POST /conversations/[id]/assumir, GET /whatsapp/agentes
- Componentes: PaginaAtendimento, PainelInbox, PainelChat, PainelContato, InputMensagem, ModalAssumir
- Migration: unificacao user_profiles + CRM atendimento v2 (novos status, equipes, RBAC)
- Fluxo de status: nova → em_atendimento → aguardando → resgate → resolvido → processando
- Assumir conversa da IA via modal ao clicar no input
- Reabertura: nova conversa criada quando lead manda msg em conversa resolvida
- IA como responsável (UUID de usuário), removido ia_ativa
- Filtro de conversas por etiqueta (OR, multi-select): componente `FiltroEtiquetas` (Radix Popover) no topo do PainelInbox; `useConversas` e o proxy `GET /conversations` repassam `etiqueta_ids` para a API; seleção persiste em F5 (usePersistedState `op7-nexo-atendimento-filtro-etiquetas`)

### ✅ Implementado (2026-05-13) — Adaptação schema real Python/FastAPI
- `docker-compose.yml` do front: adicionado `DATABASE_URL` apontando para postgres/op7nexo
- `src/lib/api-auth.ts`: atualizado para payload JWT da API Python (`sub`, `role`, `workspace_id`)
- APIs internas adaptadas de schema GoTrue (`auth.users`, `public.user_profiles`, `public.organizations`, `public.org_members`) para schema real (`public.users`, `public.workspaces`):
  - `/api/whatsapp/conversations` (GET)
  - `/api/whatsapp/conversations/[id]/status` (PATCH)
  - `/api/whatsapp/conversations/[id]/assumir` (POST)
  - `/api/whatsapp/agentes` (GET)
  - `/api/whatsapp/transfer` (POST)
  - `/api/whatsapp/messages` (GET)
  - `/api/whatsapp/media/upload` (POST)
  - `/api/whatsapp/context` (GET/DELETE)
  - `/api/whatsapp/stream` (SSE)
  - `/api/equipes` (GET/POST)
  - `/api/equipes/[id]` (GET/PUT/DELETE)
  - `/api/equipes/[id]/membros` (GET/POST/DELETE)
  - `/api/admin/usuarios` (GET/POST/PUT)

### ✅ Implementado (2026-05-13) — Realtime + Webhook
- Polling a cada 4s na página de atendimento (fallback imediato)
- SSE `/api/whatsapp/stream` conectado na página com indicador visual "ao vivo"
- API Python (`app/api/canais.py`): webhook `/webhook/evolution/{token}` processa `messages.upsert`
- API Python: salva contato, conversa e mensagem no banco; publica evento no Redis
- Regra implementada: conversa `resolvido` + nova msg de entrada → cria **NOVA** conversa (não reabre)
- Serviço `app/services/redis_pub.py` na API Python para publicar eventos no canal `whatsapp:events`
- Dependência `redis==5.2.1` adicionada à API Python
- **Bugfix crítico**: evento da Evolution chega como `messages.upsert` (com ponto), mas código comparava com `MESSAGES_UPSERT` (underscore). Corrigido com `.upper().replace(".", "_")` em ambos os endpoints (`/webhook/evolution/{token}` e `/webhook/evolution/test`).

### ✅ Implementado (2026-05-15) — Grupos WhatsApp e @mentions
- Migration 033: `is_group`, `group_name` em `crm_whatsapp_conversas`; `participant_jid`, `participant_name`, `is_mentioned` em `crm_whatsapp_mensagens`
- Webhook detecta grupos via `@g.us` no `remote_jid`, extrai remetente real do `key.participant`
- Detecta `@mentions` comparando `mentionedJid` no `extendedTextMessage.contextInfo` com número do canal
- Upsert automático de contato do participant em mensagens de grupo
- API responde com campos `is_group`, `group_name` (conversa) e `participant_jid`, `participant_name`, `is_mentioned` (mensagem)
- Frontend exibe ícone 👥 + nome do grupo na inbox, nome do participant no chat, e badge @mention com destaque dourado

### ✅ Implementado (2026-05-28) — WhatsApp Web + CRM Fase 5
- `/crm/atendimento/conversas` carrega canais/números do workspace, filtra a inbox por canal e oculta conversas `resolvido` da aba ativa, deixando-as só em `Resolvidos`.
- Composer envia texto, imagem/documento e áudio gravado via upload `/canais/{canal_id}/upload-midia` + envio Evolution.
- Chat renderiza mídia inline, checks de status (`pending/sent/delivered/read/played/failed`), participante e menção em grupos.
- Painel do contato exibe lead/follow-up e permite criar ou marcar follow-up como feito via `/crm/followups`.
- BFF de WhatsApp valida acesso de workspace em `GET /me/workspaces` da API Python.

### ✅ Implementado (2026-05-29) — Realtime Redis/SSE
- `whatsapp-realtime` e `redis-buffer` usam `REDIS_URL` ou `REDIS_PASSWORD` compartilhado com a infra.
- `GET /api/whatsapp/stream` degrada para polling quando o Redis não consegue assinar, evitando `ERR_HTTP2_PROTOCOL_ERROR`.

### ✅ Implementado (2026-06-03) — Fase 1: Identidade visual de contato

- `conversations/route.ts`: `resolveContactNome` e `resolveContactTelefone` — JIDs `@lid` → "Contato WhatsApp"; `@g.us` → `group_name`; telefone só para `@s.whatsapp.net`/`@c.us` com prefixo 55
- `painel-inbox.tsx`: título de conversa usa `groupName` para grupos, elimina JID raw como fallback
- `painel-chat.tsx`: telefone no header só exibe quando `contato.telefone != null`; avatar usa `groupAvatarUrl` para grupos
- `docker-compose.yml`: `ports 3000:3000` → `expose 3000` (Traefik reverse proxy)

### ✅ Implementado (2026-06-03) — Fase 2a.1: Avatar no painel lateral

- `painel-contato.tsx`: header usa `isGroup ? groupAvatarUrl : contato.avatarUrl`; renderiza `<img>` quando URL disponível; `displayName` respeita `groupName`; omite "Telefone Lead" para grupos

### ✅ Implementado (2026-06-05) — Meta Ads Visão Geral: ajustes de saldo e filtros

- `saldo-card.tsx`: card compact exibe soma dos saldos quando múltiplas contas filtradas; hover lista cada conta com nome, valor e ícone pix/visa/cartão
- `tabela-contas.tsx` + `index.tsx`: coluna Saldo cruza `metaAccountId` com `FinanceiroConta.accountId` para usar saldo real do endpoint financeiro; coloração por `alertState` (critical → coral, warning → ouro)
- `filtros-meta.tsx` + `pagina-meta-ads.tsx`: filtro de contas com largura dobrada (botão min-w-200, popover 560px); data/hora da última atualização exibida abaixo do filtro de datas

### ✅ Implementado (2026-06-05) — API Routes WhatsApp (adaptação schema)

- `/api/whatsapp/conversations/[id]/messages/route.ts`: adaptado para schema real Python/FastAPI
- `/api/whatsapp/conversations/iniciar/route.ts`: novo endpoint para iniciar conversas
- `/api/whatsapp/conversations/route.ts`: adaptado schema
- Melhorias de formatação de contatos e avatars em PainelInbox, PainelChat, PainelContato e InputMensagem

### ✅ Implementado (2026-06-06) — Design System v2 (HeroUI v3.1)

- `/design-system-v2`: biblioteca de referência do HeroUI v3.1 com 19 seções de componentes (preview renderizado + código copiável)
- Seções: Button, Input/TextField, Select, Checkbox, Switch, Slider, Chip, Avatar, Card, Modal, Dropdown, Table, Tabs, Pagination, Tooltip, Progress, Spinner, Autocomplete, DateField
- Todos usam a API compound correta do HeroUI v3.1 (dot notation: `Component.SubComponent`)
- `PageShell` e `ContentGrid` em `src/components/layout/` como layout components reutilizáveis
- CSS: ~40 novos imports de componentes HeroUI em `globals.css` (additive, produção intacta)

### ✅ Implementado (2026-06-07) — CRM Conversas Arquivadas

- Nova aba `/crm/atendimento/arquivado`: página de conversas resolvidas
- KPIs: total arquivadas, ganhas (convertidas), perdidas
- Filtro por status de resolução
- Componente: `PaginaArquivado` (`pagina-arquivado.tsx`)
- API Routes novas:
  - `/api/whatsapp/conversations/arquivadas` (GET)
  - `/api/whatsapp/conversations/arquivadas/[id]` (PATCH)
- API Route alterada:
  - `/api/whatsapp/conversations/[id]/status` (PATCH): integrada ao fluxo de arquivamento
- `use-resolver-conversa.ts`: suporte ao fluxo de arquivamento
- `pagina-atendimento.tsx`, `pagina-agentes.tsx`: integrados ao novo fluxo

### ✅ Implementado (2026-06-10) — Estúdio de Criativos: geração real (Fase 1)

- `src/components/demandas/design/GeradorCriativos.tsx` (tela `/marketing/demandas/design`): mock `setTimeout` substituído por geração real via `gpt-image-2`.
- Consome `POST /design/gerar-base` (SSE) pelo proxy `/api/proxy`, lendo `generation.completed`/`failed` por stream reader; `workspace_id` do `useWorkspace()`; token via `getToken()` (`@/lib/api-client`).
- Briefing montado de estilo+tom; formato da UI mapeado para `creative_format`; "Avançado" agora tem seletor de **Qualidade** (low/medium/high) no lugar dos controles fake (Flux/DALL-E/steps). Histórico da sessão clicável + erros amigáveis.
- **VIRADA (2026-06-10) → geração INTEGRADA é o padrão.** A IA (`gpt-image-2`) renderiza o criativo COMPLETO (texto + composição + logo integrados) — validado empiricamente, nível agência. O overlay DOM/Pillow virou modo de precisão secundário. `GeradorCriativos.tsx` reescrito: upload de **Modelo de exemplo** (referência) + **Logo**, campos de campanha/copy, toggle **Simples/Rico** (rico = bullets+selo+copy extra), formato, avançado (qualidade medium/high, estilo, `force_real_logo`). Liga ao `POST /design/gerar` (SSE) mandando logo+referência em base64; resultado já vem montado (sem overlay). Spec: `op7nexo-api/docs/specs/gerador-criativos/`.
- **Pagamento Stripe (2026-06-11)** `components/estudio-ai/CarregarTokens.tsx`: botão primário **"Pagar com cartão/PIX"** → `POST /estudio/checkout` → redireciona pro Stripe; no retorno (`?session_id=`) chama `/checkout/confirmar` e credita o saldo; recarga manual vira botão secundário. `?cancelado=1` → toast.
- **Admin Token Estúdio (2026-06-11)** `/admin/tokens` (Gestão de Tokens) virou 2 abas: **Conexões** (Meta/Google, conteúdo existente) + **Token Estúdio** (`components/admin/TokenEstudioAdmin.tsx`): resumo (em circulação/clientes/pendentes), confirmar recargas pendentes (`/estudio/admin/recargas-pendentes` → `/recarga/{id}/confirmar`), saldo por cliente + **Liberar tokens** (`/estudio/creditar`). Consome `/estudio/admin/saldos`.
- **Débito por geração (2026-06-11)** `GeradorCriativos.tsx`: busca `GET /estudio/saldo`, mostra saldo + custo (reverso 3 / alta 2 / medium 1 × nº formatos) acima do botão Gerar; bloqueia o botão + link "Carregar tokens" sem saldo; trata `generation.failed saldo_insuficiente` e atualiza saldo após gerar. Modal/aviso do Modelo Reverso: análise grátis, geração = 3 tokens.
- **Estúdio AI no sidebar + Carregar Tokens (2026-06-11)** novo grupo **Estúdio AI** sob Marketing (em `contexto-layout.tsx`, abaixo de Campanhas): Criativos/Vídeos (só texto) + **Carregar Tokens** (`/marketing/estudio-ai/carregar-tokens`). Tela `components/estudio-ai/CarregarTokens.tsx`: saldo (`GET /estudio/saldo`), pacotes 50/100/250/500 + valor livre, **Carregar** → `POST /estudio/recarga` (pendente), histórico (`/estudio/transacoes`), seção admin (platform_admin) confirma recargas pendentes. `CreditCard` no `mapaIcones` da barra-lateral. 1 token = R$1.
- **Modelo Reverso refinado (2026-06-11)** painel reverso em `GeradorCriativos.tsx`: removidos os inputs duplicados (Personagem/Composição/Estilo/Tom/Objetivo); "Descrição da imagem (só o visual)"; **Paleta com harmonia** (cor primária + Complementar/Análogas → `harmonia()`) + botão **Padrão** (restaura paleta extraída via snapshot `paletaOriginalReverso`).
- **Refinamentos Estúdio (2026-06-11)** `EstudioCriativos` agora tem **3 abas** (+ **Histórico** = `HistoricoCriativos.tsx`, lista `GET /design/historico`, "Usar estrutura"/"Usar imagem"). `GeradorCriativos`: upload "Modelo & Marca" 280px (vê inteiro), botão **Limpar campos** (reset total), **salvar/carregar cores** no header (ícones + dropdown, `/design/paletas`, máx 10), box lateral vira **"Gerados hoje"** (`/design/historico?desde=hoje`). `GaleriaModelos`/`HistoricoCriativos`: thumb **9:16 object-contain** (imagem inteira, sem corte). Tudo workspace-scoped. Validado E2E no browser.
- **Histórico: apagar criativo (2026-06-12)** `HistoricoCriativos.tsx` ganhou **lixeira** ao lado de "Usar imagem" → **modal de confirmação** (Nielsen #3) → `DELETE /api/proxy/design/historico/{id}?workspace_id=` (soft-delete) → remove o card da grade, com loading/erro acionável.
- **Gestão de tokens admin — cancelar/remover/transferir (2026-06-12)** `components/admin/TokenEstudioAdmin.tsx` (aba Token Estúdio): botão **Cancelar** na recarga pendente; por cliente, breakdown "X comprado / Y grátis" + ações **Liberar** / **Remover** (cap removivel, desabilita se 0) / **Transferir** (cap transferivel + `<select>` destino). Consome `/estudio/recarga/{id}/cancelar`, `/estudio/remover`, `/estudio/transferir` e o breakdown de `/estudio/admin/saldos`. Concedido (grátis) é removível; comprado só transferível.
- **Brand Kit por workspace (2026-06-12)** nova tela **`/marketing/estudio-ai/brand-kit`** (`components/estudio-ai/BrandKit.tsx`, item no grupo Estúdio AI, ícone `Palette`): logo (upload/preview/remover), cores primária/secundária (color picker), fonte, tom de voz, regras "Sempre faça"/"Nunca faça". Consome `/design/brand-kit` (GET/PUT) + `/design/brand-kit/logo` (POST/DELETE). A marca entra **automaticamente** em toda geração (wiring no backend; upload de logo no Gerador ainda sobrepõe). Backend validado por curl.
- **Estúdio migrado p/ o menu (2026-06-11)** o estúdio (`EstudioCriativos`) ganhou rota própria **`/marketing/estudio-ai/criativos`** (item "Criativos" do grupo Estúdio AI agora linkado, ícone `Image`). A URL antiga `/marketing/demandas/design` **redireciona** (`next/navigation` redirect) pro novo lar; label morto "Design" removido do grupo Demandas. **Componentes ficam em `components/demandas/design/`** (migra só a rota). **Gating de token validado E2E:** `POST /design/gerar` em ws sem saldo → `generation.failed saldo_insuficiente`, **sem gerar** (custo medium 1 / alta 2 / reverso 3 confirmados nas mensagens). Front já desabilita o botão sem saldo.
- **F5 — aba Modelos (2026-06-11)** `marketing/demandas/design/page.tsx` agora renderiza `EstudioCriativos.tsx` (wrapper com 2 abas glass: **Gerar** + **Modelos**, ambas montadas p/ preservar estado). `GaleriaModelos.tsx`: consome `GET /design/modelos`, seções **Curados** (filtro por objetivo, cards com badge Vencedor + "porquê" da IA + "Usar estrutura") e **Meus modelos** (upload via `POST`, "Usar modelo", excluir via `DELETE`). `GeradorCriativos` ganhou prop `seedModelo` (estrutura → pré-preenche objetivo/densidade/textos; referência → seta Modelo de exemplo). Imagem de Meu modelo lida via `/api/proxy` (evita CORS). Validado E2E no browser.
- **Copy cirúrgica (2026-06-11)** `GeradorCriativos.tsx`: campo **"O que você quer anunciar?"** virou **hero** (realçado, badge "Principal", tooltip) e gatilho do botão master **"✨ Gerar textos"** → `POST /design/gerar-copy` preenche headline/sub/cta (+bullets/selo/copy no rico) de uma vez, **sobrescrevendo**. Novo **"Refinar direção (opcional)"** recolhido com **Público-alvo** (`audience`) + **Tom de voz** (chips `tone`), enviados na copy e na geração de imagem. ✨ por campo continua (`/design/melhorar-copy`). Helper `Tip` (tooltip hover) em **todos** os campos/botões.

### ✅ Implementado (2026-06-24) — Central de Agentes: Fase 1 (UI, platform_admin)
- Nova rota **`/admin/central-agentes`** (`src/app/(plataforma)/admin/central-agentes/page.tsx`), item no grupo Administração (ao lado de "Central de IA"). 3 abas (tab bar custom, sem HeroUI Accordion — não existe na v3): **Agentes** (tabela `WSTable` + Sheet de criar/editar: provider→modelo em cascata, canais multi-select, prompt rascunho, horários, threshold/debounce/limites; toggle ativo/inativo com **409** "1 agente ativo por canal"; soft delete), **Providers & Modelos** (token mascarado + salvar, add/remover modelos), **Uso & Consumo** (placeholder Fase 4). Seletor de workspace no topo (`useWorkspace`).
- Hooks `src/hooks/use-agentes.ts` e `src/hooks/use-llm-providers.ts` (padrão imperativo useState/useCallback + `api-client`, igual `use-meta-tokens`). Consomem `/workspaces/{id}/agentes/*` e `/llm-providers/*`. `tsc --noEmit` sem regressão (erros restantes são pré-existentes). Backend = Fase 1 da Central de Agentes (migrations 084/085). Ícone Bot no menu = ajuste cosmético pendente.
- **Fase 3 (RAG) front:** `src/components/admin/central-agentes/BaseConhecimentoManager.tsx` + hook `src/hooks/use-base-conhecimento.ts` — seção "Base de conhecimento (RAG)" no form do agente (só em edição; indexar FAQ/Documento/URL + listar/remover). Consome `/agentes/{id}/base-conhecimento`. PDF não suportado (colar texto). `tsc` sem regressão.
- **Fase 4 front:** `src/components/admin/central-agentes/UsoDashboard.tsx` + hook `src/hooks/use-agente-dashboard.ts` — aba **Uso & Consumo** com cards KPI (tokens/custo/chamadas/conversas/taxa handoff/score) + Recharts LineChart (tokens/dia) + seletor 7/30/90d + polling 30s. Consome `/agentes/uso/dashboard`. Botão **Publicar versão** no prompt (POST `/publicar`). `tsc` sem regressão. (Histórico/diff drawer e feedback pendentes.)

### ⏳ Em andamento / Próximas tarefas
1. Fase 2c: avatar de contatos `@lid` (depende de NOWEB Store — não implementado)
2. Filtro campaign_id + adset_id em Criativos
3. Sync automático ao cadastrar conta

### 🔴 Débito técnico conhecido
- APIs `/api/auth/*` (login, me, refresh) ainda referenciam schema GoTrue legado (`auth.users`, `public.org_members`, `public.organizations`). Não são usadas pelo front atual (que usa `/api/proxy` → API Python), mas precisam de adaptação futura ou remoção.
- APIs `/api/meta/*` e `/api/admin/organizacoes` ainda referenciam `org_id` e tabelas legadas; front usa proxy para API Python.
- Contatos `@lid` sem NOWEB Store nunca terão avatar — pendente Fase 2c.

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
└── 001-meta-sync-incremental-ui/spec.md — Sync incremental Meta Ads + dialog centralizado contas-ads
```

Para nova feature: `/speckit.specify [nome]` → cria `spec.md`, depois `/speckit.plan` e `/speckit.tasks`.

---

## COMO ATUALIZAR ESTE ARQUIVO

Sempre que implementar uma feature:
1. Mover item de "Em andamento" para "Implementado"
2. Adicionar novas regras de negócio descobertas
3. Registrar qualquer débito técnico identificado
4. Atualizar schema se migration foi aplicada
