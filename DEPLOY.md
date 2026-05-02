# DEPLOY - Wer'sun Plataforma (Self-Host)

## O que foi construido

- **Dockerfile**: Multi-stage build com Next.js standalone
- **docker-compose.yml**: Integracao com Traefik existente na rede `network_swarm_public`
- **Schema SQL**: Tabelas para orgs, perfis, Meta Ads, CRM, agenda, demandas
- **API Routes internas**: `/api/health`, `/api/auth/me`, `/api/meta/*`
- **Frontend ajustado**: `lib/api.ts` agora aponta para `/api` (local)

## Passo a passo para deploy

### 1. Aplicar o schema no banco

Acesse o container do Postgres ou rode via psql:

```bash
# No host Docker (fora deste container)
docker exec -i postgres_wersun psql -U supabase_auth_admin -d wersun < schema.sql
```

Ou copie o conteudo de `schema.sql` e execute no banco.

### 2. Buildar a imagem Docker

No host Docker (na pasta onde esta o codigo):

```bash
cd /caminho/do/wer_sun_plataforma
docker build -t wersun-plataforma:latest .
```

Ou via docker-compose:

```bash
docker-compose -f docker-compose.yml build
```

### 3. Deploy no Swarm

```bash
docker stack deploy -c docker-compose.yml wersun
```

Ou docker-compose simples:

```bash
docker-compose -f docker-compose.yml up -d
```

### 4. Verificar se subiu

```bash
docker logs -f wersun-plataforma
curl -s https://wersun.qozt.com.br/api/health
```

### 5. Configurar DNS (Cloudflare)

Ajuste no Cloudflare:
- Tipo: A ou CNAME
- Nome: wersun
- Conteudo: IP da VPS ou dominio apontando pro Traefik
- SSL: Full (strict)

## Variaveis de ambiente

Ja configuradas no `docker-compose.yml`:

| Variavel | Valor | Descricao |
|----------|-------|-----------|
| DATABASE_URL | postgres://... | Mesmo banco do GoTrue |
| JWT_SECRET | YjR3N2Y4ZHE5... | Mesmo secret do GoTrue |
| AUTH_URL | https://auth.qozt.com.br | GoTrue existente |
| NEXT_PUBLIC_APP_URL | https://wersun.qozt.com.br | URL publica |

## Proximos passos (apos deploy)

1. **Criar organizacao e perfil** no banco para seu usuario
2. **Sincronizar dados do Meta Ads** (tokens, contas, campanhas)
3. **Migrar dados antigos** se houver no PostgREST externo
4. **Implementar mais API routes** conforme demanda

## Arquivos novos/modificados

Novos:
- Dockerfile
- docker-compose.yml
- schema.sql
- src/lib/db.ts
- src/lib/jwt.ts
- src/lib/api-auth.ts
- src/app/api/health/route.ts
- src/app/api/auth/me/route.ts
- src/app/api/meta/overview/route.ts
- src/app/api/meta/campanhas/route.ts
- src/app/api/meta/anuncios/route.ts

Modificados:
- next.config.ts (standalone, ignoreBuildErrors)
- src/lib/api.ts (aponta para /api local)
- src/hooks/use-meta-overview.ts (endpoint novo)

## Comandos uteis

```bash
# Rebuild e redeploy
docker-compose -f docker-compose.yml build --no-cache
docker-compose -f docker-compose.yml up -d

# Ver logs
docker logs -f wersun-plataforma

# Restart
docker-compose -f docker-compose.yml restart

# Remover stack
docker-compose -f docker-compose.yml down
```
