# Meta Cloud API — WhatsApp Oficial (Fase 3)

## Objective

Adicionar suporte à **Meta Cloud API (WhatsApp Business API oficial)** como canal alternativo à Evolution API. Isso permite que clientes usem números verificados pela Meta (Business Manager) em vez de instâncias Baileys via Evolution.

## Current State

- O sistema suporta apenas **Evolution API** para WhatsApp.
- O tipo de canal `"whatsapp_oficial"` existe no enum mas não tem implementação funcional.
- O campo `config` JSONB de `canais_entrada` pode armazenar credenciais da Meta, mas não há código que as use.
- Não há serviço, webhook nem endpoint de envio para Meta Cloud API.

## Scope

### In scope:
- Criar `app/services/meta_cloud.py` com funções para:
  - Enviar mensagem de texto via Meta Cloud API
  - Verificar assinatura de webhook (`X-Hub-Signature-256`)
  - Processar webhook de mensagens recebidas
  - Processar webhook de status de entrega
- Criar endpoints:
  - `GET /webhook/meta/{token}` — verificação do challenge da Meta (subscribe)
  - `POST /webhook/meta/{token}` — receber mensagens e status
  - `POST /canais/{id}/enviar-mensagem-meta` — enviar mensagem via Meta Cloud API
- Adaptar endpoint `/canais/{id}/enviar-mensagem` para rotear conforme `tipo` (Evolution vs Meta)
- Suporte a texto apenas (mídia e templates vêm na Fase 3.1)
- Usar `config` JSONB do canal para armazenar: `phone_number_id`, `waba_id`, `access_token`, `verify_token`

### Out of scope:
- Mídia (imagem, áudio, vídeo, documento) via Meta Cloud
- Templates HSM via Meta Cloud
- UI frontend para conectar Meta BM (isso é Fase 3.1 ou frontend task)
- OAuth flow para obter access token

## Behavior Rules

1. Canal `whatsapp_oficial` usa config JSONB com:
   - `phone_number_id`: ID do número na Meta Cloud API
   - `waba_id`: WhatsApp Business Account ID
   - `access_token`: Token de acesso (System User)
   - `verify_token`: Token para verificação de webhook
2. Webhook GET: valida `hub.verify_token` e retorna `hub.challenge`
3. Webhook POST: valida assinatura `X-Hub-Signature-256` usando app secret
4. Mensagens recebidas são processadas e salvas no mesmo schema `crm_whatsapp_*`
5. Status de entrega (`sent`, `delivered`, `read`) atualiza `wa_status` da mensagem
6. Se Meta Cloud falhar, retornar erro 502 com detalhes

## Inputs and Outputs

- Inputs: Webhooks da Meta Cloud API, requisições de envio de mensagem
- Outputs: Mensagens salvas no PostgreSQL, eventos Redis, respostas HTTP 200

## Error Cases

- Assinatura de webhook inválida → 403
- Access token expirado/inválido → 502
- Phone number ID não encontrado → 404
- Janela de 24h fechada sem template → 400

## Acceptance Criteria

- [ ] Serviço `meta_cloud.py` criado com envio de texto
- [ ] Webhook GET/POST funcional para Meta Cloud API
- [ ] Assinatura de webhook validada
- [ ] Mensagens recebidas da Meta são salvas no banco
- [ ] Status de entrega da Meta atualiza mensagens
- [ ] Endpoint `/canais/{id}/enviar-mensagem` rotear para Meta quando `tipo = whatsapp_oficial`

## Test Plan

- Manual: cadastrar canal `whatsapp_oficial` com credenciais de teste
- Manual: enviar mensagem de texto via API
- Manual: verificar webhook challenge no painel da Meta

## Open Questions

- None
