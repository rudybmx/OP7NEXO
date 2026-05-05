# DEPLOY - Odontocompany by Op7 (Self-Host Completo)

## O que foi construido

- **Dockerfile**: Multi-stage build com Next.js standalone
- **docker-compose.yml**: Integracao com Traefik existente na rede `network_swarm_public`
- **Schema SQL**: Tabelas para auth, orgs, perfis, Meta Ads, CRM, agenda, demandas
- **Auth proprio**: /api/auth/login, /api/auth/register, /api/auth/refresh, /api/auth/me
- **API interna**: /api/meta/*, /api/admin/*, /api/health
- **Painel Admin**: Gerenciamento de usuarios e organizacoes (somente nivel 0)
- **Frontend ajustado**: Consome 100% /api local, sem dependencia de api.qozt.com.br

## Requisitos

- Docker + Docker Compose (ou Swarm)
- Postgres ja rodando (usamos o mesmo do GoTrue anterior)
- Traefik ja configurado com `network_swarm_public`
- Dominio `wersun.qozt.com.br` apontando pra VPS

## Passo a passo

### 1. Clone o repo na VPS

```bash
cd /opt
git clone git@github.com:rudybmx/wer_sun_plataforma.git
cd wer_sun_plataforma
```

### 2. Aplique o schema no banco

```bash
docker exec -i postgres_wersun psql -U supabase_auth_admin -d wersun < schema.sql
```

### 3. Crie o primeiro admin

```bash
# Edite o setup-admin.sql com seu email/senha
docker exec -i postgres_wersun psql -U supabase_auth_admin -d wersun < setup-admin.sql
```

Ou registre via API apos subir:
```bash
curl -X POST https://wersun.qozt.com.br/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"seu@email.com","password":"senha123","nome":"Admin","org_nome":"WerSun"}'
```

Depois ajuste o nivel no banco:
```sql
UPDATE public.perfis SET nivel = 0 WHERE email = 'seu@email.com';
```

### 4. Build e deploy

```bash
# Build
docker build -t wersun-plataforma:latest .

# Deploy (compose simples)
docker-compose -f docker-compose.yml up -d

# Ou no Swarm:
docker stack deploy -c docker-compose.yml wersun
```

### 5. Verifique

```bash
# Logs
docker logs -f wersun-plataforma

# Health check
curl -s https://wersun.qozt.com.br/api/health

# Login
curl -X POST https://wersun.qozt.com.br/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"seu@email.com","password":"senha123"}'
```

## Variaveis de ambiente

Ja configuradas no `docker-compose.yml`:

| Variavel | Valor | Descricao |
|----------|-------|-----------|
| DATABASE_URL | postgres://... | Mesmo banco do GoTrue |
| JWT_SECRET | YjR3N2Y4ZHE5... | Secret para assinar JWTs |
| AUTH_URL | https://auth.qozt.com.br | **Deprecado** (mantido pra compatibilidade) |
| NEXT_PUBLIC_APP_URL | https://wersun.qozt.com.br | URL publica |

## Arquitetura de auth

```
Usuario -> POST /api/auth/login -> JWT access_token (1h) + refresh_token (7d)
   |
   v
Cookie ws-session + localStorage ws_refresh_token
   |
   v
Middleware verifica cookie -> permite/bloqueia rotas
   |
   v
API routes verificam Bearer token -> buscam perfil no banco
```

## Comandos uteis

```bash
# Rebuild completo
docker-compose -f docker-compose.yml build --no-cache
docker-compose -f docker-compose.yml up -d

# Restart
docker-compose -f docker-compose.yml restart

# Down
docker-compose -f docker-compose.yml down

# Ver logs
docker logs -f wersun-plataforma

# Acessar container
docker exec -it wersun-plataforma sh

# Backup banco
docker exec postgres_wersun pg_dump -U supabase_auth_admin wersun > backup.sql
```

## Proximos passos

1. **Conectar contas Meta Ads** (tokens, sync de campanhas)
2. **Migrar hooks restantes** (useMetaCampanhas, useMetaAnuncios, etc.)
3. **Implementar sync automatico** com Meta Graph API
4. **Configurar Evolution API** (WhatsApp) se ainda nao estiver

## Seguranca

- JWT_SECRET: Troque em producao! Gere um novo: `openssl rand -base64 32`
- Senhas: bcrypt com salt 12
- Refresh tokens: armazenados com hash no banco, revogaveis
- Middleware: protege rotas privadas e admin
- Postgres: use SSL em producao (ajuste DATABASE_URL)
