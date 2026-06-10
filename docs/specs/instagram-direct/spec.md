# Spec — Instagram Direct Messages (Instagram Login)

> Status: MVP token manual (Fase 2 do plano "Canal Meta Oficial"). Login OAuth fica como stub flag-gated.

## Contexto

O sistema já atende WhatsApp (Evolution, WAHA, Meta Cloud oficial) e webhooks genéricos.
Adicionamos o canal **Instagram Direct** usando a "Instagram API with Instagram Login"
(`graph.instagram.com`) — não exige Página do Facebook conectada. Reaproveita todo o
pipeline de persistência/normalização do canal Meta Cloud.

## Decisões

- **Conexão por token manual** (igual WhatsApp Oficial MVP): o canal guarda `ig_id`
  (Instagram-scoped business id) + `access_token` (Instagram user access token). O login
  OAuth direto (`instagram.com/oauth/authorize`) fica como stub atrás de
  `NEXT_PUBLIC_INSTAGRAM_LOGIN` — depende de App Review de `instagram_business_manage_messages`.
- **Sem migration.** Reusa `instance="instagram"` como discriminador (mesmo padrão de
  `meta`/`waha`/`evolution`). `remote_jid` guarda o **IGSID** do usuário; `contatos.origem="instagram"`.
- **HMAC** reaproveita `meta_cloud.verificar_assinatura` (mesmo `META_APP_SECRET`).
- **Versão da Graph API** reusa `META_GRAPH_API_VERSION` (host muda para `graph.instagram.com`).

## Comportamento esperado

| Ação | Endpoint | Notas |
|---|---|---|
| Criar canal | `POST /workspaces/{id}/canais` tipo=`instagram` | gera `webhook_token` + `verify_token` |
| Conectar | `POST /canais/{id}/conectar` | valida token via `GET /{ig_id}?fields=username` → `connected` |
| Status | `GET /canais/{id}/status-evolution` | revalida token |
| Desconectar | `POST /canais/{id}/desconectar` | inativa canal |
| Enviar DM | `POST /canais/{id}/enviar-mensagem` | `POST graph.instagram.com/{ig_id}/messages` `{recipient:{id:IGSID}, message:{text}}` |
| Webhook verify | `GET /webhook/instagram/{token}` | challenge plain (hub.verify_token == config.verify_token) |
| Webhook ingest | `POST /webhook/instagram/{token}` | HMAC; `entry[].messaging[]` → persiste como `instance="instagram"` |

## Janela de mensagens
24h após a última mensagem do usuário (igual padrão Meta). Human Agent tag estende para 7 dias (fora do MVP).

## Critérios de aceite
1. Criar canal Instagram no painel gera Callback URL `…/webhook/instagram/{token}` + verify token.
2. `GET /webhook/instagram/{token}?hub.mode=subscribe&hub.verify_token=…&hub.challenge=42` → `42`.
3. DM recebida cria conversa/contato com `instance="instagram"`, `remote_jid=IGSID`.
4. Resposta pela inbox chega ao usuário; mensagem persiste com `instance="instagram"`.
5. Dedup por `mid` (mesmo índice único `uq_crm_msg_workspace_canal_provider_id`).

## Fora de escopo (próximas rodadas)
- Login OAuth direto (instagram.com/oauth/authorize + troca de código).
- Mídia (imagens/áudio) inbound/outbound.
- Comentários/menções (só DM neste MVP).
