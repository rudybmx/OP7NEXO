# Spec — Lembretes de agendamento (Fase 4)

## Objetivo
Enviar **lembretes por WhatsApp** antes do agendamento (ex.: 1 dia antes às 09:00), reusando a infra de envio + o scheduler. A resposta do paciente é tratada pelo **agente da Fase 3** (remarcar/cancelar) + uma tool nova **`confirmar_presenca`**. NPS é fase separada (fora daqui).

## Decisões (travadas — usuário)
- **Resposta ao lembrete:** o agente cuida (remarcar/cancelar via tools da Fase 3) e ganha **`confirmar_presenca`** (marca status `confirmado`). Onde não há agente ativo, a resposta cai no inbox humano.
- **Lembrete padrão:** toda **agenda nova nasce com 1 lembrete** (canal whatsapp, `dias_antes=1`, `hora_envio=09:00`, template padrão) — editável/removível.
- **v1 = WhatsApp**; envia **só para contatos com conversa existente** (opt-in: já falaram com a clínica). Canais email/sms/push do mockup ficam inertes no backend (só whatsapp envia).

## Arquitetura
- **Varredura periódica** (não enqueue-on-create): job `interval` (~5 min) no `scheduler.py` (padrão `leads_sem_resposta`/`followup_etiqueta`). Self-corrige: pega agendamentos futuros + configs ativas, calcula horário de envio, manda os vencidos ainda-não-enviados. Sobrevive a config mudada/agendamento remarcado.
- **Dedupe durável** via tabela de log (não Redis — não pode re-spammar paciente).

## Migration 104 (`down_revision="103"`; checar `alembic heads` único antes do deploy)
- **`agenda_lembrete_config`**: `id, workspace_id, agenda_id (NULL = global do workspace), canal (default 'whatsapp'), dias_antes (int), hora_envio (HH:mm, p/ dias_antes>0), horas_antes (int, p/ dias_antes=0), mensagem_template (text), tem_midia, midia_url, midia_tipo, ativo (default true), ordem (int), created_at, updated_at`. Espelha o type `LembreteConfig` do front.
- **`agenda_lembrete_envios`** (log/dedupe): `id, workspace_id, agendamento_id (FK→agendamentos), config_id (FK→agenda_lembrete_config), enviado_em, status ('enviado'|'falha'), erro (text null)`. Único por `(agendamento_id, config_id)`.

## Serviço (`app/services/agenda/lembretes.py`)
- `horario_envio(agendamento, config) -> datetime(UTC)`: se `dias_antes>0` → (data do agendamento − dias_antes) às `hora_envio` no fuso da agenda → UTC; se `dias_antes=0` → `data_hora_inicio − horas_antes`.
- `processar_lembretes_pendentes(db, *, agora=None, limit=200) -> dict`: para cada workspace com config ativa, varre agendamentos **futuros + ativos + status ocupante**, casa configs (agenda específica OU global), calcula `horario_envio`; se `agora >= horario_envio` e `agora < data_hora_inicio` e **sem log** em `agenda_lembrete_envios(agendamento,config)` → renderiza template, **acha a conversa+canal do contato** (por `remote_jid` do telefone normalizado; pula se não houver), envia via `_enviar_resposta`, **grava log** (enviado/falha) + persiste a msg de saída (reusa `_enviar_e_persistir`-like). Best-effort por agendamento (1 falha não derruba o lote).
- `render_template(template, agendamento, agenda) -> str`: troca `{{nome}}`(cliente_nome), `{{data}}`(dd/mm), `{{hora}}`(HH:mm tz agenda), `{{servico}}`, `{{profissional}}`(agenda.nome). `{{link_confirmacao}}` → "" no v1 (link público é Fase 5).
- `criar_lembrete_padrao(db, agenda)`: insere o lembrete default (1 dia antes, 09:00, template padrão) — chamado no POST de agenda.

## Tool nova (Fase 3): `confirmar_presenca`
- Em `agente_tools.py`: tool sem args (usa telefone da conversa) → acha o próximo agendamento do contato → `atualizar_status(..., status="confirmado")`. Entra no `TOOLS_SCHEMA` (6 tools agora).

## Routers (`app/api/agenda.py`)
- CRUD `/agenda/lembretes` (GET por workspace + `agenda_id` opcional incl. globais; POST; PATCH; DELETE) — padrão dos serviços/bloqueios. Doc-gate: CONTEXT.md no mesmo push.

## Front
- Religar `src/hooks/use-lembretes.ts` (hoje mock) ao `/agenda/lembretes` via `api-client` (fetch condicional no `workspaceAtual`), **mantendo a assinatura** (`listarLembretes(agendaId)`, `salvarLembrete`, `excluirLembrete`, `alternarStatus`) — `config-lembretes.tsx` não muda. Já está na aba "Lembretes" de Opções Gerais.

## Verificação (gate — "fase montada = fase testada")
- **Backend:** migration up/down em scratch + `alembic heads` único; boot-import; pytest do `horario_envio` (tz, dias_antes>0 e =0) + `render_template`; **teste do scan contra DB real** (seed agenda+config+agendamento+conversa fake → `processar_lembretes_pendentes` envia 1×, loga, **2ª passada não reenvia**); `confirmar_presenca` marca confirmado; lembrete padrão criado no POST de agenda.
- **Front:** typecheck + Playwright (aba Lembretes: criar/editar/toggle/excluir bate no `/agenda/lembretes`).
- Deploy **api → worker** (o job roda no worker). Validar 1 envio real ao vivo (ou simulado por horário).

## Fora de escopo
NPS (fase separada), email/sms/push reais, link público de confirmação (Fase 5), lembrete para contato SEM conversa (opt-in).
