# Tasks — Agenda Core (Fase 1)

Ordem (paralelas marcadas `[P]`):

## Backend
1. `101_agenda_core.py` — migration (4 tabelas + btree_gist + EXCLUDE + índices).
2. `app/models/crm/agenda.py` — 4 models + registro nos `__init__`. [depende de 1 conceitualmente, código paralelo]
3. `app/services/agenda/telefone.py` — `canonical_phone_digits`. [P]
4. `app/services/agenda/disponibilidade.py` — `gerar_slots` puro + wrapper.
5. `app/services/agenda/agendamento.py` — criar/reagendar/cancelar/status + resolução de contato/telefone.
6. `app/api/agenda.py` — routers + schemas + registro em `main.py`.

## Testes (GATE)
7. `tests/test_agenda_telefone.py` [P]
8. `tests/test_agenda_disponibilidade.py` [P]
9. `tests/test_agenda_endpoints.py` (multi-tenancy + 409)
10. `alembic upgrade/downgrade` scratch + boot-import + curl dev.

## Doc
11. Atualizar `CONTEXT.md` (módulo agenda) — doc-gate no mesmo push.

## Front (worktree separado)
12. Religar hooks. 13. Sidebar + rotas. 14. Typecheck/build + Playwright.

## Deploy
15. Merge ff `api/production`+`production`, `lock-deploy deploy.sh api`/`front`, validar ao vivo, `graphify update`.
