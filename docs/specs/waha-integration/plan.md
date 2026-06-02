# Plan: Canal WhatsApp WAHA — Fase 1

## Arquitetura

O pipeline de inbound é reaproveitado 100% do Evolution. O único código novo é:
1. Adapter de payload (WAHA flat → formato interno)
2. Endpoint de webhook WAHA
3. Registro do tipo `whatsapp_waha` no sistema

```
POST /webhook/waha/{token}
  → validar token + tipo
  → adapt_waha_to_evolution(raw)        ← novo (waha_normalizer.py)
  → enqueue_evolution_event()           ← existente
  → whatsapp_event_worker               ← existente
  → process_evolution_message()         ← existente
  → publish_whatsapp_event()            ← existente → Redis → SSE → tela
```

## Segurança de token

- `config.waha.api_key_ref` = nome da env var (ex: `"WAHA_API_KEY"`)
- Valor real resolvido em runtime: `os.getenv(canal.config["waha"]["api_key_ref"])`
- Nunca serializar em resposta de API, log ou banco

## Backend — decisões técnicas

### `TIPOS_VALIDOS` (canais.py linha 66)
Literal Python — adicionar `"whatsapp_waha"`. Sem migration.

### `webhook_token` (canais.py linha 774)
Condição atual: `if payload.tipo == "webhook"`. Alterar para:
```python
if payload.tipo in ("webhook", "whatsapp_waha"):
    webhook_token = secrets.token_hex(32)
```

### `canal_labels.py`
```python
_TIPO_PROVIDER["whatsapp_waha"] = "waha"
_TIPO_LABEL["whatsapp_waha"] = "WhatsApp WAHA"
```

### `POST /webhook/waha/{token}` (canais.py após linha 2109)
```python
@router.post("/webhook/waha/{token}")
async def receber_webhook_waha(token: str, request: Request, db: Session = Depends(get_db)):
    canal = db.query(CanalEntrada).filter(
        CanalEntrada.webhook_token == token,
        CanalEntrada.tipo == "whatsapp_waha",
    ).first()
    if not canal:
        raise HTTPException(404, "Token inválido")
    raw = await request.json()
    adapted = adapt_waha_to_evolution(raw)
    enqueue_evolution_event(db, canal, adapted)
    return {"ok": True}
```

### `waha_normalizer.py` (novo)
```python
def adapt_waha_to_evolution(waha: dict) -> dict:
    return {
        "data": {
            "key": {
                "id": waha.get("id"),
                "remoteJid": waha.get("chatId") or waha.get("from"),
                "fromMe": waha.get("fromMe", False),
            },
            "pushName": waha.get("pushName", ""),
            "message": {"conversation": waha.get("body", "")},
            "messageTimestamp": waha.get("timestamp"),
        },
        "event": "messages.upsert",
        "instance": waha.get("_sessionName", "waha"),
    }
```

### `evolution_instance_id`
Não utilizado para WAHA na Fase 1. O adapter usa string literal `"waha"` como `instance`.
⚠️ Dívida técnica: se pipeline usar `canal.evolution_instance_id` como fallback de instance name,
a sessão correta pode não ser resolvida. Mitigação: o adapter injeta `instance` no payload
adaptado, que tem precedência sobre o campo do canal.

### Config WAHA (JSONB — sem migration)
```json
{
  "waha": {
    "api_base_url": "https://waha.op7franquia.com.br",
    "api_key_ref":  "WAHA_API_KEY",
    "session":      "teste"
  }
}
```

## Frontend — decisões técnicas

### `canal-shared.ts`
- Adicionar `'whatsapp_waha'` ao union `TipoCanal`
- Adicionar entrada ao array `TIPOS` com label, emoji e cor

### `novo-canal-dialog.tsx`
- Adicionar `'whatsapp_waha'` a `TIPOS_CRIAVEIS`
- Bloco de campos: `api_base_url` (text), `api_key_ref` (text — nome da env var), `session` (text)
- **Não** usar input `type="password"` — `api_key_ref` não é segredo

### `use-whatsapp-canais.ts`
- Adicionar `'whatsapp_waha'` a `TIPOS_CANAL_ATENDIMENTO`

### `canais-omnichannel/page.tsx`
- Case WAHA em `getChannelBadge()` → usa `CONN_BADGE` igual Evolution

### `whatsapp-canal.ts`
- `TIPO_LABEL_FALLBACK["whatsapp_waha"] = "WhatsApp WAHA"`
- `getCanalTags()`: case `'whatsapp_waha'` → `["WhatsApp", "WAHA"]`

### `painel-inbox.tsx`
- Tom visual em `getProviderTone()` (cosmético — baixo risco)

## Configuração manual do webhook WAHA pós-deploy

```bash
curl -sX PUT https://waha.op7franquia.com.br/api/sessions/teste \
  -H "X-Api-Key: $WAHA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "webhooks": [{
        "url": "https://api.op7franquia.com.br/webhook/waha/{webhook_token}",
        "events": ["message"],
        "customHeaders": [{"name":"X-Waha-Token","value":"{webhook_token}"}]
      }]
    }
  }'
```
