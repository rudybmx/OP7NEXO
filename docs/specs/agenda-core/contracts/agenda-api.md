# Contratos — Agenda API (Fase 1)

Prefixo: `/agenda`. Auth: Bearer JWT em todas. `workspace_id` resolvido por `get_workspace_atual`; `platform_admin` envia `workspace_id` na query/body. Todas filtram por `workspace_id`.

## Agendas
- `GET /agenda/agendas?workspace_id&incluir_inativas=false` → `Agenda[]`
- `POST /agenda/agendas` `{nome,tipo,cor,capacidade_simultanea,fuso_horario,webhook_url?,agente_agendamento?,responsavel_id?,workspace_id?}` → `Agenda` (201)
- `PATCH /agenda/agendas/{id}` (parcial) → `Agenda`
- `DELETE /agenda/agendas/{id}` → soft delete (`ativo=false`)

## Horários (working hours por agenda)
- `GET /agenda/agendas/{id}/horarios` → `HorarioAgenda[]`
- `PUT /agenda/agendas/{id}/horarios` `{horarios: HorarioAgenda[]}` → substitui o conjunto → `HorarioAgenda[]`

## Bloqueios
- `GET /agenda/bloqueios?workspace_id&agenda_id?&busca?` → `Bloqueio[]`
- `POST /agenda/bloqueios` `{agenda_id?,motivo,inicio,fim,tipo,workspace_id?}` → `Bloqueio` (201)
- `DELETE /agenda/bloqueios/{id}`

## Agendamentos
- `GET /agenda/agendamentos?workspace_id&agenda_ids?&status?&origem?&data_inicio?&data_fim?&busca?&contato_id?&limit&offset` → `Agendamento[]` (ordenado por `data_hora_inicio`)
- `POST /agenda/agendamentos` `{agenda_id,cliente_nome,cliente_telefone?,cliente_email?,data_hora_inicio,data_hora_fim,servico?,observacoes?,origem,para_terceiro?,agendado_por_telefone?,workspace_id?}` → `Agendamento` (201). **409** se sem slot livre ou mesmo telefone no horário.
- `PATCH /agenda/agendamentos/{id}` (parcial: campos editáveis) → `Agendamento`
- `PATCH /agenda/agendamentos/{id}/status` `{status, cancelamento_motivo?, cancelado_por?, reagendado_de?}` → `Agendamento`
- `DELETE /agenda/agendamentos/{id}` → status `cancelado` (soft)

## Disponibilidade
- `GET /agenda/disponibilidade?workspace_id&agenda_id&data=YYYY-MM-DD&duracao_min?` → `{ data, fuso_horario, slots: [{inicio_iso, fim_iso, vagas_restantes}] }`

## Overview (KPIs)
- `GET /agenda/overview?workspace_id&agenda_ids?` → `{ agendamentos_hoje, confirmados_hoje, faltas_semana, taxa_comparecimento, por_origem: {web, ia, manual, ...} }`

## Agendamentos por contato (caixa do Atendimento — Fase 2 consome)
- `GET /agenda/contatos/agendamentos?workspace_id&telefone` → `{ proximos: Agendamento[], historico: Agendamento[], resumo: {total, compareceu, falta, taxa_comparecimento} }`. Casa por `cliente_telefone_normalizado` **OU** `agendado_por_telefone_normalizado`.

## Formato `Agenda` / `Agendamento` (resposta)
Espelha `op7nexo-front/src/types/agenda.ts` (datas em ISO 8601; ids em string). Campos backend extras (`workspace_id`, `slot_index`, `contato_id`, `cliente_telefone_normalizado`, `agendado_por_telefone*`) são incluídos mas opcionais para o front.
