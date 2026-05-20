# Canais de Entrada

## Objetivo
Gerenciar canais de comunicação (WhatsApp, Instagram, webhook) vinculados a workspaces. Cada canal recebe mensagens do mundo externo e as processa no CRM.

## Estado atual
Implementado e em produção. WhatsApp via Evolution API integrado com CRM (webhook processa mensagens e cria conversas).

## Escopo
- In scope: CRUD de canais, webhook público, integração Evolution API
- Out of scope: Instagram Direct, Facebook Messenger (estrutura existe, não integrada)

## Tipos de canal
| Tipo | Descrição |
|---|---|
| `whatsapp_evolution` | WhatsApp via Evolution API (`evo.op7franquia.com.br`) |
| `whatsapp_oficial` | WhatsApp Business API oficial (futuro) |
| `instagram` | Instagram Direct (futuro) |
| `facebook` | Facebook Messenger (futuro) |
| `webhook` | Webhook genérico — token gerado automaticamente |

## Regras de comportamento

### Criação
- `POST /workspaces/{workspace_id}/canais` cria canal com `status = 'inativo'`
- Para tipo `webhook`: `webhook_token` (64 chars) gerado automaticamente e único
- `config` JSONB armazena credenciais específicas do tipo (ex: instance_name, api_key para Evolution)

### WhatsApp — Fluxo de conexão (Evolution API)
1. Criar instância na Evolution API com o `instance_name` da config
2. `GET /instance/connect/{instance_name}` → retorna QR Code
3. Polling a cada 30s até status = connected
4. Exibir QR Code no drawer do canal no front

### Webhook
- `POST /webhook/{token}` — endpoint público, sem JWT
- `token` corresponde ao `webhook_token` do canal
- Evento `messages.upsert` da Evolution → salva contato, conversa e mensagem
- Regra de conversa: `status = resolvido` + nova msg de entrada → cria **NOVA** conversa (não reabre)
- Publica evento no Redis canal `whatsapp:events` para SSE do front

### Eventos Redis (realtime)
- Canal: `whatsapp:events`
- Serviço: `app/services/redis_pub.py`
- Consumido via SSE em `/api/whatsapp/stream` no front

## Atenção — Bugfix crítico
Evento da Evolution chega como `messages.upsert` (com ponto). Comparar sempre com `.upper().replace(".", "_")` → `MESSAGES_UPSERT`.

## Inputs e Outputs

### `POST /workspaces/{workspace_id}/canais`
```json
{ "tipo": "whatsapp_evolution|...", "nome": "string", "config": {}, "mensagem_boas_vindas": "string|null", "status": "inativo" }
```

### `POST /webhook/{token}`
- Payload: qualquer JSON enviado pelo canal externo
- Response: `{ "recebido": true }`

## Casos de erro
- Token inválido em `/webhook/{token}` → 404
- Canal inativo recebendo webhook → processa mesmo assim (não bloqueia)
- Evolution API offline → polling de conexão falha, reportar ao usuário

## Critérios de aceite
- [x] `webhook_token` único e gerado automaticamente
- [x] Webhook processa `messages.upsert` da Evolution
- [x] Nova conversa criada ao receber msg em conversa resolvida
- [x] Evento publicado no Redis após mensagem processada
- [x] CRUD completo de canais filtrado por workspace

## Open Questions
- None
