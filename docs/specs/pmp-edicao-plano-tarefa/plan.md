# Plan — PMP: Edição de Plano e Tarefa

## Arquitetura

### Backend (`op7nexo-api`)

**Migration `061_pmp_unidades_e_campos.py`**
- `CREATE TABLE public.pmp_unidades (id, workspace_id FK, nome, ativo, created_at, updated_at)`
- `ALTER TABLE pmp_plans ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT true`
- `ALTER TABLE pmp_plans ADD COLUMN unidade_id UUID NULL FK pmp_unidades(id) ON DELETE SET NULL`
- `ALTER TABLE pmp_tasks ADD COLUMN prioridade VARCHAR(20) NOT NULL DEFAULT 'media' CHECK (...)`

**`app/api/pmp.py`**

Schemas novos:
- `PlanUpdate` — campos opcionais para PATCH; valida datas cruzadas via model_fields_set
- `UnidadeIn` — `{nome}`
- `TaskUpdate` — todos os campos de TaskIn + status/completed_at/blocked_reason, todos opcionais

Rotas novas:
- `GET /pmp/workspaces/{ws}/unidades`
- `POST /pmp/workspaces/{ws}/unidades`
- `PATCH /pmp/unidades/{id}`
- `DELETE /pmp/unidades/{id}` (204, soft)
- `PATCH /pmp/plans/{plan_id}` — UPDATE dinâmico
- `DELETE /pmp/plans/{plan_id}` (204, soft)
- `POST /pmp/plans/{plan_id}/duplicate` (201)

Rotas modificadas:
- `GET /pmp/plans` — `AND ativo = true`
- `GET /pmp/plans/{id}` — `AND ativo = true`
- `POST /pmp/plans` — aceita `unidade_id`
- `PATCH /pmp/plans/{plan_id}/tasks/{task_id}` — body: `TaskUpdate`, UPDATE dinâmico, RETURNING completo
- `POST /pmp/plans/{plan_id}/tasks` — inclui `prioridade`, RETURNING completo

### Decisões técnicas
- **UPDATE dinâmico**: `model_fields_set` (Pydantic v2) para detectar campos explicitamente enviados
  no `PATCH /plans`; para tarefa usa `val is not None` pois `None` = "não enviar"
- **Retrocompat PATCH tarefa**: `TaskUpdate` tem todos os campos opcionais; o drawer que manda
  `{status, completed_at, blocked_reason}` funciona sem mudança no frontend
- **Duplicate transacional**: INSERT plano + INSERT ... SELECT tarefas na mesma transação
- **Soft delete plano**: `ativo = false`; `GET /plans` e `GET /plans/{id}` filtram `ativo = true`
- **Segurança multi-tenant**: todo WHERE amarra `workspace_id`; `verificar_acesso_workspace` em todas as rotas
