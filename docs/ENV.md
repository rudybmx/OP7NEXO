# ENV — op7nexo-api

Todas as variáveis são lidas via `pydantic-settings` do arquivo `.env` na raiz do projeto.
`extra = "ignore"` — variáveis desconhecidas são silenciosamente ignoradas.

## Variáveis obrigatórias

| Variável | Tipo | Descrição | Exemplo |
|---|---|---|---|
| `DATABASE_URL` | string | Connection string PostgreSQL | `postgresql://postgres:senha@172.18.0.4:5432/op7nexo` |
| `JWT_SECRET` | string | Chave secreta para assinar tokens JWT (HS256) | `0085aed4be44de46...` |

## Variáveis com default

| Variável | Default | Descrição |
|---|---|---|
| `JWT_ALGORITHM` | `HS256` | Algoritmo de assinatura JWT |
| `JWT_EXPIRE_MINUTES` | `1440` | Expiração do token em minutos (1 dia) |
| `openai_api_key` | `""` | API key para geração de insights IA. Se vazio, `/meta/insights/ia` retorna `[]` |
| `openai_base_url` | `""` | Base URL da API OpenAI-compatível. Ex: `https://opencode.ai/zen/go/v1` |
| `openai_model` | `gpt-4o-mini` | Nome do modelo a usar. Em produção: `deepseek-v4-flash` |
| `META_SYNC_REQUEST_DELAY_SECONDS` | `0.5` | Delay mínimo entre chamadas Graph API quando não há header de uso |
| `META_SYNC_ACCOUNT_DELAY_SECONDS` | `5` | Delay entre contas no scheduler Meta Ads |
| `META_SYNC_RATE_LIMIT_MAX_RETRIES` | `5` | Tentativas máximas para rate limit/429 da Graph API |
| `META_SYNC_RATE_LIMIT_BASE_DELAY_SECONDS` | `30` | Base do backoff exponencial com jitter |
| `META_SYNC_RATE_LIMIT_MAX_DELAY_SECONDS` | `900` | Teto do cooldown/backoff por rate limit |
| `META_SYNC_PUBLICOS_CAMPANHA_LIMIT` | `50` | Máximo de campanhas relevantes para públicos por campanha no sync padrão |
| `META_SYNC_PUBLICOS_CAMPANHA_BACKFILL` | `false` | Se `true`, permite públicos por campanha também em backfill |
| `META_SYNC_USAGE_SOFT_THRESHOLD_PERCENT` | `80` | Uso Graph API a partir do qual o throttle aumenta cooldown |
| `META_SYNC_USAGE_HARD_THRESHOLD_PERCENT` | `95` | Uso Graph API que força cooldown máximo |

## Outbound Helena Chat

O outbound do provider `crm_externo_zapi` lê o segredo por referência, não por valor.

| Variável | Tipo | Descrição | Exemplo |
|---|---|---|---|
| `HELENA_CHAT_TOKEN_QOZT` | string | Token Bearer usado pelo adapter Helena Chat. O valor real fica no ambiente do container e nunca deve ser salvo em banco, log ou commit. | `***` |

### Como carregar no container

- O `docker-compose.yml` da API já injeta variáveis via `env_file`.
- Para este MVP, adicione `HELENA_CHAT_TOKEN_QOZT` no arquivo `.env` usado pelo backend e recrie o serviço com `/root/deploy.sh api`.
- O canal salva apenas `config.webhook.helena.api_token_ref = "HELENA_CHAT_TOKEN_QOZT"` e `config.webhook.helena.from_phone = "..."`
- Se a variável não existir no ambiente, o envio falha antes de chamar a API real da Helena.

## Arquivo .env de exemplo

```env
DATABASE_URL=postgresql://postgres:senha@localhost:5432/op7nexo
JWT_SECRET=gere-uma-chave-aleatoria-aqui
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440

# OpenAI / DeepSeek para insights IA
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://opencode.ai/zen/go/v1
OPENAI_MODEL=deepseek-v4-flash

# Helena Chat outbound para crm_externo_zapi
HELENA_CHAT_TOKEN_QOZT=

# Meta Ads sync throttling
META_SYNC_REQUEST_DELAY_SECONDS=0.5
META_SYNC_ACCOUNT_DELAY_SECONDS=5
META_SYNC_RATE_LIMIT_MAX_RETRIES=5
META_SYNC_RATE_LIMIT_BASE_DELAY_SECONDS=30
META_SYNC_RATE_LIMIT_MAX_DELAY_SECONDS=900
META_SYNC_PUBLICOS_CAMPANHA_LIMIT=50
META_SYNC_PUBLICOS_CAMPANHA_BACKFILL=false
META_SYNC_USAGE_SOFT_THRESHOLD_PERCENT=80
META_SYNC_USAGE_HARD_THRESHOLD_PERCENT=95
```

## Observações

- `DATABASE_URL` usa o IP interno do container postgres quando rodando via Docker Compose. Em dev local, usar `localhost`.
- `JWT_SECRET` deve ser um hash aleatório longo (mínimo 32 chars). Nunca commitar o valor real.
- `openai_model=deepseek-v4-flash` é um modelo de raciocínio — consome tokens internamente. O parâmetro `max_tokens` no código está fixado em 4000 para acomodar isso.
- As variáveis `openai_*` são minúsculas porque foram adicionadas como campos Pydantic em lowercase. O `pydantic-settings` é case-insensitive por padrão.
