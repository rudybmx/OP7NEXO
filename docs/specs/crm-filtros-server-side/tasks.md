# Tasks — CRM filtros server-side (Fase 1)

Ordem: backend → verificar isolado → front route → front UI → verificar. `[P]` = paralelizável.

## Backend (API)
- [ ] T1. `app/api/conversas.py`: import `timedelta, timezone` na linha do `datetime`.
- [ ] T2. `listar_conversas`: adicionar params opcionais `canal_id, escopo, acompanhamento, tipo, arquivadas, nao_lidas`.
- [ ] T3. Substituir o bloco de filtros (310–320) pelos filtros legados + V2 com a precedência de status definida no spec. Manter tudo antes de `order_by`/`offset`/`limit`.
- [ ] T4. Verificação isolada: `py_compile app/api/conversas.py` + `import app.main` no container.

## Front route
- [ ] T5. `conversations/route.ts`: ler novos searchParams, **enviar `canal_id`** + passthrough ao backend; sob `FILTROS_V2`, pular o filtro-em-memória (manter no caminho legado).

## Front UI
- [ ] T6. `use-conversas.ts`: enviar params estruturados quando `FILTROS_V2`.
- [ ] T7. `pagina-atendimento.tsx` + `painel-inbox.tsx`: flag `FILTROS_V2` (default false); barra V2 (`--ws-*`): dropdowns Canal/Responsável(humanos)/Acompanhamento + linha escopo + linha tipo/estado; persistir via `usePersistedState`. Flag off = barra antiga.
- [ ] T8. `tsc --noEmit` (container) — 0 erro novo nos próprios arquivos.

## Entrega
- [ ] T9. Commit granular por repo (worktree); push da branch `agent/crm-filtros-v2`. **NÃO deployar** (depende da Fase 0 + OK explícito por deploy).
- [ ] T10. Atualizar `CONTEXT.md` (API) com 2-3 linhas do endpoint estendido.

## Pendências externas (não-código)
- Fase 0 (ops/time): branch canônica + cadeia alembic 089 + `deploy.env`.
- Rebasear `agent/crm-filtros-v2` na canônica antes de liberar.
- Flip `FILTROS_V2=true` só com OK explícito (muda comportamento visível).
