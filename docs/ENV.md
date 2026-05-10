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
```

## Observações

- `DATABASE_URL` usa o IP interno do container postgres quando rodando via Docker Compose. Em dev local, usar `localhost`.
- `JWT_SECRET` deve ser um hash aleatório longo (mínimo 32 chars). Nunca commitar o valor real.
- `openai_model=deepseek-v4-flash` é um modelo de raciocínio — consome tokens internamente. O parâmetro `max_tokens` no código está fixado em 4000 para acomodar isso.
- As variáveis `openai_*` são minúsculas porque foram adicionadas como campos Pydantic em lowercase. O `pydantic-settings` é case-insensitive por padrão.
