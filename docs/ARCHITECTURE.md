# ARCHITECTURE — op7nexo-api

## Stack e versões

| Componente | Versão |
|---|---|
| Python | 3.12 |
| FastAPI | 0.115.5 |
| Uvicorn | 0.32.1 |
| SQLAlchemy | 2.0.36 |
| Alembic | 1.14.0 |
| psycopg2-binary | 2.9.10 |
| Pydantic v2 | 2.10.3 |
| pydantic-settings | 2.6.1 |
| python-jose | 3.3.0 |
| bcrypt | 5.0.0 |
| httpx | 0.28.1 |
| APScheduler | 3.11.2 |
| openai SDK | >=1.0.0 |

Banco: **PostgreSQL** (container `postgres` via Docker Compose).

## Estrutura de pastas

```
op7nexo-api/
├── app/
│   ├── main.py                  # Entrypoint FastAPI — registra routers, CORS, lifespan
│   ├── api/
│   │   ├── auth.py              # POST /auth/registro, /auth/login, GET /auth/me
│   │   ├── users.py             # CRUD usuários + vínculo companies
│   │   ├── workspaces.py        # CRUD workspaces + módulos
│   │   ├── networks.py          # CRUD networks (franqueadoras)
│   │   ├── companies.py         # CRUD companies (unidades franqueadas)
│   │   ├── ads_accounts.py      # CRUD contas de anúncios (todas plataformas)
│   │   ├── meta.py              # Import/sync contas Meta via Graph API
│   │   ├── meta_insights.py     # Endpoints de analytics Meta Ads
│   │   └── canais.py            # CRUD canais de entrada (WhatsApp, webhook, etc.)
│   ├── core/
│   │   ├── config.py            # Settings via pydantic-settings (lê .env)
│   │   ├── database.py          # Engine SQLAlchemy + SessionLocal + get_db()
│   │   ├── security.py          # JWT (criar_token, verificar_token) + bcrypt
│   │   └── deps.py              # Dependências FastAPI: get_usuario_atual, exigir_platform_admin, etc.
│   ├── models/
│   │   ├── base.py              # DeclarativeBase + TimestampMixin (criado_em, atualizado_em)
│   │   ├── user.py              # Model User + RoleUsuario enum
│   │   ├── workspace.py         # Model Workspace
│   │   ├── network.py           # Model Network
│   │   ├── company.py           # Model Company
│   │   ├── ads_account.py       # Model AdsAccount
│   │   ├── canal_entrada.py     # Model CanalEntrada
│   │   ├── user_company_access.py  # Tabela N:N usuário ↔ company
│   │   ├── user_permission.py   # Permissões granulares por recurso
│   │   ├── account_resource.py  # Recursos vinculados a companies
│   │   ├── plan.py              # Model Plan (planos da plataforma)
│   │   ├── plan_module.py       # Model PlanModule
│   │   └── module.py            # Model Module
│   └── services/
│       ├── meta_sync.py         # Engine de sync Meta Ads via Graph API v21.0
│       ├── scheduler.py         # APScheduler — sync automático 3x/dia (6h,12h,18h BRT)
│       └── ia_insights.py       # Geração de insights com OpenAI/DeepSeek
├── alembic/
│   ├── env.py                   # Config Alembic (usa DATABASE_URL do settings)
│   └── versions/
│       ├── 001_schema_inicial.py    # Networks, companies, users, modules, plans
│       ├── 002_workspaces.py        # Tabela workspaces + workspace_modules
│       ├── 003_canais_entrada.py    # Tabela canais_entrada
│       ├── 004_ads_accounts_meta_cols.py  # bm_token, periodo_sync_inicio, etc.
│       ├── 005_usuario_workspace.py # workspace_id em users + network_id em workspaces
│       ├── 006_meta_insights.py     # Tabelas meta_campanhas_insights, meta_anuncios_insights, meta_publicos_insights
│       └── 007_agrupamentos.py      # Coluna agrupamento em ads_accounts
├── requirements.txt
├── Dockerfile
└── .env
```

## Decisões arquiteturais

### Migrações automáticas no startup
`app/main.py` chama `alembic upgrade head` via subprocess no evento `lifespan`. Assim o container sempre parte com o schema atualizado sem necessidade de rodar migrations manualmente.

### Raw SQL em vez de ORM para analytics
Os endpoints de `meta_insights.py` usam `sqlalchemy.text()` com SQL nativo em vez de ORM. Razão: as queries de analytics têm agregações complexas (`ANY(:ids)`, `GROUP BY`, `COALESCE`) que seriam mais verbosas com ORM e a performance do SQL nativo é melhor para grandes volumes de dados.

### CAST(:param AS uuid) — nunca :param::uuid
O psycopg2 parseia parâmetros nomeados como `:param`. A notação PostgreSQL `::uuid` colide com o parser (`:param::uuid` é interpretado como token inválido). Solução: sempre `CAST(:param AS uuid)`.

### UUID nativo em listas (ANY)
Para filtros com lista de UUIDs (`= ANY(:ids)`), passar `list[uuid.UUID]` diretamente — o psycopg2 converte automaticamente para o tipo correto no PostgreSQL, evitando cast adicional.

### Hierarquia de roles
```
platform_admin
  └── network_admin (franqueadora)
        ├── network_viewer
        └── company_admin (unidade)
              └── company_agent
```
Cada role enxerga apenas o subconjunto de dados ao qual pertence. `platform_admin` acessa tudo. As funções de verificação ficam em `core/deps.py`.

### Scheduler para sync Meta
`APScheduler` (BackgroundScheduler) dispara `sincronizar_conta()` para todas as contas Meta ativas às 06h, 12h e 18h (horário de Brasília). O token BM (`bm_token`) da conta é usado; se expirado, a conta é pulada com log de aviso.

### IA com modelo reasoning (DeepSeek)
O endpoint `/meta/insights/ia` usa `openai>=1.0.0` com `base_url` customizada apontando para `opencode.ai`. O modelo `deepseek-v4-flash` é um modelo de raciocínio que consome ~1900 tokens internos antes de gerar output. Por isso `max_tokens=4000` — menos que isso resulta em JSON truncado.

## Como rodar localmente

### Pré-requisitos
- Docker e Docker Compose instalados
- Arquivo `.env` na raiz com as variáveis (ver `docs/ENV.md`)

### Com Docker Compose
```bash
cd /root/op7nexo-api
docker compose up -d --build
```

O container expõe a API na porta **8000** (interno — acesso via traefik ou frontend proxy).

### Sem Docker (dev local)
```bash
cd /root/op7nexo-api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Criar .env com DATABASE_URL apontando para postgres local
uvicorn app.main:app --reload --port 8000
```

As migrações rodam automaticamente no startup. Para rodar manualmente:
```bash
alembic upgrade head
```

### Docs interativas
`http://localhost:8000/docs` (Swagger UI automático do FastAPI).
