# Contratos De API — WhatsApp CRM Evolution v2

## Webhook Evolution

### `POST /webhook/evolution/{token}`

Público, sem JWT. Autorização pelo token do canal.

Resposta sempre rápida quando token válido:

```json
{ "recebido": true, "event_id": "uuid", "queued": true }
```

Erros:

```json
{ "detail": "Token inválido" }
```

## Conversas

### `GET /conversas`

Query:

- `workspace_id`
- `canal_id`
- `status`
- `fila`: `novas|minhas|equipe|grupos|resolvidas`
- `equipe_id`
- `responsavel_id`
- `busca`
- `limit`
- `offset`

Item:

```json
{
  "id": "uuid",
  "workspace_id": "uuid",
  "canal_id": "uuid",
  "instance": "op7-...",
  "remote_jid": "5511999999999@s.whatsapp.net",
  "is_group": false,
  "group_name": null,
  "status": "nova",
  "lead_status": "novo",
  "followup_due_at": "2026-05-29T12:00:00Z",
  "nao_lidas": 1,
  "ultima_mensagem": "Olá",
  "ultima_direcao": "entrada",
  "ultima_msg_at": "2026-05-28T12:00:00Z",
  "responsavel_id": null,
  "equipe_id": null,
  "contato": {
    "id": "uuid",
    "nome": "João",
    "telefone": "5511999999999",
    "avatar_url": "https://...",
    "campanha_origem": "Meta Ads",
    "utm_source": "meta_ads",
    "meta_ad_id": "123"
  },
  "badges": {
    "mentioned": false,
    "has_media": true,
    "overdue_followup": false
  }
}
```

## Mensagens

### `GET /mensagens`

Query:

- `workspace_id`
- `conversa_id`
- `limit`
- `before`

Item:

```json
{
  "id": "uuid",
  "workspace_id": "uuid",
  "canal_id": "uuid",
  "conversa_id": "uuid",
  "evolution_msg_id": "BAE...",
  "client_temp_id": "tmp_...",
  "direcao": "entrada",
  "from_me": false,
  "remetente_tipo": "contato",
  "remetente_nome": "João",
  "participant_jid": null,
  "participant_name": null,
  "is_mentioned": false,
  "conteudo": "Olá",
  "message_type": "conversation",
  "wa_status": "delivered",
  "media_status": "ready",
  "midias": [
    {
      "id": "uuid",
      "tipo": "image",
      "url": "https://...",
      "minio_path": "whatsapp/workspace/conversa/mensagem.jpg",
      "mimetype": "image/jpeg",
      "filename": "foto.jpg",
      "tamanho": 123456,
      "storage_status": "ready",
      "sha256": "hex",
      "duration_seconds": null
    }
  ],
  "recebida_em": "2026-05-28T12:00:00Z",
  "delivered_at": "2026-05-28T12:00:03Z",
  "read_at": null
}
```

## Envio

### `POST /canais/{canal_id}/enviar-mensagem`

```json
{
  "conversa_id": "uuid",
  "numero": null,
  "tipo": "texto",
  "texto": "Olá, tudo bem?",
  "media_url": null,
  "caption": null,
  "client_temp_id": "tmp_123"
}
```

Resposta:

```json
{
  "ok": true,
  "mensagem_id": "uuid",
  "client_temp_id": "tmp_123",
  "evolution_msg_id": "BAE...",
  "status": "pending"
}
```

### `POST /canais/{canal_id}/upload-midia`

Multipart:

- `arquivo`
- `conversa_id` opcional

Resposta:

```json
{
  "ok": true,
  "media_url": "https://...",
  "minio_path": "whatsapp/workspace/conversa/file",
  "mimetype": "audio/ogg",
  "filename": "audio.ogg",
  "tamanho": 12345,
  "sha256": "hex",
  "tipo": "audio"
}
```

## Follow-Up

### `POST /crm/followups`

```json
{
  "workspace_id": "uuid",
  "contato_id": "uuid",
  "conversa_id": "uuid",
  "responsavel_id": "uuid",
  "due_at": "2026-05-29T12:00:00Z",
  "tipo": "retorno",
  "nota": "Retornar sobre orçamento"
}
```

### `PATCH /crm/followups/{id}`

```json
{
  "status": "feito",
  "nota": "Cliente respondeu e agendou"
}
```

## Realtime

### `GET /api/whatsapp/stream?workspace_id={uuid}`

Eventos SSE:

- `whatsapp.refresh`
- `message.upsert`
- `message.status`
- `message.media.ready`
- `conversation.assignment`
- `followup.updated`

Payload base:

```json
{
  "workspaceId": "uuid",
  "canalId": "uuid",
  "conversaId": "uuid",
  "timestamp": "2026-05-28T12:00:00Z"
}
```
