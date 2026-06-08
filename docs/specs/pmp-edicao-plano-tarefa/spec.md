# Spec — PMP: Edição de Plano e Tarefa

## Contexto

A página de PMP (`/marketing/demandas/pmp`) hoje permite apenas criar planos e tarefas.
Esta spec cobre a adição de **edição, exclusão e duplicação** para ambos os recursos,
além da criação de **unidades** como agrupamento opcional de planos.

## Critérios de Aceite

### Unidades
- [ ] CRUD completo de unidades por workspace (`GET/POST/PATCH/DELETE /pmp/workspaces/{ws}/unidades`)
- [ ] Soft delete (`ativo = false`)
- [ ] `GET` retorna apenas unidades ativas, ordenadas por nome

### Plano
- [ ] `PATCH /pmp/plans/{plan_id}` — editar `client_name`, `title`, `start_date`, `end_date`, `unidade_id`
- [ ] `DELETE /pmp/plans/{plan_id}` — soft delete, plano some do `GET /plans`
- [ ] `POST /pmp/plans/{plan_id}/duplicate` — cria cópia do plano com `title + " (cópia)"`,
      `status='TODO'`, `version='1.0'`; todas as tarefas ativas são copiadas com status reset
- [ ] `GET /plans` e `GET /plans/{id}` filtram `ativo = true`
- [ ] `unidade_id` deve pertencer ao mesmo workspace do plano (validado no backend)

### Tarefa
- [ ] `PATCH .../tasks/{task_id}` aceita todos os campos de uma tarefa (não só status)
- [ ] UPDATE é dinâmico (só campos enviados)
- [ ] Retrocompat: drawer que envia apenas `{status, completed_at, blocked_reason}` continua funcionando
- [ ] `prioridade` agora é persistida (`baixa | media | alta`)
- [ ] RETURNING retorna projeção completa da tarefa (incluindo `prioridade`)

### Schema
- [ ] `pmp_plans` ganha colunas `ativo` e `unidade_id`
- [ ] `pmp_tasks` ganha coluna `prioridade`
- [ ] Nova tabela `pmp_unidades`

## Fora do Escopo
- Interface de seleção de unidade no front (rodada 2)
- Histórico de versão de plano
- Permissões por papel (usa `verificar_acesso_workspace` padrão)
