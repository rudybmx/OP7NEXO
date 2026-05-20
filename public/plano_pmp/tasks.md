# TASKS — Feature: Plano de Marketing Personalizado (PMP) v2
**Feature ID:** 001  
**Origem:** plan.md  
**Data:** 2026-05-14

> Formato spec-kit:
> `- [ ] [TID] [P?] [USn] Descrição — arquivo alvo`
> [P] = paralelizável (sem dependência de outra task)
> Executar fase por fase. Não começar Fase B sem Fase A ✅

---

## ✅ Pré-requisitos (agente verifica antes de começar)

- [x] Ler spec.md e plan.md completos
- [x] Stack confirmada: Python/FastAPI + Alembic (API) · Next.js App Router (front)
- [x] Última migration: `027_fix_contatos_unique_workspace.py` → próxima: `028_`
- [x] Tabela de notificações: NÃO existe — criar `pmp_notifications` (plan.md §1.3)
- [x] Rota de destino: `/marketing/demandas/pmp` (UI completa com mock data)
- [ ] Confirmar variável `ANTHROPIC_API_KEY` no servidor antes da Fase B

---

## 🔵 FASE A — Core CRUD

### A1 — Database (Alembic — op7nexo-api)

- [ ] [T001] [US1] Migration `028_pmp_plans.py`: tabela `pmp_plans` conforme plan.md §1.0 — `alembic/versions/028_pmp_plans.py`
- [ ] [T002] [US1] Migration `029_pmp_tasks.py`: tabela `pmp_tasks` conforme plan.md §1.1 (sem FK pmp_phases, phase=VARCHAR, workspace_id obrigatório) — `alembic/versions/029_pmp_tasks.py`
- [ ] [T003] [US4] Migration `030_pmp_checkins_notifications.py`: tabelas `pmp_task_checkins` + `pmp_notifications` conforme plan.md §1.2 e §1.3 — `alembic/versions/030_pmp_checkins_notifications.py`

### A2 — Backend: API de Tarefas (FastAPI — op7nexo-api)

- [ ] [T004] [US1] Criar `app/api/pmp.py` com router `/pmp`:
  - `POST /pmp/plans` — criar plano
  - `GET /pmp/plans?workspace_id=` — listar planos do workspace
  - `POST /pmp/plans/{plan_id}/tasks` — criar tarefa (validar RN01, RN02)
  - `GET /pmp/plans/{plan_id}/tasks?status=&phase=&category=` — listar tarefas
  - `PATCH /pmp/plans/{plan_id}/tasks/{task_id}` — atualizar status (lógica RN03, RN04)
  - `DELETE /pmp/plans/{plan_id}/tasks/{task_id}` — soft delete (campo `ativo`)
- [ ] [T005] [P] Registrar router em `app/main.py`: `app.include_router(pmp.router)`
- [ ] [T006] [P] Testar endpoints com curl após deploy

### A3 — Frontend: Substituir mock por dados reais (op7nexo-front)

- [ ] [T007] [US1] Criar hook `src/hooks/use-pmp-plans.ts` — GET /pmp/plans?workspace_id
- [ ] [T008] [US1] Criar hook `src/hooks/use-pmp-tasks.ts` — GET/POST/PATCH/DELETE /pmp/plans/:id/tasks
- [ ] [T009] [P] Atualizar `src/types/pmp.ts`: status enum → `'todo' | 'in_progress' | 'done' | 'blocked'`; adicionar `'atrasado'` como tipo derivado só no frontend
- [ ] [T010] [P] Atualizar `pmp-mock-data.ts` → manter apenas como fallback de dev local

### A4 — Frontend: Modal Nova Tarefa

- [ ] [T011] [US1] Criar `src/components/demandas/pmp/PmpTaskCreateModal.tsx` conforme layout plan.md §4.2
  - Campos: título, fase (select com 5 opções), categoria (select), responsável (input), date range, descrição
  - Validação inline, Enter no último campo = Salvar, ESC fecha
- [ ] [T012] [P][US1] Integrar modal ao botão "+ Nova Tarefa" em `src/app/(plataforma)/marketing/demandas/pmp/page.tsx`
- [ ] [T013] [P][US1] Após criar: invalidar query de tasks, Gantt atualiza sem reload, toast de sucesso

### A5 — Frontend: Drawer de Status

- [ ] [T014] [US2] Evoluir `src/components/demandas/pmp/PmpTaskDrawer.tsx` conforme plan.md §4.4:
  - Dropdown de status inline (4 estados): DONE pede completed_at, BLOCKED pede blocked_reason
  - Otimistic UI com rollback em erro
- [ ] [T015] [P][US2] Tooltip no hover do bar do Gantt: título, fase, categoria, responsável, datas, status

### A6 — Frontend: KPIs

- [ ] [T016] [P][US6] Atualizar `PmpKpiBar.tsx`: calcular `atrasado` em runtime (`end_date < today && status != done && status != blocked`); excluir BLOCKED do denominador de progresso
- [ ] [T017] [P][US6] Tooltip nos cards KPI com lista das tarefas correspondentes

---

## 🟡 FASE B — Inteligência

> Iniciar somente após Fase A completa e testada.

### B1 — Insights de IA

- [ ] [T018] [US5] Implementar service `app/services/pmp_insights.py` que chama Claude API:
  - Montar contexto: client_name, progress%, lista de tarefas (id, title, status, end_date, phase, category)
  - Parsear resposta JSON (3 insights: ALERT|OPPORTUNITY|RISK)
  - Cache em `pmp_plans.insights_cache` + `insights_updated_at` (TTL 30min)
  - Modelo: `claude-sonnet-4-20250514`, max_tokens: 1000
- [ ] [T019] [P][US5] Endpoint `GET /pmp/plans/{plan_id}/insights?refresh=false` em `app/api/pmp.py`
- [ ] [T020] [P][US5] Frontend `PmpInsights.tsx`: skeleton loader, 3 cards (ALERT/OPPORTUNITY/RISK), botão "Atualizar" com cooldown visual 30min — já existe o componente, só conectar no endpoint real

### B2 — Engine de Lembretes

- [ ] [T021] [US3] Implementar função `job_pmp_reminders()` em `app/services/scheduler.py`:
  - Query: `pmp_tasks` com status NOT IN ('DONE','BLOCKED')
  - `dias_restantes = end_date - today`
  - Disparar REMINDER_D3/D1/D0/OVERDUE com idempotência (checar `pmp_notifications` antes de inserir)
- [ ] [T022] [P][US3] Registrar no APScheduler: `cron(hour=8, minute=0, timezone='America/Sao_Paulo')`
- [ ] [T023] [P][US3] Endpoints em `app/api/pmp.py`:
  - `GET /pmp/notifications?unread=true&workspace_id=`
  - `POST /pmp/notifications/{id}/read`
- [ ] [T024] [P][US3] Frontend: componente `NotificationBell` no layout, polling 30s, badge de não lidas + toast

---

## 🟢 FASE C — Engajamento

> Iniciar somente após Fase B completa.

### C1 — Pulso Semanal

- [ ] [T025] [US4] Função `job_pmp_weekly_pulse()` em `app/services/scheduler.py`:
  - Domingo 18h BRT: para cada responsável com tarefas abertas (end_date ≤ +14 dias)
  - Inserir WEEKLY_PULSE com payload = lista de task_ids; gerar JWT check-in (7 dias, secret `CHECKIN_TOKEN_SECRET`)
  - Enfileirar e-mail com link `/pmp/checkin/{token}`
- [ ] [T026] [P][US4] Segunda 08h: verificar WEEKLY_PULSE sem check-in → PULSE_IGNORED ao estrategista
- [ ] [T027] [P][US4] Endpoint `POST /pmp/tasks/{task_id}/checkin` com auth por token JWT em `app/api/pmp.py`
- [ ] [T028] [US4] Página `src/app/pmp/checkin/[token]/page.tsx` (mobile-first, sem layout do app):
  - Sem autenticação de sessão — valida JWT do token na URL
  - 3 botões por tarefa, motivo obrigatório em BLOCKED
  - POST para cada resposta → confirmação final

---

## ⚪ FASE D — Polimento

> Iniciar somente após Fase C completa.

### D1 — Histórico e PDF

- [ ] [T029] [P][US6] Tab "Histórico" em `PmpVersionHistory.tsx`: linha do tempo de eventos (criações, mudanças de status, check-ins) lidos do endpoint `GET /pmp/plans/{id}/history`
- [ ] [T030] [P][US6] Export PDF via `window.print()` (já existe) — garantir que status reais aparecem no snapshot
- [ ] [T031] [P][US4] `PmpTaskDrawer.tsx`: seção "Histórico de Check-ins" com dados de `GET /pmp/tasks/{id}/checkins`

### D2 — Ajustes de UX

- [ ] [T032] [P] `GanttChart.tsx`: filtro por status já existe — ajustar para novo enum (TODO/IN_PROGRESS/DONE/BLOCKED/atrasado calculado)
- [ ] [T033] [P] `GanttTaskRow.tsx`: bar de tarefa atrasada com border vermelho ou opacidade diferenciada

---

## Definição de "Concluído" (DoD)

Para cada task ser considerada ✅:
1. Código em branch e PR aberto
2. Sem erros de lint / typecheck
3. Funcionalidade testável manualmente seguindo os critérios de aceite da US correspondente
4. Sem regressão nas funcionalidades existentes do PMP

---

## Mapa de Dependências

```
T001 → T002 → T003              (migrations em ordem)
T001 → T002 → T004 → T005      (planos antes de tasks no backend)
T002 → T007, T008, T009         (hooks e types dependem da migration de tasks)
T009 → T011 → T012 → T013      (modal depende de types corretos)
T009 → T014, T015, T016, T017  (drawer e KPI dependem de types)
T003 → T021 → T022              (reminders dependem de pmp_notifications)
T021 → T023, T024               (notif endpoints dependem do job)
T018 → T019 → T020              (insights: service → endpoint → UI)
T025 → T026, T027 → T028        (pulso: job → checkin)
```
