# Tasks — PMP: Edição de Plano e Tarefa

## Rodada 1 — Backend (esta entrega)

- [x] [P] Migration `061_pmp_unidades_e_campos.py`
- [x] [P] `pmp.py`: filtro `ativo = true` em `listar_planos` e `obter_plano`
- [x] [P] `pmp.py`: CRUD endpoints de unidades
- [x] `pmp.py`: `PATCH /plans/{plan_id}` — editar plano (UPDATE dinâmico)
- [x] `pmp.py`: `DELETE /plans/{plan_id}` — soft delete plano
- [x] `pmp.py`: `POST /plans/{plan_id}/duplicate` — clonar plano + tarefas
- [x] `pmp.py`: ampliar `PATCH .../tasks/{task_id}` com `TaskUpdate` + RETURNING completo
- [x] Docs: `spec.md`, `plan.md`, `tasks.md`, `contracts/`
- [x] `CONTEXT.md` da API atualizado
- [ ] Deploy da API (`bash /root/deploy.sh api`) — **aguardando liberação**
- [ ] Testes curl com workspace dev

## Rodada 2 — Frontend

- [ ] `use-pmp-plans.ts`: `atualizarPlano`, `excluirPlano`, `duplicarPlano`
- [ ] `use-pmp-tasks.ts`: `editarTarefa` (ampliar PATCH), `excluirTarefa` já existe
- [ ] `PmpTaskModal.tsx`: novo modal centralizado (substitui `PmpTaskDrawer`)
  - modo visualização (padrão) + modo edição + excluir + duplicar
- [ ] `PmpHeader.tsx`: menu de ações do plano (editar/duplicar/excluir) + `PmpPlanEditModal`
- [ ] `page.tsx`: conectar novos modais e callbacks
- [ ] Restyle v2: tipografia/espaçamento em todos os `Pmp*`/`Gantt*`
