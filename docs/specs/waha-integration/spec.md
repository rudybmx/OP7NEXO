# Spec: Canal WhatsApp WAHA — Fase 1 (Inbound)

## Problema

OP7NEXO suporta WhatsApp via Evolution API. É necessário adicionar suporte ao WAHA Plus como
segundo provider de WhatsApp, coexistindo com Evolution. Fase 1 cobre apenas inbound (receber
mensagens) e cadastro de canal. Outbound, mídia e gestão de sessão são fases futuras.

## Comportamento esperado

### Canal

- Operador pode criar um canal do tipo `whatsapp_waha` em Administração → Canais Omnichannel.
- Campos obrigatórios no cadastro: `api_base_url`, `api_key_ref` (nome da env var, nunca o valor real), `session`.
- Ao criar, o sistema gera um `webhook_token` único (64 chars hex) para o canal.
- Canal aparece na listagem de Canais com card/badge "WhatsApp WAHA".
- Canal aparece na lista de canais da tela de conversas (inbox/atendimento).

### Inbound de mensagem de texto

- Quando uma mensagem chega no WhatsApp conectado à sessão WAHA, o WAHA dispara um
  `POST https://api.op7franquia.com.br/webhook/waha/{webhook_token}` com payload flat.
- O backend valida o `webhook_token` → identifica o canal → normaliza o payload → persiste
  contato, conversa e mensagem no CRM → publica evento Redis/SSE.
- A conversa aparece na tela de atendimento em tempo real.

### Segurança

- `api_key` do WAHA **nunca** é salvo em banco, config, logs ou enviado ao front.
- `config.waha.api_key_ref` armazena apenas o nome da env var (ex: `"WAHA_API_KEY"`).
- O backend resolve o valor em runtime via `os.getenv(api_key_ref)`.

## Fora de escopo na Fase 1

- Outbound (envio de resposta)
- Mídia (imagem, áudio, vídeo, documento)
- QR code / parear número pela UI
- Conectar / status / desconectar sessão pela UI
- Configuração automática do webhook no WAHA (feita manualmente)
- HMAC para validação de assinatura do webhook

## Critérios de aceite

1. `POST /workspaces/{id}/canais` com `tipo=whatsapp_waha` retorna `201` com `webhook_token`.
2. `POST /webhook/waha/{token_invalido}` retorna `404`.
3. `POST /webhook/waha/{token_valido}` com payload de texto retorna `200 {"ok": true}`.
4. Após o webhook, existe registro em `crm_whatsapp_mensagens` com o texto correto.
5. Canal `whatsapp_waha` aparece na página `/administracao/canais-omnichannel`.
6. Canal `whatsapp_waha` aparece na lista de canais do atendimento.
7. Nenhum campo com valor de `api_key` real aparece em resposta de API, log ou banco.
