# Plano técnico — Agenda Core (Fase 1)

Decisões detalhadas no plano-mãe (`/root/.claude/plans/vamos-planehar-a-contru-o-nifty-canyon.md`). Resumo de implementação:

## Backend (op7nexo-api)
- **Migration** `101_agenda_core.py` (down_revision `100`). `CREATE EXTENSION IF NOT EXISTS btree_gist` + EXCLUDE parcial em `agendamentos`. Estilo de `100_notificacoes.py` (`op.create_table`, `postgresql.UUID`, `server_default sa.text("gen_random_uuid()")/now()`).
- **Models** `app/models/crm/agenda.py`: `Agenda, AgendaHorario, AgendaBloqueio, Agendamento`. Padrão de `contato.py` (Base, `created_at/updated_at` mapeados, `workspace_id` FK, `ativo`, relationships `lazy="select"`). Registrar em `app/models/crm/__init__.py` e `app/models/__init__.py`.
- **Serviços** `app/services/agenda/`:
  - `telefone.py` — `canonical_phone_digits(telefone)` (espelha `_canonical_br_jid`); puro/testável.
  - `disponibilidade.py` — `gerar_slots(...)` **puro** (data, fuso, horários, bloqueios, ocupações, capacidade, duração, agora) + `calcular_disponibilidade(db, ...)` wrapper.
  - `agendamento.py` — `criar_agendamento` (normaliza telefone, exceção terceiro, escolhe `slot_index` livre, 409 sem vaga / mesmo telefone), `reagendar`, `cancelar`, `atualizar_status`, `resolver_contato_por_telefone`.
- **Router** `app/api/agenda.py` (padrão `followups.py`: `_resolve_workspace`, Pydantic In/Out/Update, `from_attributes`). Registrar em `app/main.py`. CONTEXT.md no mesmo push (doc-gate).

## Testes (GATE — fase montada = fase testada)
- `tests/test_agenda_telefone.py` — canonização 9º dígito (variantes casam).
- `tests/test_agenda_disponibilidade.py` — `gerar_slots`: horário, almoço, bloqueio, passado, timezone, capacidade; escolha de `slot_index`.
- `tests/test_agenda_endpoints.py` — TestClient + `_FakeDb`/overrides (padrão `test_workspaces.py`): multi-tenancy, 409 anti-double-book.
- Integração: `alembic upgrade head` + `downgrade` em DB scratch; boot-import (`docker run --rm`); curl no workspace dev Doutor Feridas.

## Front (op7nexo-front) — worktree próprio
- Religar `use-agendas.ts`/`use-agendamentos.ts` ao `api-client` (mesma assinatura).
- Grupo "Agenda" na sidebar (`contexto-layout.tsx`) abaixo de Atendimento + rotas `/crm/agenda/*`.
