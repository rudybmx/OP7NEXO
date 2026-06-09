# CRM — Atendimento e Gestão de Clientes

## Objetivo
Módulo CRM completo: atendimento via WhatsApp em tempo real, follow-up automatizado, agenda, NPS, recorrência e campanhas de conversão.

## Estado atual
- Atendimento (WhatsApp realtime): **Produção**
- Follow-up, Agenda, NPS, Recorrência, Campanhas: **Em desenvolvimento** (mock data)

## Escopo
- In scope: atendimento WhatsApp, follow-up, agenda, NPS, recorrência, campanhas-conversão, cadastros
- Out of scope: email marketing, SMS (não planejado)

## Rotas
```
/crm/paineis              — dashboard CRM
/crm/followup             — follow-up de leads
/crm/agenda               — agendamento de consultas
/crm/nps                  — pesquisa NPS
/crm/recorrencia          — pacientes recorrentes
/crm/campanhas-conversao  — campanhas de conversão
/crm/cadastros/*          — cadastros (canais, geral, usuários)
```

## Regras de comportamento

### Atendimento WhatsApp (Realtime)
Layout: 3 colunas — Inbox | Chat | Contato (desktop). Responsivo: 2 colunas + Contato em drawer (tablet) e coluna única com drill-down (mobile). Ver `docs/specs/atendimento-layout-responsivo/spec.md`.

**Status de conversa:**
```
nova → em_atendimento → aguardando → resgate → resolvido → processando
```

**Regra de reabertura:** conversa com `status = resolvido` que recebe nova mensagem → cria NOVA conversa, não reabre a anterior.

**Assumir conversa da IA:** ao clicar no input de chat, modal pede confirmação para assumir da IA.

**Realtime:**
- SSE via `/api/whatsapp/stream` → indicador visual "ao vivo"
- Polling fallback a cada 4s
- Publica evento no Redis após cada mensagem processada

**APIs de atendimento:**
- `GET /api/whatsapp/conversations` — lista conversas do workspace
- `PATCH /conversations/{id}/status` — muda status
- `POST /conversations/{id}/assumir` — assume da IA
- `POST /api/whatsapp/transfer` — transfere para agente/equipe
- `GET /api/whatsapp/agentes` — lista agentes disponíveis
- `GET /api/whatsapp/stream` — SSE de eventos

### Follow-up
- Cadência configurável por lead
- Tabela de leads com status e tentativas
- Gráfico de tentativas por dia
- Dados via `src/lib/mock-followup.ts` (API não implementada)

### Agenda
- Calendário semanal e mensal
- Modal de agendamento com tipos de serviço
- Configuração de horários, bloqueios e lembretes
- Schema em `src/docs/schema-agenda-nps.md`

### NPS
- Pesquisa de satisfação pós-atendimento
- Score 0-10, agrupamento Promotores/Neutros/Detratores

## Padrões técnicos
- Componentes: `src/components/crm/`, `src/components/followup/`, `src/components/agenda/`
- Hooks: `src/hooks/use-[recurso].ts`
- Mock data: `src/lib/mock-crm.ts`, `src/lib/mock-followup.ts`, `src/lib/kanban-mock-data.ts`

## Débito técnico
- APIs `/api/auth/*` ainda referenciam schema GoTrue legado — não usadas pelo front atual mas precisam de limpeza
- Componentes CRM podem precisar de ajuste visual para novos campos

## Critérios de aceite
- [x] Atendimento exibe conversas em tempo real via SSE
- [x] Assume/transfere/resolve conversa funcionando
- [x] Nova conversa criada ao receber msg em conversa resolvida
- [ ] Follow-up com dados reais da API (pendente)
- [ ] Agenda com dados reais da API (pendente)
- [ ] NPS com dados reais da API (pendente)

## Open Questions
- Quais módulos CRM têm prioridade para implementação real (saindo do mock)?
