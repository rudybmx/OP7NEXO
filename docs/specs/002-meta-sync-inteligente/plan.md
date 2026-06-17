# Plan: Sync Inteligente Meta Ads

Ordem de implementação: **B1 → B2 → B4 → B3 → remediação** (B5 manual). Commit + deploy por fase.

## B1 — `app/services/meta_graph.py` + `config.py`
- `extract_buc_details(resp)` → `{tier, estimated_regain_seconds, by_type, acc_util_pct, acc_reset_seconds}`.
- `MetaGraphClient`: campos `last_tier`, `last_estimated_regain_seconds`; setados em `_update_usage`.
- `_update_usage`: se `usage >= META_USAGE_PAUSE_PCT` e há `estimated_regain`, cooldown = estimated (pausa preventiva exata).
- Ao levantar `MetaRateLimitError`: `cooldown_seconds = min(max(estimated, backoff), META_RETRY_MAX_INTERVAL)`.
- Logar tier 1× (WARNING se `development_access`).
- Config: `META_USAGE_PAUSE_PCT=90`, `META_RETRY_BASE_INTERVAL=60`, `META_RETRY_MAX_INTERVAL=3600`.

## B2 — `alembic/versions/074_sync_jobs_scheduling.py`, `app/models/sync_job.py`, `app/worker.py`
- Migration: `tipo`, `next_run_at`, `attempts` + índice `(status, next_run_at)`. Backfill: linhas existentes `next_run_at=created_at`, `tipo` derivado de `modo_sync` (backfill/leve).
- Worker `_poll_pending_jobs`: claim atômico `UPDATE sync_jobs SET status='running' WHERE id IN (SELECT id FROM sync_jobs WHERE status='pending' AND next_run_at<=NOW() ORDER BY next_run_at LIMIT :n FOR UPDATE SKIP LOCKED) RETURNING id, ads_account_id, tipo`; `:n = cap - ativos`.
- `_run_sync_job` recebe job já `running`; no `MetaRateLimitError` → `_reenfileirar(job_id, attempts, cooldown)`; restante igual.
- `_reenfileirar`: `next_run_at = NOW() + min(max(cooldown_exc, state.cooldown_until_delta, backoff(attempts)), META_RETRY_MAX_INTERVAL)`.
- `marcar_sync_jobs_ativos_como_interrompidos` (meta_sync.py): jobs `running` → `pending`/`next_run_at=NOW()` (não `error`).

## B3 — `app/services/meta_sync.py` + worker map
- Worker: `tipo→(escopo, modo_sync)`; remover a coerção que rebaixa para `recorrente`.
- `sincronizar_conta`/`_sincronizar_conta_impl(escopo)`: branch LEVE pula `_sync_catalogo`/vídeos/`_sync_publicos_*`; PESADO/BACKFILL completos. `_janela_insights_para_conta` estende para escopo.

## B4 — `app/services/scheduler.py`
- `_enfileirar_contas(tipo)`: SELECT contas elegíveis (filtro atual) → INSERT `sync_jobs` dedup.
- Crons: `meta_sync_leve` 6/12/18; `meta_sync_pesado` 3h; `meta_gerar_insights` ~30–40min após janelas; `meta_sweeper` cada 15min.
- `_job_sweeper`: query auditoria (catálogo sem insights / defasada) → enfileira `backfill` serializado.

## B5 — manual (painel Meta), documentado na spec.

## Riscos / mitigações
- **Tempestade de concorrência** ao enfileirar ~72 jobs → cap global + claim atômico (B2) antes de ligar enqueue (B4).
- **Duplo sync** → remover caminho inline do cron (não coexistir).
- **Deploy mata sync** → restart re-enfileira; deploy `api` e `worker` separados.
