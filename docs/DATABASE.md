# DATABASE — op7nexo-api

Banco: **PostgreSQL**. ORM: **SQLAlchemy 2.0** (mapped columns). Migrations: **Alembic** (rodam automaticamente no startup).

Todas as tabelas têm `criado_em TIMESTAMPTZ DEFAULT now()` e `atualizado_em TIMESTAMPTZ DEFAULT now()` via `TimestampMixin`.

---

## ENUMs

### `role_usuario`
Controla o nível de acesso de cada usuário na hierarquia.

| Valor | Descrição |
|---|---|
| `platform_admin` | Acesso total ao sistema. Único role que pode criar workspaces, networks e outros admins |
| `network_admin` | Administrador de uma franqueadora (network). Enxerga todos os workspaces/companies da sua network |
| `network_viewer` | Visualizador de network. Acesso somente leitura, limitado às companies vinculadas via `user_company_access` |
| `company_admin` | Administrador de uma unidade (company) específica |
| `company_agent` | Agente operacional de uma company |

### `slug_modulo`
| Valor |
|---|
| `marketing` |
| `crm` |
| `management` |
| `performance` |

### `tipo_recurso`
| Valor |
|---|
| `conta_ads` |
| `numero_whatsapp` |

### `nivel_permissao`
| Valor |
|---|
| `view` |
| `edit` |
| `admin` |

---

## Tabelas

### `networks`
Franqueadoras / grupos de franquia.

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `id` | UUID PK | NOT NULL | `gen_random_uuid()` |
| `nome` | VARCHAR(255) | NOT NULL | Nome da network |
| `slug` | VARCHAR(100) UNIQUE | NOT NULL | Identificador URL-friendly |
| `descricao` | VARCHAR(500) | NULL | Descrição opcional |
| `ativo` | BOOLEAN | NOT NULL DEFAULT true | Soft delete |
| `criado_em` | TIMESTAMPTZ | NOT NULL | Auto |
| `atualizado_em` | TIMESTAMPTZ | NOT NULL | Auto |

---

### `workspaces`
Workspace de dados de uma franqueada específica (onde vivem os ads, insights, canais).

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `id` | UUID PK | NOT NULL | |
| `network_id` | UUID FK→networks | NULL | Vínculo com franqueadora (adicionado em migration 005) |
| `nome` | VARCHAR(255) | NOT NULL | Nome exibido |
| `razao_social` | VARCHAR(255) | NULL | Razão social da empresa |
| `cnpj` | VARCHAR(18) | NULL | CNPJ formatado |
| `endereco` | JSONB | NOT NULL DEFAULT `{}` | Endereço em formato livre |
| `ativo` | BOOLEAN | NOT NULL DEFAULT true | Soft delete |
| `criado_em` | TIMESTAMPTZ | NOT NULL | |
| `atualizado_em` | TIMESTAMPTZ | NOT NULL | |

**Índice:** `ix_workspaces_network_id` em `(network_id)`

---

### `workspace_modules`
Módulos habilitados por workspace (marketing, crm, etc.).

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `workspace_id` | UUID FK→workspaces | NOT NULL | |
| `modulo` | VARCHAR | NOT NULL | Slug do módulo |
| `ativo` | BOOLEAN | NOT NULL DEFAULT true | |

---

### `users`
Usuários da plataforma.

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `id` | UUID PK | NOT NULL | |
| `network_id` | UUID FK→networks | NULL | Network à qual o usuário pertence |
| `workspace_id` | UUID FK→workspaces | NULL | Workspace direto do usuário (adicionado em migration 005) |
| `nome` | VARCHAR(255) | NOT NULL | |
| `email` | VARCHAR(255) UNIQUE | NOT NULL | |
| `senha_hash` | VARCHAR(255) | NOT NULL | bcrypt |
| `role` | role_usuario | NOT NULL | Ver enum acima |
| `ativo` | BOOLEAN | NOT NULL DEFAULT true | Soft delete |
| `criado_em` | TIMESTAMPTZ | NOT NULL | |
| `atualizado_em` | TIMESTAMPTZ | NOT NULL | |

**Índice:** `ix_users_workspace_id` em `(workspace_id)`

---

### `companies`
Unidades franqueadas individuais dentro de uma network.

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `id` | UUID PK | NOT NULL | |
| `network_id` | UUID FK→networks | NOT NULL | ON DELETE RESTRICT |
| `nome` | VARCHAR(255) | NOT NULL | |
| `slug` | VARCHAR(100) UNIQUE | NOT NULL | |
| `cidade` | VARCHAR(100) | NULL | |
| `estado` | VARCHAR(2) | NULL | Sigla UF |
| `telefone` | VARCHAR(20) | NULL | |
| `ativo` | BOOLEAN | NOT NULL DEFAULT true | Soft delete |
| `criado_em` | TIMESTAMPTZ | NOT NULL | |
| `atualizado_em` | TIMESTAMPTZ | NOT NULL | |

---

### `user_company_access`
Tabela N:N — quais usuários têm acesso a quais companies.

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `id` | UUID PK | NOT NULL | |
| `usuario_id` | UUID FK→users | NOT NULL | ON DELETE CASCADE |
| `company_id` | UUID FK→companies | NOT NULL | ON DELETE CASCADE |
| `criado_em` | TIMESTAMPTZ | NOT NULL | |
| `atualizado_em` | TIMESTAMPTZ | NOT NULL | |

**Constraint:** `UNIQUE(usuario_id, company_id)`

---

### `ads_accounts`
Contas de anúncios de qualquer plataforma (Meta, Google, etc.).

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `id` | UUID PK | NOT NULL | |
| `workspace_id` | UUID FK→workspaces | NOT NULL | ON DELETE CASCADE |
| `plataforma` | VARCHAR(20) | NOT NULL | `'meta'`, `'google'`, etc. |
| `account_id` | VARCHAR(100) | NOT NULL | ID externo da plataforma (ex: `act_123456789`) |
| `account_name` | VARCHAR(255) | NULL | Nome da conta |
| `token_acesso` | TEXT | NULL | Token OAuth da conta (uso futuro) |
| `token_expira_em` | TIMESTAMPTZ | NULL | Expiração do token |
| `bm_id` | VARCHAR(100) | NULL | Business Manager ID (Meta) |
| `bm_token` | TEXT | NULL | Token do BM usado para sync |
| `status` | VARCHAR(20) | NOT NULL DEFAULT `'ativo'` | `'ativo'` \| `'inativo'` |
| `account_status` | INTEGER | NULL DEFAULT 1 | Status retornado pela Meta API (1=ativo) |
| `sincronizado_em` | TIMESTAMPTZ | NULL | Última sincronização bem-sucedida |
| `periodo_sync_inicio` | DATE | NULL | Data de início do período de sync histórico |
| `agrupamento` | VARCHAR(100) | NULL | Agrupamento customizado (ex: franquia, região) |
| `config` | JSONB | NOT NULL DEFAULT `{}` | Configurações extras em formato livre |
| `criado_em` | TIMESTAMPTZ | NOT NULL | |
| `atualizado_em` | TIMESTAMPTZ | NOT NULL | |

---

### `canais_entrada`
Canais de comunicação vinculados a um workspace (WhatsApp, Instagram, webhook, etc.).

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `id` | UUID PK | NOT NULL | |
| `workspace_id` | UUID FK→workspaces | NOT NULL | ON DELETE CASCADE |
| `tipo` | VARCHAR(30) | NOT NULL | `whatsapp_evolution` \| `whatsapp_oficial` \| `instagram` \| `facebook` \| `webhook` |
| `nome` | VARCHAR(100) | NOT NULL | Nome de exibição |
| `config` | JSONB | NOT NULL DEFAULT `{}` | Credenciais e configurações específicas do canal |
| `mensagem_boas_vindas` | TEXT | NULL | Mensagem automática inicial |
| `webhook_token` | VARCHAR(64) UNIQUE | NULL | Token gerado automaticamente para canais do tipo `webhook` |
| `status` | VARCHAR(20) | NOT NULL DEFAULT `'inativo'` | `'ativo'` \| `'inativo'` |
| `criado_em` | TIMESTAMPTZ | NOT NULL | |
| `atualizado_em` | TIMESTAMPTZ | NOT NULL | |

---

### `meta_insights_diarios`
Agregado diário de performance de uma conta Meta Ads.

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `id` | UUID PK | NOT NULL | |
| `ads_account_id` | UUID FK→ads_accounts | NOT NULL | ON DELETE CASCADE |
| `data` | DATE | NOT NULL | Dia do dado |
| `spend` | NUMERIC(10,2) | NOT NULL DEFAULT 0 | Gasto em reais |
| `impressions` | INTEGER | NOT NULL DEFAULT 0 | Impressões |
| `reach` | INTEGER | NOT NULL DEFAULT 0 | Alcance único |
| `clicks` | INTEGER | NOT NULL DEFAULT 0 | Cliques no link |
| `leads` | INTEGER | NOT NULL DEFAULT 0 | Total de leads (todas ações) |
| `cpl` | NUMERIC(10,4) | NULL | Custo por lead |
| `cpc` | NUMERIC(10,4) | NULL | Custo por clique |
| `cpm` | NUMERIC(10,4) | NULL | Custo por mil impressões |
| `ctr` | NUMERIC(10,4) | NULL | Taxa de cliques (%) |
| `frequencia` | NUMERIC(10,4) | NULL | Impressões / alcance |
| `leads_mensagem` | INTEGER | DEFAULT 0 | Leads via mensagem direta |
| `leads_cadastro` | INTEGER | DEFAULT 0 | Leads via formulário/pixel |
| `criado_em` | TIMESTAMPTZ | NOT NULL | |

**Constraint:** `UNIQUE(ads_account_id, data)` — upsert por dia.

**Índices:**
- `ix_meta_diarios_account` em `(ads_account_id)`
- `ix_meta_diarios_data` em `(ads_account_id, data)`

---

### `meta_campanhas_insights`
Métricas diárias por campanha Meta Ads.

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `id` | UUID PK | NOT NULL | |
| `ads_account_id` | UUID FK→ads_accounts | NOT NULL | ON DELETE CASCADE |
| `campaign_id` | VARCHAR(50) | NOT NULL | ID da campanha na Meta |
| `nome` | VARCHAR(255) | NULL | Nome da campanha |
| `status` | VARCHAR(30) | NULL | Status na Meta |
| `objetivo` | VARCHAR(50) | NULL | Objetivo (OUTCOME_LEADS, OUTCOME_SALES, etc.) |
| `data` | DATE | NOT NULL | Dia do dado |
| `spend` | NUMERIC(10,2) | DEFAULT 0 | |
| `leads` | INTEGER | DEFAULT 0 | |
| `impressions` | INTEGER | DEFAULT 0 | |
| `reach` | INTEGER | DEFAULT 0 | |
| `clicks` | INTEGER | DEFAULT 0 | |
| `ctr` | NUMERIC(10,4) | DEFAULT 0 | |
| `cpc` | NUMERIC(10,4) | DEFAULT 0 | |
| `cpm` | NUMERIC(10,4) | DEFAULT 0 | |
| `frequencia` | NUMERIC(10,4) | DEFAULT 0 | |
| `criado_em` | TIMESTAMPTZ | NOT NULL | |

**Constraint:** `UNIQUE(ads_account_id, campaign_id, data)`

**Índices:**
- `ix_meta_camp_insights_account` em `(ads_account_id)`
- `ix_meta_camp_insights_data` em `(ads_account_id, data)`

---

### `meta_anuncios_insights`
Métricas diárias por anúncio (nível ad) Meta Ads.

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `id` | UUID PK | NOT NULL | |
| `ads_account_id` | UUID FK→ads_accounts | NOT NULL | ON DELETE CASCADE |
| `ad_id` | VARCHAR(50) | NOT NULL | ID do anúncio na Meta |
| `adset_id` | VARCHAR(50) | NULL | ID do conjunto de anúncios |
| `campaign_id` | VARCHAR(50) | NULL | ID da campanha |
| `nome` | VARCHAR(255) | NULL | Nome do anúncio |
| `status` | VARCHAR(30) | NULL | Status |
| `creative_id` | VARCHAR(50) | NULL | ID do criativo |
| `thumbnail_url` | TEXT | NULL | URL do thumbnail |
| `tipo` | VARCHAR(20) | DEFAULT `'IMAGE'` | Tipo: IMAGE, VIDEO, CAROUSEL |
| `data` | DATE | NOT NULL | Dia do dado |
| `spend` | NUMERIC(10,2) | DEFAULT 0 | |
| `leads` | INTEGER | DEFAULT 0 | |
| `impressions` | INTEGER | DEFAULT 0 | |
| `reach` | INTEGER | DEFAULT 0 | |
| `clicks` | INTEGER | DEFAULT 0 | |
| `ctr` | NUMERIC(10,4) | DEFAULT 0 | |
| `cpc` | NUMERIC(10,4) | DEFAULT 0 | |
| `cpm` | NUMERIC(10,4) | DEFAULT 0 | |
| `frequencia` | NUMERIC(10,4) | DEFAULT 0 | |
| `criado_em` | TIMESTAMPTZ | NOT NULL | |

**Constraint:** `UNIQUE(ads_account_id, ad_id, data)`

**Índice:** `ix_meta_ad_insights_account` em `(ads_account_id)`

---

### `meta_publicos_insights`
Breakdowns demográficos e de placement Meta Ads.

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `id` | UUID PK | NOT NULL | |
| `ads_account_id` | UUID FK→ads_accounts | NOT NULL | ON DELETE CASCADE |
| `data` | DATE | NOT NULL | Dia do dado |
| `breakdown_type` | VARCHAR(20) | NOT NULL | `'demographic'` ou `'placement'` |
| `breakdown_value` | VARCHAR(50) | NOT NULL | Para demographic: `'25-34\|male'`. Para placement: `'facebook\|feed'` |
| `leads` | INTEGER | DEFAULT 0 | |
| `spend` | NUMERIC(10,2) | DEFAULT 0 | |
| `impressions` | INTEGER | DEFAULT 0 | |
| `clicks` | INTEGER | DEFAULT 0 | |
| `ctr` | NUMERIC(10,4) | DEFAULT 0 | |
| `cpl` | NUMERIC(10,4) | DEFAULT 0 | |
| `criado_em` | TIMESTAMPTZ | NOT NULL | |

**Constraint:** `UNIQUE(ads_account_id, data, breakdown_type, breakdown_value)`

---

## Relações entre tabelas

```
networks (1) ──── (*) workspaces
networks (1) ──── (*) companies
networks (1) ──── (*) users (via network_id)

workspaces (1) ──── (*) workspace_modules
workspaces (1) ──── (*) ads_accounts
workspaces (1) ──── (*) canais_entrada
workspaces (1) ──── (*) users (via workspace_id)

ads_accounts (1) ──── (*) meta_insights_diarios
ads_accounts (1) ──── (*) meta_campanhas_insights
ads_accounts (1) ──── (*) meta_anuncios_insights
ads_accounts (1) ──── (*) meta_publicos_insights

users (*) ──── (*) companies  [via user_company_access]
```

---

## Histórico de migrações

| Revisão | Descrição |
|---|---|
| `001` | Schema inicial: networks, companies, users, user_company_access, modules, plans |
| `002` | Tabela workspaces + workspace_modules |
| `003` | Tabela canais_entrada |
| `004` | Colunas Meta em ads_accounts: bm_token, token_expira_em, sincronizado_em, periodo_sync_inicio, account_status |
| `005` | workspace_id em users + network_id em workspaces + índices |
| `006` | Colunas extras em meta_insights_diarios (cpc, cpm, ctr, etc.) + tabelas meta_campanhas_insights, meta_anuncios_insights, meta_publicos_insights |
| `007` | Coluna agrupamento VARCHAR(100) em ads_accounts |
