# Tasks: Meta Sync Incremental + UI Contas-Ads

**Branch**: `001-meta-sync-incremental-ui`
**Input**: Design documents from `docs/specs/001-meta-sync-incremental-ui/`
**Prerequisites**: plan.md ✓ | spec.md ✓ | research.md ✓ | data-model.md ✓ | contracts/ ✓

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[US#]**: User story a que pertence a tarefa
- Caminhos relativos à raiz de cada repo

---

## Phase 1: Setup (Infraestrutura Compartilhada)

**Purpose**: Migration e model — bloqueiam todas as outras tarefas backend

- [x] T001 Criar migration `alembic/versions/053_meta_sync_log.py` com tabela `meta_sync_log` e índice `ix_meta_sync_log_account_started` conforme `data-model.md`
- [x] T002 Criar model `app/models/meta_sync_log.py` com classe `MetaSyncLog` (SQLAlchemy 2.x `Mapped[]`) e garantir import visível pelo Alembic
- [x] T003 Aplicar migration em produção via `bash /root/deploy.sh api` e verificar que a tabela existe

**Checkpoint**: Tabela `meta_sync_log` criada — backend pode avançar para US1 e US2 em paralelo.

---

## Phase 2: Foundational (Pré-requisito Transversal)

**Purpose**: `request_count` no `MetaGraphClient` — usado por US1 e US2

- [x] T004 Adicionar `self._request_count: int = 0` em `__init__` e `@property request_count` em `app/services/meta_graph.py`; incrementar `self._request_count += 1` no método `get()` a cada chamada HTTP

**Checkpoint**: `client.request_count` disponível — US1 e US2 podem implementar logging de requests.

---

## Phase 3: US1 — Sync Incremental do Catálogo (Priority: P1) 🎯 MVP

**Goal**: Passar `updated_since` nas chamadas de catálogo usando watermarks salvos, reduzindo chamadas API ~80% em contas sem alterações.

**Independent Test**: Após dois syncs manuais da mesma conta, o segundo deve ter `request_count` menor que o primeiro (verificável via `meta_sync_log`) e os logs da API devem mostrar `updated_since` nos params.

- [x] T005 [US1] Adicionar função `_watermark_to_ts(raw: Any) -> int | None` no topo de `app/services/meta_sync.py` (converte ISO string ou datetime para unix timestamp int; retorna None se raw é None ou inválido)
- [x] T006 [US1] Adicionar parâmetro `updated_since_ts: int | None = None` em `_sync_catalog_campanhas()` em `app/services/meta_sync.py`; incluir `params["updated_since"] = updated_since_ts` quando não-null
- [x] T007 [P] [US1] Adicionar parâmetro `updated_since_ts: int | None = None` em `_sync_catalog_conjuntos()` em `app/services/meta_sync.py`; incluir `params["updated_since"] = updated_since_ts` quando não-null
- [x] T008 [P] [US1] Adicionar parâmetro `updated_since_ts: int | None = None` em `_sync_catalog_anuncios_criativos_videos()` em `app/services/meta_sync.py`; incluir `params["updated_since"] = updated_since_ts` quando não-null
- [x] T009 [US1] Alterar assinatura de `_sync_catalogo()` em `app/services/meta_sync.py` para aceitar `watermarks_anteriores: dict | None = None`; extrair `camp_ts`, `sets_ts`, `ads_ts` via `_watermark_to_ts()`; passar para T006/T007/T008; preservar watermark anterior se resultado retornar None (lista vazia da API)
- [x] T010 [US1] Em `_sincronizar_conta_impl()` em `app/services/meta_sync.py`: ler `state.watermarks` antes de chamar `_sync_catalogo()` e passar como `watermarks_anteriores`; adicionar `totais["api_requests"] = client.request_count` ao final da função
- [x] T011 [US1] Deploy backend e smoke test: triggar sync manual de 1 conta duas vezes; confirmar que segunda rodada tem `updated_since` nos logs de request

---

## Phase 4: US2 — Histórico de Sync por Conta (Priority: P1)

**Goal**: Registrar cada execução de sync em `meta_sync_log` e expor via endpoint REST.

**Independent Test**: Após 3 syncs de uma conta (via endpoint manual), `GET /meta/sync/historico/{id}` retorna 3 entradas com `started_at`, `finished_at`, `status` e contagens.

- [x] T012 [US2] Em `sincronizar_conta()` em `app/services/meta_sync.py`: criar entrada `MetaSyncLog(status="running")` com `db.add() + db.flush()` logo após `_upsert_meta_sync_state(..., last_run_status="running")`
- [x] T013 [US2] No caminho de sucesso de `sincronizar_conta()`: atualizar `log_entry` com `status="success"`, `finished_at`, `campaigns_upserted` (de `totais["catalog_campanhas"]`), `adsets_upserted`, `ads_upserted`, `insights_days` (de `totais["diarios"]`), `request_count` (de `totais["api_requests"]`)
- [x] T014 [US2] No `except MetaRateLimitError` de `sincronizar_conta()`: atualizar `log_entry` com `status="rate_limited"`, `finished_at`, `rate_limit_usage_pct`, `stage_failed=exc.endpoint`; garantir que `db.flush()` do log ocorre ANTES de qualquer `db.rollback()`
- [x] T015 [US2] No `except MetaContaInacessivelError` e `except Exception` de `sincronizar_conta()`: atualizar `log_entry` com `status="error"`, `finished_at`, `stage_failed=getattr(exc,"stage",None)`, `error_message=str(exc)[:500]`
- [x] T016 [US2] Adicionar endpoint `GET /meta/sync/historico/{ads_account_id}` em `app/api/meta.py` com query param `limit: int = Query(default=20, ge=1, le=100)`; verificar ownership da conta; retornar `[]` para conta sem histórico; incluir campo calculado `duracao_segundos`
- [x] T017 [US2] Verificar endpoint `GET /ads-accounts` (localizar arquivo em `app/api/`): confirmar que retorna `sync_state` embutido para todas as contas; se não, adicionar LEFT JOIN com `meta_sync_states` e serializar `last_run_at`, `last_run_status`, `last_success_at`, `cooldown_until`, `last_error_stage`, `last_error_message`
- [x] T018 [US2] Deploy backend e smoke test: triggar 2 syncs manuais + 1 com rate limit simulado; validar `GET /meta/sync/historico/{id}` retorna entradas com status, datas e contagens corretas

---

## Phase 5: US3 — Dialog de Edição Centralizado (Priority: P2)

**Goal**: Substituir Sheet lateral por Dialog centralizado e extrair para componente separado com painel de histórico de sync.

**Independent Test**: Clicar em "Editar" em qualquer conta em `/administracao/contas-ads` abre modal centralizado com todos os campos atuais e seção "Histórico de Sync" com últimas 10 rodadas.

- [x] T019 [US3] Criar arquivo `op7nexo-front/src/components/administracao/contas-ads/editar-conta-dialog.tsx` com interface `EditarContaDialogProps { conta: AdsAccount | null; onClose: () => void; onSaved: (c: AdsAccount) => void }`
- [x] T020 [US3] Implementar wrapper `Dialog`/`DialogContent` em `editar-conta-dialog.tsx` com `maxWidth: 640`, `maxHeight: '90vh'`, scroll interno, footer fixo com botões Cancel/Salvar; usar `wsSheetCreamStyle` para estilo; referenciar `editar-canal-dialog.tsx` como padrão visual
- [x] T021 [US3] Migrar todos os campos do formulário do Sheet atual (linhas ~1767–2173 de `page.tsx`) para `editar-conta-dialog.tsx`: nome, BM ID, agrupamento, token, sync_paused + Switch, workspace_ids_acesso com busca; manter estado `EditContaForm` e funções `salvarEdicaoConta`/`fecharEdicaoConta`
- [x] T022 [US3] Adicionar sub-componente `SyncHistoricoPanel` dentro de `editar-conta-dialog.tsx`: `useEffect` carrega `GET /meta/sync/historico/{id}?limit=10` ao montar; exibe mini-tabela com colunas Data/Hora, Modo, Status (badge colorido), Campanhas, Duração; badges: success=verde, error=coral, rate_limited=amarelo, running=azul+spinner
- [x] T023 [US3] Substituir `Sheet` de edição em `op7nexo-front/src/app/(plataforma)/administracao/contas-ads/page.tsx` pelo import de `EditarContaDialog`; remover código do Sheet extraído (linhas ~1767–2173); manter estado `editandoConta` e callbacks
- [x] T024 [US3] Verificar build sem erros: `cd op7nexo-front && npm run build`; deploy via `bash /root/deploy.sh front`; testar abertura do dialog no browser

---

## Phase 6: US4 — Ícones de Status na Tabela (Priority: P2)

**Goal**: Coluna "Última Atualização" exibe ícone visual de status de sync para identificação rápida das 72 contas.

**Independent Test**: A tabela permite identificar visualmente, sem clique, contas em erro (⚠), cooldown (⏳), executando (▶) e atualizadas (✓).

- [x] T025 [US4] Em `op7nexo-front/src/app/(plataforma)/administracao/contas-ads/page.tsx`: adicionar imports `CheckCircle2, AlertTriangle, Clock, Loader2` do `lucide-react`; criar helper `syncStatusIcon(c: AdsAccount)` que retorna o ícone correto baseado em `c.sync_state.last_run_status` e `c.sync_state.cooldown_until`
- [x] T026 [US4] Inserir `syncStatusIcon(c)` no início da célula "Última Atualização" (linha ~1155) em `page.tsx`; garantir alinhamento inline com a data existente
- [x] T027 [US4] Deploy via `bash /root/deploy.sh front` e validar ícones na tabela em produção

---

## Phase 7: Polish & Validação Final

**Purpose**: Grafify update, spec sync, commit e verificação final end-to-end

- [x] T028 Atualizar grafo do backend: `cd /root/op7nexo-api && graphify update .`
- [x] T029 [P] Atualizar grafo do frontend: `cd /root/op7nexo-front && graphify update .`
- [x] T030 Verificar checklist completo de `plan.md` — todos os 11 itens marcados
- [x] T031 Commit final: `git add -A && git commit -m "feat: sync incremental Meta Ads + meta_sync_log + dialog centralizado contas-ads"`
- [x] T032 Atualizar `op7nexo-api/CONTEXT.md` com: nova tabela `meta_sync_log`, sync incremental via `updated_since`, endpoint `GET /meta/sync/historico/{id}`
- [x] T033 [P] Atualizar `op7nexo-front/CONTEXT.md` com: `editar-conta-dialog.tsx` extraído, dialog centralizado, painel de histórico de sync

---

## Dependency Graph

```
T001 → T002 → T003 (migration + model + deploy)
                 ↓
              T004 (request_count no MetaGraphClient)
             ↙      ↘
    US1 (T005–T011)  US2 (T012–T018)   ← podem rodar em paralelo após T004
                                ↓
                        US3 (T019–T024)  ← depende de T016 (endpoint historico)
                        US4 (T025–T027)  ← independente, pode rodar junto com US3
```

**Paralelismo disponível**:
- T006, T007, T008 — alterações em funções independentes do catálogo
- T013, T014, T015 — caminhos de erro independentes em `sincronizar_conta()`
- T028, T029 — graphify de repos diferentes
- T032, T033 — CONTEXT.md de repos diferentes
- US3 e US4 — componentes frontend independentes

---

## Implementation Strategy

**MVP (entregar primeiro)**: Phase 1 + Phase 2 + Phase 3 + Phase 4
→ Sync incremental funcionando + histórico registrado = resolve o problema de contas presas em 02/06

**Incremento 2**: Phase 5 + Phase 6
→ UI melhorada = diagnóstico visual mais rápido

**Rollback**: A migration `053` pode ser revertida com `alembic downgrade -1` sem impacto nos dados existentes. O sync incremental pode ser desabilitado passando `watermarks_anteriores=None` em emergência.

---

## Task Summary

| Phase | Story | Tasks | Parallelizable |
|-------|-------|-------|----------------|
| 1 — Setup | — | T001–T003 | — |
| 2 — Foundation | — | T004 | — |
| 3 — Sync Incremental | US1 (P1) | T005–T011 | T006, T007, T008 |
| 4 — Histórico | US2 (P1) | T012–T018 | T013, T014, T015 |
| 5 — Dialog | US3 (P2) | T019–T024 | — |
| 6 — Ícones | US4 (P2) | T025–T027 | — |
| 7 — Polish | — | T028–T033 | T028/T029, T032/T033 |
| **Total** | | **33 tarefas** | **9 paralelizáveis** |
