# Plan técnico — CRM filtros server-side (Fase 1)

> Plano-mestre completo (contexto, recon, roadmap, riscos): `/root/.claude/plans/anliase-o-plano-abaixo-reflective-lynx.md`.

## Base / branch
- API: worktree `/root/wt/api-crm-filtros-v2` (branch `agent/crm-filtros-v2`, base `agent/central-agentes-f4` — corresponde ao DB vivo 089; **não** `api/production`@074, que derrubaria a Central de Agentes no deploy).
- Front: worktree `/root/wt/front-crm-filtros-v2` (branch `agent/crm-filtros-v2`, base `origin/production`).
- ⚠️ Deploy só após a **Fase 0** (reconciliar branch canônica + cadeia alembic 089) — tarefa de ops/time. Rebasear esta branch na canônica antes de liberar.

## Decisões
- **Sem migration**: só lê colunas existentes (`canal_id`, `is_group`, `status`, `ultima_direcao`, `last_outbound_at`, `responsavel_id`, `equipe_id`, `nao_lidas`). Contorna o landmine de migrations.
- **`sem_resposta`** reusa a verdade do job: import lazy de `app.services.scheduler.ATIVACAO_LEADS_SEM_RESPOSTA` (BackgroundScheduler só instancia no import, não inicia thread → seguro). NÃO embute `is_group` (ortogonal a `tipo`).
- **`arquivadas` tri-state** (None=legado / true / false) separa limpo o caminho legado do V2.
- **Filtros antes de `offset/limit`** — adicionar `.filter()` antes do `order_by` (linha ~322) corrige a paginação.
- **Front V2 atrás de `FILTROS_V2`** (default false): evoluir a barra atual (`--ws-*`, dropdown Radix ref. `filtros-criativos.tsx`), reusar `usePersistedState` (`src/hooks/use-estado-persistido.ts`). Dropdown Responsável só humanos (`use-agentes-disponiveis`); seção IA diferida.

## Arquivos
- API: `app/api/conversas.py` (`listar_conversas` 277–324 + import datetime).
- Front: `src/app/api/whatsapp/conversations/route.ts`, `src/hooks/use-conversas.ts`, `src/components/crm/atendimento/{pagina-atendimento,painel-inbox}.tsx`.

## Verificação
- API isolada: `py_compile` + `import app.main` no container `op7nexo-api`.
- API viva (pós-Fase 0): curl por combinação com `limit` baixo (workspace Doutor Feridas `5cbc61b9-…`, token `admin@op7nexo.com`).
- DB read-only: contagens sanity (`docker exec postgres psql -U postgres -d op7nexo`).
- Front: `tsc --noEmit` em `node:20-alpine` (filtrar pelos próprios arquivos).
- Regressão: flag off.
