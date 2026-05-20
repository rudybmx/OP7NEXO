# Suporte a Grupos WhatsApp e @Mentions

## Objective

O CRM atual trata mensagens de grupo como conversas sem contexto. Quando alguém envia mensagem em um grupo, o CRM cria uma "conversa" com o ID do grupo (`123456-789@g.us`) mas não sabe **quem** enviou. Isso resulta em múltiplas conversas fantasmas e mensagens sem nome do remetente.

**Sucesso:** Mensagens de grupo aparecem como uma única conversa na lista, com o nome do participante que enviou cada mensagem, e o agente consegue identificar quando foi marcado.

## Current State

### Schema atual
- `crm_whatsapp_conversas`: tem `remote_jid` mas não distingue grupo de 1:1
- `crm_whatsapp_mensagens`: tem `remetente_nome` mas não tem `participant_jid`
- Webhook: lê `key.remoteJid` e ignora `key.participant`

## Scope

- **In scope:**
  - Adicionar campos `is_group`, `group_name` à `conversas`
  - Adicionar `participant_jid`, `participant_name`, `is_mentioned` à `mensagens`
  - Extrair `participant` do webhook e salvá-lo
  - Detectar `mentionedJid` no webhook
  - Exibir nome do participante no frontend

- **Out of scope:**
  - Administração de grupos (adicionar/remover membros)
  - Envio de marcações pelo agente
  - Reações a mensagens
  - Respostas (quoted/reply)

## Behavior Rules

1. **Identificação de grupo:** Se `remote_jid` termina com `@g.us`, é grupo.
2. **Participant é o remetente real:** Em mensagens de grupo, `key.participant` contém o JID de quem enviou.
3. **Contato do participant:** Se não existir, criar contato automático com JID e push_name.
4. **Conversa única por grupo:** Uma conversa com `is_group = true` deve ser única por `(instance, remote_jid)`.
5. **Marcação:** Se `contextInfo.mentionedJid` contém o JID da instância, salvar `is_mentioned = true`.
6. **Visualização no frontend:** Mensagens de grupo mostram `participant_name` acima do balão.

## Inputs and Outputs

### Webhook (entrada)
```json
{
  "key": {
    "remoteJid": "120363301234567890@g.us",
    "participant": "5511999999999@s.whatsapp.net",
    "fromMe": false,
    "id": "BAE5ABCDEF123"
  },
  "pushName": "João Silva",
  "message": { "conversation": "Oi pessoal!" }
}
```

## Error Cases

1. **Webhook sem participant:** Usar `remoteJid` como fallback.
2. **Push name ausente:** Usar o número do JID como nome.
3. **Grupo com nome desconhecido:** Usar `remote_jid` como nome provisório.

## Acceptance Criteria

- [ ] Migration 033 adiciona campos necessários
- [ ] Webhook salva `participant_jid` e cria contato do participant
- [ ] Webhook salva `is_mentioned = true` quando apropriado
- [ ] API retorna `is_group`, `group_name`, `participant_jid`, `is_mentioned`
- [ ] Frontend mostra ícone de grupo e nome do participante
- [ ] Mensagens marcadas têm destaque visual

## Test Plan

1. Enviar mensagem em grupo → uma única conversa com ícone de grupo
2. Dois participantes no mesmo grupo → ambos com seus nomes
3. Marcar o número do CRM → badge de menção
4. Conversas 1:1 continuam normais
