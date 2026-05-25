# Canais de Entrada

## Objetivo
Gerenciar canais de comunicação (WhatsApp, Instagram, webhook) vinculados a workspaces. Cada canal recebe mensagens do mundo externo e as processa no CRM.

## Estado atual
Em produção. WhatsApp via Evolution Go `evoapicloud/evolution-go:v0.7.1` com Redis `evolution-redis:7.4`, integrado ao CRM por webhook e eventos em tempo real.

## Escopo
- In scope: CRUD de canais, webhook público, integração Evolution Go, realtime via Redis
- Out of scope: Instagram Direct, Facebook Messenger (estrutura existe, não integrada)

## Tipos de canal
| Tipo | Descrição |
|---|---|
| `whatsapp_evolution` | WhatsApp via Evolution Go (`evo.op7franquia.com.br`) |
| `whatsapp_oficial` | WhatsApp Business API oficial (futuro) |
| `instagram` | Instagram Direct (futuro) |
| `facebook` | Facebook Messenger (futuro) |
| `webhook` | Webhook genérico - token gerado automaticamente |

## Regras de comportamento

### Criação
- `POST /workspaces/{workspace_id}/canais` cria canal com `status = 'inativo'`
- Para tipo `webhook`: `webhook_token` (64 chars) gerado automaticamente e único
- Para `whatsapp_evolution`: a API persiste em `config.evolution` o meta da instância (`instance_name`, `instance_id`, `instance_token`)
- `evolution_instance_id` continua sendo o nome determinístico da instância: `op7-{workspace_id}-{canal_id}`

### WhatsApp - fluxo Evolution Go
1. Criar instância na Evolution Go com `name` e `token`
2. Persistir os metadados retornados pela API (`id`, `token`, `name`) em `config.evolution`
3. Chamar `POST /instance/connect` com `webhookUrl`, `subscribe: ["ALL"]` e `immediate: true`
4. Ler QR Code em `GET /instance/qr` e estado em `GET /instance/status`
5. Exibir QR Code no drawer do canal no front
6. Se a instância já estiver aberta, marcar o canal como `ativo/connected` e sincronizar o webhook
7. Antes do connect, o servidor precisa estar com a licença/activation do Evolution Go configurada

### Webhook
- `POST /webhook/{token}` continua sendo o endpoint público genérico, sem JWT
- `POST /webhook/evolution/{token}` recebe eventos da Evolution Go e normaliza tanto o contrato novo quanto o legado
- Eventos novos principais: `Message`, `Receipt`, `Connected`, `LoggedOut`, `QRCode`
- Eventos legados continuam aceitos como fallback: `messages.upsert`, `messages.update`, `connection.update`
- `Message` salva contato, conversa e mensagem
- `Receipt` atualiza status de entrega/leitura da mensagem
- `Connected` / `LoggedOut` / `QRCode` atualizam o estado da instância no canal
- Regra de conversa: `status = resolvido` + nova msg de entrada -> cria **NOVA** conversa (não reabre)
- Publica evento no Redis canal `whatsapp:events` para SSE do front

### Eventos Redis (realtime)
- Canal: `whatsapp:events`
- Serviço: `app/services/redis_pub.py`
- Consumido via SSE em `/api/whatsapp/stream` no front

## Contrato de evento
- Normalizar sempre `event.upper().replace(".", "_")` antes de comparar
- No Evolution Go, tratar também `Message`, `Receipt`, `Connected`, `LoggedOut` e `QRCode`
- O payload bruto deve ser salvo para auditoria e debug

## Inputs e Outputs

### `POST /workspaces/{workspace_id}/canais`
```json
{ "tipo": "whatsapp_evolution|...", "nome": "string", "config": {}, "mensagem_boas_vindas": "string|null", "status": "inativo" }
```

### `POST /webhook/{token}`
- Payload: qualquer JSON enviado pelo canal externo
- Response: `{ "recebido": true }`

## Casos de erro
- Token inválido em `/webhook/{token}` -> 404
- Canal inativo recebendo webhook -> processa mesmo assim (não bloqueia)
- Evolution Go offline -> connect/status/qr falham e o usuário deve ser reportado
- Instância já existente no Evolution -> a API deve resolver por `instance_name` e manter o vínculo com o workspace correto

## Critérios de aceite
- [x] `webhook_token` único e gerado automaticamente
- [x] Webhook processa `Message`/`messages.upsert` da Evolution Go e do legado
- [x] Nova conversa criada ao receber msg em conversa resolvida
- [x] Evento publicado no Redis após mensagem processada
- [x] CRUD completo de canais filtrado por workspace
- [x] Instância Evolution persistida por workspace com `instance_name` determinístico e `instance_id`/`instance_token` em `config.evolution`

## Open Questions
- None
