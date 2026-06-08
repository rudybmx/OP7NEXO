# Contratos de API — PMP Edição

Base URL: `https://api.op7franquia.com.br`  
Auth: `Authorization: Bearer <token>`

---

## Unidades

### GET /pmp/workspaces/{workspace_id}/unidades
Retorna unidades ativas do workspace, ordenadas por nome.

**Response 200**
```json
[
  { "id": "uuid", "workspace_id": "uuid", "nome": "Unidade RJ", "ativo": true,
    "created_at": "2026-06-08T...", "updated_at": "2026-06-08T..." }
]
```

### POST /pmp/workspaces/{workspace_id}/unidades
**Body:** `{ "nome": "Unidade SP" }`  
**Response 201:** mesma projeção acima.

### PATCH /pmp/unidades/{unidade_id}
**Body:** `{ "nome": "Novo Nome" }`  
**Response 200:** mesma projeção.

### DELETE /pmp/unidades/{unidade_id}
**Response 204** (soft delete)

---

## Planos

### PATCH /pmp/plans/{plan_id}
Todos os campos opcionais. Para limpar `unidade_id`, enviar `"unidade_id": null` explicitamente.

**Body:**
```json
{
  "client_name": "OdontoCompany RJ",
  "title": "PMP 2026 — Revisado",
  "start_date": "2026-01-01",
  "end_date": "2026-12-31",
  "unidade_id": "uuid | null"
}
```

**Response 200:** projeção completa do plano (mesma de `GET /pmp/plans/{id}`).

### DELETE /pmp/plans/{plan_id}
**Response 204** (soft delete; plano some do GET /plans)

### POST /pmp/plans/{plan_id}/duplicate
**Body:** vazio  
**Response 201:**
```json
{
  "id": "uuid-novo",
  "workspace_id": "uuid",
  "client_name": "OdontoCompany RJ",
  "title": "PMP 2026 — Revisado (cópia)",
  "version": "1.0",
  "status": "TODO",
  "start_date": "2026-01-01",
  "end_date": "2026-12-31",
  "unidade_id": "uuid | null",
  "ativo": true,
  "created_at": "...",
  "updated_at": "..."
}
```
Tarefas ativas do plano original são copiadas com `status='TODO'`, `completed_at=null`, `blocked_reason=null`.

---

## Tarefas

### PATCH /pmp/plans/{plan_id}/tasks/{task_id}
Todos os campos opcionais. Retrocompat: enviar apenas `{status, completed_at, blocked_reason}` continua funcionando.

**Body (edição completa):**
```json
{
  "phase": "conteudo",
  "title": "Criar calendário editorial",
  "category": "CONTEUDO",
  "start_date": "2026-03-01",
  "end_date": "2026-03-31",
  "description": "...",
  "responsible_email": "user@op7.com",
  "display_order": 2,
  "prioridade": "alta",
  "status": "IN_PROGRESS",
  "completed_at": null,
  "blocked_reason": null
}
```

**Response 200:** projeção completa da tarefa incluindo `prioridade`, `ativo`.

**Valores válidos:**
- `phase`: `diagnostico | identidade | conteudo | midia-paga | analise`
- `category`: `MIDIA_PAGA | CONTEUDO | SEO | EVENTO | REUNIAO | EMAIL_MARKETING | SOCIAL | OUTRO`
- `prioridade`: `baixa | media | alta`
- `status`: `TODO | IN_PROGRESS | DONE | BLOCKED`
- `status=DONE` → `completed_at` obrigatório
- `status=BLOCKED` → `blocked_reason` obrigatório
