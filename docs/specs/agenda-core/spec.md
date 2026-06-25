# Agenda Nativa — Core (Fase 1)

> Plano-mãe: `/root/.claude/plans/vamos-planehar-a-contru-o-nifty-canyon.md`
> Referência funcional (somente leitura): repositório `qozt_calendar` (calendário clínico). Construímos nativo, marca OP7NEXO.

## Objetivo

Dar **backend real** à agenda que já existe como mockup no front (`op7nexo-front`, hoje em `mock-agenda`), tornando-a nativa do CRM multi-tenant: cada **workspace** tem seu painel de agenda e, dentro dele, **várias agendas** (recurso = profissional/sala/equipamento). Esta fase entrega tabelas, motor de disponibilidade, anti-double-booking e endpoints CRUD + overview, religando os componentes existentes do front a dados reais.

## Escopo

**Dentro (Fase 1):** agendas, horários de funcionamento, bloqueios, agendamentos; cálculo de disponibilidade (slots livres); anti-double-booking; KPIs de overview; endpoints CRUD multi-tenant; endpoint de agendamentos por contato (para a caixa do Atendimento na Fase 2).

**Fora (fases seguintes):** catálogo de serviços (Fase 1.5), caixa no Atendimento (Fase 2), agente de IA com tool-calling (Fase 3), lembretes+NPS (Fase 4), auto-agendamento público origem `paciente` (Fase 5).

## Entidades (espelham `op7nexo-front/src/types/agenda.ts` + colunas de backend)

- **agendas** — `nome, tipo(profissional|sala|equipamento|outro), cor, capacidade_simultanea(1-10), fuso_horario, webhook_url?, ativo` + **backend**: `workspace_id`, `agente_agendamento(desativado|direto|confirmar, default confirmar)`, `responsavel_id?(FK users, nullable)`.
- **agenda_horarios** — por dia da semana: `dia_semana(dom..sab), ativo, hora_inicio, hora_fim(HH:mm), duracao_slot_minutos, tem_almoco, almoco_inicio?, almoco_fim?` + `workspace_id, agenda_id`.
- **agenda_bloqueios** — `agenda_id(null=global), motivo, inicio, fim, tipo(reuniao|feriado|agenda_cheia|manutencao|outro)` + `workspace_id`.
- **agendamentos** — `cliente_nome, cliente_telefone?, cliente_email?, data_hora_inicio, data_hora_fim, servico?, observacoes?, status, origem, criado_por?, cancelamento_motivo?, cancelado_por?, cancelado_em?, reagendado_de?, nps_enviado, nps_enviado_em?, nps_score?` + **backend**: `workspace_id, agenda_id, contato_id?(nullable), cliente_telefone_normalizado?, agendado_por_telefone?, agendado_por_telefone_normalizado?, slot_index, ativo`.

**Enums fixados pelo front:** `status: agendado→confirmado→em_atendimento→compareceu|falta|cancelado|bloqueado|reagendado`; `origem: manual|agente|api|paciente`.

## Regras de negócio

### R1 — Multi-tenancy (OBRIGATÓRIO)
Toda tabela tem `workspace_id`. Toda query filtra por `workspace_id` resolvido do token (`get_workspace_atual` + `verificar_acesso_workspace`, padrão de `app/api/followups.py`). `platform_admin` informa `workspace_id` explícito. Nunca expor dados cross-tenant.

### R2 — Vínculo do agendamento por TELEFONE (decisão do usuário)
- Chave de vínculo com o contato = **`cliente_telefone_normalizado`** (canonização BR do 9º dígito, espelhando `_canonical_br_jid` de `whatsapp_crm_persistence.py`). Guardar telefone cru (exibição) + normalizado (casamento).
- `contato_id` é resolução de **conveniência** (nullable, preenchido quando há contato CRM com telefone batendo). Nunca é a chave de join.
- **Exceção terceiro:** se o agendamento é para outra pessoa que não o dono do telefone da conversa → `cliente_telefone` em branco, `cliente_nome` = paciente, registrar em `observacoes` que é para terceiro, e `agendado_por_telefone[_normalizado]` = telefone de quem marcou. A consulta por contato casa `cliente_telefone_normalizado == P OU agendado_por_telefone_normalizado == P`.

### R3 — Disponibilidade (slots livres)
`GET /agenda/disponibilidade?agenda_id&data&duracao_min`:
- Gera slots de `duracao_min` (ou `duracao_slot_minutos` do horário do dia) dentro de `hora_inicio..hora_fim` **no fuso da agenda**, removendo o intervalo de almoço.
- Remove slots no passado (`agora`), slots cobertos por bloqueios (global + da agenda) e slots cuja ocupação (agendamentos com status `agendado|confirmado|em_atendimento`) já atingiu `capacidade_simultanea`.
- Datetimes armazenados em UTC (`timestamptz`); geração/limites no fuso local da agenda (`zoneinfo`).
- A função de geração é **pura** (entradas explícitas) para testabilidade sem DB.

### R4 — Anti-double-booking matemático
- Constraint Postgres `EXCLUDE USING gist (agenda_id =, slot_index =, tstzrange(inicio,fim) &&)` parcial (`WHERE status IN (agendado,confirmado,em_atendimento) AND ativo`). Exige `CREATE EXTENSION IF NOT EXISTS btree_gist`.
- `criar_agendamento` escolhe o menor `slot_index` livre em `[0, capacidade_simultanea-1]`; se nenhum livre → **409**. A EXCLUDE é a rede de segurança contra corrida (retry/curto-circuito → 409).
- Impede também o **mesmo telefone normalizado** no mesmo horário (409).

### R5 — Ciclo de vida
Status seguem o enum. `PATCH /{id}/status` com extras (`cancelamento_motivo, cancelado_por, reagendado_de`). Cancelar grava `cancelado_em`. Soft-delete = `ativo=false` (status `cancelado`). Só `agendado|confirmado|em_atendimento` ocupam slot.

### R6 — Autonomia do agente (coluna agora, lógica na Fase 3)
`agendas.agente_agendamento` já existe nesta fase (default `confirmar`); a lógica do agente é a Fase 3.

## Critérios de aceite
1. CRUD de agendas/horários/bloqueios/agendamentos multi-tenant; dados de um workspace nunca vazam para outro (testado com 2 workspaces).
2. `GET /agenda/disponibilidade` retorna slots corretos respeitando horário, almoço, bloqueio, passado, timezone e capacidade.
3. Agendar `capacidade+1` no mesmo slot → **409** (anti-double-book). Mesmo telefone no mesmo horário → 409.
4. Variantes do 9º dígito BR (com/sem 9) do mesmo número **casam** o mesmo contato em `GET /agenda/contatos/agendamentos?telefone=`.
5. Exceção terceiro: agendamento sem telefone do paciente, com observação, **aparece** na caixa de quem marcou (via `agendado_por_telefone_normalizado`).
6. `GET /agenda/overview` retorna KPIs (hoje, confirmados, faltas/semana, taxa de comparecimento, split Web/IA por origem).
7. Migration sobe e desce limpa (upgrade+downgrade) em DB scratch; API faz boot-import sem erro.

## Não-objetivos / riscos
- `servico` é texto livre nesta fase (catálogo = Fase 1.5).
- `btree_gist` é dependência de extensão — declarada na migration (situação de extensões é sensível no projeto).
