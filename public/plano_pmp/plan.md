# PLAN — Feature: Plano de Marketing Personalizado (PMP) v2
**Feature ID:** 001  
**Origem:** spec.md v2  
**Stack alvo:** Python/FastAPI + Alembic (backend) · Next.js App Router (frontend)  
**Data:** 2026-05-14  
**Revisado:** 2026-05-15 (decisões de design fechadas)

---

## 0. Decisões de Design (2026-05-15)

| Ponto | Decisão |
|---|---|
| Fases | Enum VARCHAR na tarefa — sem tabela `pmp_phases` |
| Lista de fases | `diagnostico \| identidade \| conteudo \| midia-paga \| analise` |
| Status no DB | `TODO \| IN_PROGRESS \| DONE \| BLOCKED` — `atrasado/em_risco` calculados em runtime |
| `workspace_id` | **Obrigatório** em todas as tabelas (regra CONTEXT.md) |
| Backend | Python/FastAPI + Alembic (paths: `app/api/pmp.py`, `alembic/versions/028_pmp_*.py`) |
| Rota front | `/marketing/demandas/pmp` (UI existente — só conectar dados reais) |
| Histórico/versões | UI-only por enquanto (`PmpVersionHistory` fica com mock) |

---

## 1. Arquitetura de Dados

### 1.0 Tabela `pmp_plans` (nova — referenciada por pmp_tasks)

```sql
CREATE TABLE pmp_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  client_name     VARCHAR(255) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  version         VARCHAR(20) NOT NULL DEFAULT '1.0',
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'TODO', -- mesmo enum das tasks
  insights_cache  JSONB,
  insights_updated_at TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pmp_plans_workspace ON pmp_plans(workspace_id);
```

### 1.1 Tabela `pmp_tasks` (nova)

```sql
CREATE TABLE pmp_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  plan_id         UUID NOT NULL REFERENCES pmp_plans(id) ON DELETE CASCADE,
  phase           VARCHAR(50) NOT NULL, -- diagnostico|identidade|conteudo|midia-paga|analise
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  responsible_id  UUID REFERENCES users(id),
  responsible_email VARCHAR(255),
  category        VARCHAR(50) NOT NULL, -- MIDIA_PAGA|CONTEUDO|SEO|EVENTO|REUNIAO|EMAIL_MARKETING|SOCIAL|OUTRO
  status          VARCHAR(20) NOT NULL DEFAULT 'TODO', -- TODO|IN_PROGRESS|DONE|BLOCKED
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  completed_at    TIMESTAMPTZ,
  blocked_reason  TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_pmp_tasks_dates CHECK (start_date <= end_date),
  CONSTRAINT chk_pmp_tasks_done CHECK (status != 'DONE' OR completed_at IS NOT NULL),
  CONSTRAINT chk_pmp_tasks_blocked CHECK (status != 'BLOCKED' OR (blocked_reason IS NOT NULL AND blocked_reason != '')),
  CONSTRAINT chk_pmp_tasks_phase CHECK (phase IN ('diagnostico','identidade','conteudo','midia-paga','analise')),
  CONSTRAINT chk_pmp_tasks_status CHECK (status IN ('TODO','IN_PROGRESS','DONE','BLOCKED'))
);

CREATE INDEX idx_pmp_tasks_plan_id ON pmp_tasks(plan_id);
CREATE INDEX idx_pmp_tasks_workspace ON pmp_tasks(workspace_id);
CREATE INDEX idx_pmp_tasks_status ON pmp_tasks(status);
CREATE INDEX idx_pmp_tasks_end_date ON pmp_tasks(end_date);
CREATE INDEX idx_pmp_tasks_responsible ON pmp_tasks(responsible_id);
```

### 1.2 Tabela `pmp_task_checkins` (nova — pulso semanal)

```sql
CREATE TABLE pmp_task_checkins (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  task_id      UUID NOT NULL REFERENCES pmp_tasks(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id),
  response     VARCHAR(20) NOT NULL, -- ON_TRACK | NEEDS_ATTENTION | BLOCKED
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.3 Tabela `pmp_notifications` (nova)

```sql
CREATE TABLE pmp_notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  task_id      UUID NOT NULL REFERENCES pmp_tasks(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id),
  type         VARCHAR(30) NOT NULL, -- REMINDER_D3|REMINDER_D1|REMINDER_D0|OVERDUE|WEEKLY_PULSE|PULSE_IGNORED
  sent_at      TIMESTAMPTZ,
  read_at      TIMESTAMPTZ,
  channel      VARCHAR(20) DEFAULT 'IN_APP', -- IN_APP|EMAIL|WHATSAPP
  payload      JSONB
);

CREATE INDEX idx_pmp_notifications_user ON pmp_notifications(user_id, read_at);
```

---

## 2. API Endpoints

### 2.1 CRUD de Tarefas
```
POST   /api/pmp/plans/:planId/tasks          — criar tarefa
GET    /api/pmp/plans/:planId/tasks          — listar (com filtros: status, phase, category)
PATCH  /api/pmp/plans/:planId/tasks/:taskId  — atualizar (status, campos)
DELETE /api/pmp/plans/:planId/tasks/:taskId  — excluir
```

**PATCH /tasks/:taskId — payloads por caso de uso:**

```json
// Atualizar status → IN_PROGRESS
{ "status": "IN_PROGRESS" }

// Concluir tarefa
{ "status": "DONE", "completed_at": "2026-05-14T18:00:00Z" }

// Bloquear tarefa
{ "status": "BLOCKED", "blocked_reason": "Aguardando aprovação do cliente" }
```

### 2.2 Check-in
```
POST /api/pmp/tasks/:taskId/checkin
Body: { "response": "ON_TRACK" | "NEEDS_ATTENTION" | "BLOCKED", "note": "..." }
```

### 2.3 Insights de IA
```
GET /api/pmp/plans/:planId/insights
```
- Esse endpoint chama internamente a **Claude API** com contexto do plano
- Resposta cacheada por 30 minutos (Redis ou campo `insights_cache` + `insights_updated_at` na tabela `pmp_plans`)
- Forçar refresh: `GET /api/pmp/plans/:planId/insights?refresh=true`

**Prompt para Claude API (usar no backend):**
```
Você é um analista de marketing. Analise este plano e retorne exatamente 3 insights em JSON.
Formato:
[
  { "type": "ALERT" | "OPPORTUNITY" | "RISK", "title": "...", "description": "...", "task_id": "uuid_ou_null" }
]
Retorne somente JSON. Sem markdown.

Contexto do plano:
- Cliente: {{client_name}}
- Mês: {{month}}/{{year}}
- Progresso geral: {{progress}}%
- Tarefas:
{{tasks_list}}
```

### 2.4 Notificações
```
GET  /api/notifications?unread=true       — notificações do usuário logado
POST /api/notifications/:id/read           — marcar como lida
```

---

## 3. Jobs / Cron

### 3.1 `job:pmp-reminders` — Lembretes de prazo
**Frequência:** Diário às 08h00 (horário de Brasília)

```
PARA CADA tarefa com status != DONE e status != BLOCKED:
  dias_restantes = end_date - TODAY

  SE dias_restantes == 3 → disparar REMINDER_D3
  SE dias_restantes == 1 → disparar REMINDER_D1
  SE dias_restantes == 0 → disparar REMINDER_D0
  SE dias_restantes < 0  → disparar OVERDUE (somente se não disparado hoje)

PARA CADA disparo:
  1. Inserir em pmp_notifications (responsável + estrategista)
  2. Se canal EMAIL configurado → enfileirar email
  3. Se canal WHATSAPP configurado → enfileirar WhatsApp
```

### 3.2 `job:pmp-weekly-pulse` — Pulso semanal
**Frequência:** Domingo às 18h00 (horário de Brasília)

```
PARA CADA responsável com tarefas abertas (end_date entre hoje e +14 dias):
  1. Inserir notificação WEEKLY_PULSE com payload = lista de task_ids
  2. Disparar email/WhatsApp com link de check-in

Na segunda-feira às 08h00:
  PARA CADA WEEKLY_PULSE sem resposta de check-in → notificar estrategista (PULSE_IGNORED)
```

---

## 4. Frontend — Componentes

### 4.1 Tela PMP (existente — evoluir)

**Layout mantido:** Header com seletores, KPIs, Insights, Tabs (Plano Ativo / Resumo / Histórico), Gantt

**Mudanças no Header:**
- Botão `+ Nova Tarefa` (laranja/primário) sempre visível ao lado de "Exportar PDF"
- Badge de notificações não lidas (ícone sino)

**Mudanças nos KPIs:**
- Adicionar tooltip em cada KPI com detalhes (ex: quais tarefas estão atrasadas)

**Mudanças nos Insights:**
- Skeleton loader ao abrir o plano (IA buscando)
- Botão "Atualizar insights" com cooldown de 30min
- Cada insight: icon + tipo + título + descrição + link opcional

### 4.2 Modal "Nova Tarefa" (novo)

```
[Modal — largura 560px]

Título *                    [input text]
Fase *                      [select: Diagnóstico / Estratégia / Execução / Análise / Encerramento]
Categoria *                 [select: Mídia Paga / Conteúdo / SEO / Evento / Reunião / E-mail / Social / Outro]
Responsável *               [autocomplete usuários internos] ou [input email para externo]
Data Início * — Data Fim *  [date range picker — inline, side-by-side]
Descrição                   [textarea — opcional, 3 linhas]

[Cancelar]  [Salvar tarefa →]
```

**Comportamento:**
- Validação inline (sem submit + erro em modal separado)
- Tecla Enter no último campo = Salvar
- Após salvar: modal fecha, tarefa aparece no Gantt com animação sutil, toast de sucesso

### 4.3 Card de Tarefa no Gantt (evoluir)

**Hover no bar do Gantt:**
```
[Tooltip/Popover]
Título da tarefa
Fase · Categoria
Responsável: João Silva
01/05 → 15/05 (3 dias restantes)
Status: [pill colorido]
[Editar] [Ver detalhes]
```

**Click no bar:** Abre drawer lateral (não modal) com detalhes completos + histórico de check-ins

### 4.4 Drawer "Detalhes da Tarefa" (novo)

```
[Drawer lateral direito — largura 420px]

[Título da tarefa]          [Editar] [Excluir]
Fase: Execução  |  Categoria: Mídia Paga
Responsável: João Silva
01/05/2026 → 15/05/2026

Status: [dropdown inline]
  ○ A Fazer
  ● Em Andamento    ← ativo
  ○ Concluída
  ○ Bloqueada (com campo motivo)

Descrição:
[texto ou "Sem descrição"]

Histórico de Check-ins:
— 11/05 João: "Em dia" ✅
— 04/05 João: "Precisa de atenção" ⚠️

[Adicionar comentário]
```

### 4.5 Tela de Check-in Semanal (nova rota)
**Rota:** `/pmp/checkin/:token` (acessível sem login — token único por responsável+semana)

```
[Página simples, mobile-first]

📋 Plano: ODC RJ - Barra da Tijuca
Semana: 12 a 18 de Maio de 2026

Suas tarefas desta semana:

┌─────────────────────────────────────────┐
│ Campanha Google Ads — Lançamento        │
│ Prazo: 15/05 · Mídia Paga               │
│                                         │
│ [✅ Em dia] [⚠️ Atenção] [🚫 Bloqueada] │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Post de lançamento — Instagram          │
│ Prazo: 18/05 · Conteúdo                 │
│                                         │
│ [✅ Em dia] [⚠️ Atenção] [🚫 Bloqueada] │
└─────────────────────────────────────────┘

[Enviar respostas]
```

---

## 5. Lógica de Progresso Geral

```
progress_geral = (tarefas_concluidas / total_tarefas) * 100

Onde total_tarefas = todas as tarefas do plano com status != BLOCKED
(tarefas bloqueadas são excluídas do denominador — não penalizam o progresso geral)
```

---

## 6. Decisões Técnicas

| Decisão | Escolha | Motivo |
|---|---|---|
| Cache de insights | Campo `insights_cache JSONB` + `insights_updated_at` em `pmp_plans` | Redis já em uso no projeto mas evitar deps desnecessárias no path de leitura |
| Autenticação check-in externo | Token JWT de uso único (exp: 7 dias), secret: `CHECKIN_TOKEN_SECRET` | Responsável externo não tem login |
| Cron engine | APScheduler existente (`app/services/scheduler.py`) | Não adicionar nova dependência |
| Notificação in-app | Polling 30s via endpoint `/api/notifications?unread=true` | SSE já em uso no CRM; PMP não precisa de realtime — polling suficiente |
| Status change | Otimistic UI + rollback em erro | UX mais fluida |
| atrasado/em_risco | Calculado em runtime no frontend: `end_date < today && status != DONE` = atrasado | Não armazenar estado derivado |
| Backend paths | `app/api/pmp.py` (FastAPI router), migrations `028_*` `029_*` `030_*` | Stack real do projeto |

---

## 7. Ordem de Entrega (Fases de Implementação)

**Fase A — Core (entregar primeiro):**
- Schema DB + migrations
- CRUD de tarefas (API + Modal frontend)
- Atualização de status (Drawer)
- KPIs atualizados em tempo real

**Fase B — Inteligência:**
- Insights de IA (Claude API integration)
- Engine de lembretes (job:pmp-reminders)

**Fase C — Engajamento:**
- Pulso semanal (job:pmp-weekly-pulse)
- Tela de check-in mobile-first
- Notificações in-app (badge + toast)

**Fase D — Polimento:**
- Exportar PDF atualizado com novos campos
- Tab Histórico com linha do tempo de eventos
- Drawer com histórico de check-ins
