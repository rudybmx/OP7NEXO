# Spec: Central IA — Orquestrador de Agentes

> Status: DRAFT
> Criado: 2026-05-15
> Módulo: `/marketing/central-ai/agentes`

---

## Visão geral

Painel web para orquestrar múltiplos agentes de IA (Claude, Codex, OpenCode) em paralelo, sem precisar de terminal. O usuário cria tarefas via browser, acompanha execução em tempo real, aprova ações críticas e monitora custo.

---

## Problema que resolve

Hoje o usuário abre uma aba de terminal por agente, perde contexto ao fechar, não tem visibilidade de custo e não consegue coordenar múltiplas tarefas simultâneas. O painel centraliza tudo em um único lugar acessível pelo browser.

---

## MVP — Escopo (Fase 1)

### Módulos incluídos no MVP

#### 1. Nova Tarefa
- Formulário: campo de descrição da tarefa (textarea), seleção de projeto, seleção de agente (claude | codex | opencode)
- Ao submeter: cria ticket com status `pending`, dispara execução no backend
- Validação: descrição obrigatória, mínimo 20 caracteres

#### 2. Tickets
- Lista de todos os tickets com: título truncado, projeto, agente, status, tempo decorrido, custo estimado
- Status possíveis: `pending` → `running` → `done` | `error` | `awaiting_approval`
- Clique no ticket: abre painel lateral com logs em tempo real (SSE)
- Ação: cancelar ticket (só se `pending` ou `running`)
- Filtros: por status, por projeto, por agente

#### 3. Dashboard
- Cards KPI: agentes ativos agora, tickets hoje, taxa de sucesso (%), custo total do dia (USD)
- Lista de agentes em execução com progress bar e último log
- Sem gráficos históricos no MVP

#### 4. Caixa de Entrada (human-in-the-loop)
- Notificações de: ticket concluído, ticket com erro, **solicitação de aprovação**
- Aprovação: agente pausa e envia pergunta ao usuário antes de ação destrutiva (ex: deletar arquivo, rodar migration)
- Usuário responde Aprovar / Rejeitar → agente continua ou aborta
- Badge com contador de aprovações pendentes no menu

### Módulos fora do MVP (Fase 2)
- Projetos (segregação de contexto)
- Objetivos / OKR
- Agentes customizados (personas, orçamento por agente)
- Organograma / hierarquia
- Histórico de custo por período
- Retry automático de tickets com erro

---

## Arquitetura técnica

### Fluxo de execução

```
Browser → POST /api/ai/tickets (cria ticket)
        ↓
Backend (FastAPI, VPS) → salva ticket no PostgreSQL
        ↓
Worker assíncrono → spawna processo CLI:
  claude -p "<task>" --cwd /root/op7nexo-front  (ou api, ou ambos)
        ↓ stdout line-by-line
Backend → publica linha no Redis canal `ai:ticket:{id}`
        ↓
GET /api/ai/tickets/{id}/stream (SSE)
        ↓
Browser → renderiza log em tempo real
```

### Human-in-the-loop
- Agente emite linha especial: `[APPROVAL_REQUIRED] <pergunta>`
- Worker detecta padrão, pausa processo (SIGSTOP ou pipe wait)
- Cria registro `ai_approvals` com status `pending`
- Publica evento SSE de aprovação para browser
- Usuário responde → backend envia `yes\n` ou `no\n` pro stdin do processo
- Processo continua

### Estimativa de custo
- Conta tokens via API response (se Anthropic API direta) ou parsing de output do CLI
- Armazena tokens_in + tokens_out por ticket
- Preço fixo configurável: ex. $3/M input, $15/M output (Sonnet)

---

## Modelo de dados (PostgreSQL)

```sql
-- Projetos
ai_projetos (
  id UUID PK,
  workspace_id UUID FK,
  nome TEXT,
  descricao TEXT,
  diretorio TEXT,  -- ex: /root/op7nexo-front
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ
)

-- Tickets
ai_tickets (
  id UUID PK,
  workspace_id UUID FK,
  projeto_id UUID FK ai_projetos,
  titulo TEXT,
  descricao TEXT,
  agente TEXT CHECK (agente IN ('claude', 'codex', 'opencode')),
  status TEXT DEFAULT 'pending',
  pid INTEGER,  -- PID do processo CLI
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  custo_usd DECIMAL(10,6) DEFAULT 0,
  iniciado_em TIMESTAMPTZ,
  finalizado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT now()
)

-- Logs (persistência — SSE é tempo real, este é histórico)
ai_ticket_logs (
  id BIGSERIAL PK,
  ticket_id UUID FK ai_tickets,
  linha TEXT,
  tipo TEXT DEFAULT 'stdout',  -- stdout | stderr | system
  criado_em TIMESTAMPTZ DEFAULT now()
)

-- Aprovações pendentes
ai_approvals (
  id UUID PK,
  ticket_id UUID FK ai_tickets,
  pergunta TEXT,
  status TEXT DEFAULT 'pending',  -- pending | approved | rejected
  resposta_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT now()
)
```

---

## Critérios de aceite (MVP)

- [ ] Criar ticket → agente inicia em < 3s
- [ ] Logs aparecem no browser em tempo real (SSE, < 1s latência)
- [ ] Status do ticket atualiza automaticamente (sem refresh)
- [ ] Ticket com aprovação pendente: pausa execução, mostra pergunta no browser, continua após resposta
- [ ] Ticket concluído: badge "done" + custo exibido
- [ ] Ticket com erro: badge "error" + última linha de stderr visível
- [ ] Cancelar ticket `running`: mata processo, status → `cancelled`
- [ ] Dashboard mostra agentes ativos em tempo real
- [ ] Caixa de Entrada com contador de aprovações pendentes

---

## Perguntas em aberto

1. **Diretório de execução**: agente roda em `/root/op7nexo-front`, `/root/op7nexo-api`, ou usuário escolhe por ticket?
   → Sugestão: campo "projeto" mapeia para diretório fixo configurado no cadastro do projeto

2. **Autenticação do CLI**: `claude` precisa de API key configurada no ambiente da VPS — já está configurada?

3. **Múltiplos workspaces**: tickets isolados por `workspace_id` — agentes de workspaces diferentes podem rodar em paralelo no mesmo servidor?
   → Risco: sem isolamento de filesystem, agente de workspace A poderia editar código de B. MVP: apenas workspace do admin (Doutor Feridas)

4. **Limite de agentes paralelos**: quantos processos CLI simultâneos o servidor aguenta?
   → Sugestão: limit 3 paralelos no MVP, fila para o restante

---

## Fora de escopo (explícito)

- Criação/gestão de personas customizadas
- Orçamento por agente
- Integração com GitHub Issues/PRs automáticos
- Suporte a agentes remotos (só local VPS no MVP)
