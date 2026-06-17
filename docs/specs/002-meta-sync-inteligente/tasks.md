# Tasks: Sync Inteligente Meta Ads

## B1 — Cliente consciente de quota
- [x] T101 `extract_buc_details(resp)` em `meta_graph.py` (por type + ad-account-usage)
- [x] T102 `MetaGraphClient.last_tier`/`last_estimated_regain_seconds` em `_update_usage`; pausa preventiva ≥ `META_USAGE_PAUSE_PCT`
- [x] T103 `MetaRateLimitError.cooldown_seconds = min(max(estimated, backoff), META_RETRY_MAX_INTERVAL)`; log tier 1×
- [x] T104 Config `META_USAGE_PAUSE_PCT/META_RETRY_BASE_INTERVAL/META_RETRY_MAX_INTERVAL`
- [x] T105 Deploy api + smoke (log mostra tier; cooldown≈estimated)

## B2 — Worker nunca desistir + concorrência
- [x] T201 Migration `074_sync_jobs_scheduling.py` (tipo/next_run_at/attempts + índice) + model
- [x] T202 Claim atômico `FOR UPDATE SKIP LOCKED` + cap global no `_poll_pending_jobs`
- [x] T203 Re-enfileirar no `MetaRateLimitError` (attempts++, next_run_at futuro); nunca `error`
- [x] T204 `marcar_sync_jobs_ativos_como_interrompidos` → pending (não error)
- [x] T205 Deploy api+worker + smoke (forçar rate limit → pending/attempts++; cap≤N)

## B4 — Crons enfileiram + sweeper
- [x] T401 `_enfileirar_contas(tipo)` + dedup
- [x] T402 Crons leve 6/12/18, pesado 3h; remover sync inline
- [x] T403 `_gerar_insights_ia` em cron próprio
- [x] T404 `_job_sweeper` backfill serializado
- [x] T405 Deploy worker + smoke (cron leve enfileira ~70; sweeper alvos)

## B3 — Escopo leve/pesado/backfill
- [x] T301 Worker map tipo→escopo (remover coerção)
- [x] T302 `_sincronizar_conta_impl(escopo)` ramifica orquestração; LEVE pula catálogo/vídeos/públicos
- [x] T303 `_janela_insights_para_conta(escopo)`
- [x] T304 Deploy api+worker + smoke (leve em segundos, sem catálogo no log)

## Remediação + fim
- [x] T501 Sweeper repovoa 6 contas zeradas; verificar cobertura
- [x] T502 graphify update, CONTEXT.md, spec sync, commit/push por fase
- [x] T503 B5: documentar ação manual de Advanced Access
