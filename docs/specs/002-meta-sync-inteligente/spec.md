# Feature Specification: Sync Inteligente Meta Ads

**Feature Branch**: `002-meta-sync-inteligente`
**Created**: 2026-06-17
**Status**: Em implementação
**Depende de**: `001-meta-sync-incremental-ui` (fundação: worker, `meta_sync_states`/`meta_sync_log`, catálogo incremental — já entregue)

---

## Contexto e Problema

O sync Meta Ads roda em **dois caminhos de orquestração** que ambos **desistem no rate limit**:
1. Crons (`scheduler.py`) 06/12/18 BRT chamam `sincronizar_conta()` inline; no rate limit só logam.
2. Worker (`worker.py`) faz poll de `sync_jobs WHERE status='pending'` e, no `MetaRateLimitError`, marca o job como `error`.

**Auditoria (2026-06-17, produção):** 76 contas Meta, **tier `development_access`** (raiz dos rate limits — quota baixa de `ads_management`). `meta_sync_log` = 1036 success / **636 error** / 3 rate_limited e `sync_jobs` = 165 done / **62 error** → rate limit virando erro. 6 contas com gasto + catálogo mas **zero insights** (backfill do cadastro em massa falhou por rate limit).

## Regras de Negócio (inegociáveis)
1. **Nunca deixar de atualizar.** Rate limit **ADIA** (re-agenda), não cancela. Toda conta, todo dia.
2. **Erro só em desconexão da BM** (token/permissão inválidos → `error` + `sync_paused`). Rate limit **nunca** vira `error`.
3. **Não sobrecarregar:** incremental cirúrgico — insights só últimos 3 dias; catálogo/criativos/públicos só quando necessário.
4. **Usar o que a Meta informa:** `estimated_time_to_regain_access` (header BUC, em minutos) = exatamente quanto esperar.

---

## Requisitos Funcionais

### B1 — Cliente consciente de quota (`meta_graph.py`)
- **FR-B1-1**: Parsear `x-business-use-case-usage` **por `type`** (`ads_insights`, `ads_management`): `call_count`, `total_cputime`, `total_time`, `estimated_time_to_regain_access` (minutos), `ads_api_access_tier`. Parsear `x-ad-account-usage` (`acc_id_util_pct`, `reset_time_duration` seg).
- **FR-B1-2**: Em rate limit, `MetaRateLimitError.cooldown_seconds = max(estimated_time_to_regain_access×60, backoff)` (teto `META_RETRY_MAX_INTERVAL`); fallback ao backoff quando o header vier 0/ausente.
- **FR-B1-3**: Quando `usage ≥ META_USAGE_PAUSE_PCT` e há `estimated_regain`, pausar preventivamente por esse tempo (não bater 100%).
- **FR-B1-4**: Expor o tier no client (`last_tier`); logar `WARNING` uma vez se `development_access`.

### B2 — Worker "nunca desistir" + concorrência segura (`worker.py`, migration 074)
- **FR-B2-1**: `sync_jobs` += `tipo VARCHAR(10) DEFAULT 'leve'`, `next_run_at TIMESTAMPTZ DEFAULT now()`, `attempts INT DEFAULT 0`; índice `(status, next_run_at)`.
- **FR-B2-2**: Poll `WHERE status='pending' AND next_run_at <= NOW() ORDER BY next_run_at`.
- **FR-B2-3**: **Cap global** de threads ativas = `META_SYNC_MAX_PARALLEL_ACCOUNTS`; só puxar `cap - ativos` por ciclo.
- **FR-B2-4**: **Claim atômico** (`FOR UPDATE SKIP LOCKED` + `UPDATE ... status='running'`) para um job nunca ser pego 2×.
- **FR-B2-5**: `MetaRateLimitError` → `status='pending'`, `attempts++`, `next_run_at = NOW() + max(estimated, state.cooldown_until, backoff(attempts))` (teto `META_RETRY_MAX_INTERVAL`). **Nunca `error`.**
- **FR-B2-6**: `MetaContaInacessivelError` → `error` + `sync_paused`.
- **FR-B2-7**: No restart, `marcar_sync_jobs_ativos_como_interrompidos` re-enfileira (`pending`, `next_run_at=NOW()`), não `error`.

### B3 — Escopo leve/pesado/backfill (`meta_sync.py`)
- **FR-B3-1**: Mapear `sync_jobs.tipo` → escopo: `leve→(leve, 3d)`, `pesado→(pesado, 3d)`, `backfill→(backfill, desde periodo_sync_inicio)`. Corrigir a coerção em `worker.py` que rebaixa valores desconhecidos.
- **FR-B3-2**: `_sincronizar_conta_impl(escopo=...)`: **LEVE** só `_sync_diarios`+`_sync_campanhas`+`_sync_anuncios` (pula catálogo, vídeos, públicos). **PESADO/BACKFILL** = tudo.

### B4 — Crons enfileiram + cron pesado + sweeper (`scheduler.py`)
- **FR-B4-1**: Crons **ENFILEIRAM** jobs (não chamam sync inline): `leve` 06/12/18 BRT; `pesado` 03h BRT. Dedup por conta+tipo `pending/running`.
- **FR-B4-2**: `_gerar_insights_ia()` em cron próprio (dados frescos pós-enfileiramento).
- **FR-B4-3**: **Sweeper** a cada `META_SWEEPER_INTERVAL_MINUTES`: detecta conta ativa com catálogo mas sem insights / defasada e enfileira `backfill` serializado (sem backfill ativo da conta; máx N/ciclo).

### B5 — Tier (raiz, manual)
- **FR-B5-1**: Tier confirmado `development_access`. Ação do dono do app: solicitar **Advanced Access / Ads Management Standard Access** no App Dashboard Meta. Pré-requisitos: volume + baixa taxa de erro + verificação de negócio. Fora do escopo de código.

---

## Critérios de Sucesso
- **SC-1**: Rate limit re-agenda (`attempts++`, `next_run_at` futuro), 0 jobs novos em `error` por rate limit.
- **SC-2**: Sob cron leve (~72 jobs), threads ativas no worker nunca passam de `META_SYNC_MAX_PARALLEL_ACCOUNTS`; nenhum job pego 2×.
- **SC-3**: Sync leve roda em segundos, sem etapas de catálogo/públicos no log.
- **SC-4**: Token inválido → `error` + `sync_paused`.
- **SC-5**: As 6 contas-alvo saem de `n_diarios=0` para `dias_com_dados ≈ span`, atraso ≤ 1.

## Premissas
- `estimated_time_to_regain_access` vem em minutos; `reset_time_duration` em segundos.
- Migration livre = `074`. `meta_sync_log`/`meta_sync_state` já existem.
- Multi-tenancy: `sync_jobs`/`meta_sync_log` controlados por `ads_account_id` (que tem `workspace_id`).

## Resultado da remediação (FASE 4 — 2026-06-17)
**As 6 contas "zeradas com gasto" são CONTAS PARADAS legítimas, não vítimas de rate limit.**
O backfill rodou de verdade (ex.: `act_3474824999423572` 316 req, `act_190045211067546` 209 req,
`act_1292888268711928` 302 req) e a Meta retornou **0 linhas de insights** no período
`periodo_sync_inicio→hoje`. Validação direta na Graph API (`act_3474824999423572`, janela
2026-01-01→2026-06-17, nível conta) retornou **0 linhas** — o `amount_spent` (lifetime, R$107k) foi
gasto **antes** da janela de sync. Conclusão: não havia bug de corrupção de insights para essas contas;
`amount_spent` lifetime deu o falso-positivo. A infra B1–B4 está correta e funcionando.

**Gate do sweeper:** por isso o sweeper só re-enfileira backfill se `last_success_at` é nulo ou >12h —
senão repetiria backfill em conta parada a cada ciclo, queimando quota.

## Verificação executada (2026-06-17)
- **B1**: tier `development_access` detectado/logado; `extract_buc_details` parseia por type. ✅
- **B2**: claim atômico `FOR UPDATE SKIP LOCKED` + cap global = 4 (observado 4 running, nunca >4);
  isolamento `plataforma='meta'` (não pega jobs Google). ✅
- **B3**: sync LEVE = **12 requests / 17s** vs **1121** do full sync (~99% redução), catálogo/públicos
  pulados. ✅
- **B4**: 4 crons registrados (leve 6/12/18, pesado 3h, insights +40min, sweeper 15min); sweeper
  enfileira backfill serializado respeitando o cap. ✅
- **B5**: tier confirmado `development_access` → **ação manual do dono**: solicitar Advanced Access
  no App Dashboard Meta (resolve a raiz da quota baixa).
- **Nunca desistir (SC-1)**: `_reenfileirar` validado direto — rate limit → `status='pending'`,
  `attempts++`, `next_run_at = max(estimated, backoff)` no futuro (nunca `error`). ✅
- **Cap sob carga (SC-2)**: `_enfileirar_contas('leve')` (~68 jobs) → `running` manteve-se **≤ 4** com
  60+ pending. Claim atômico + cap global comprovados sob carga real. ✅

## Limitação conhecida (decisão deliberada)
**Dedup do enqueue é POR CONTA (qualquer pending/running), não por conta+tipo** (como sugeria o handoff).
Motivo: em `development_access` um backlog não-deduplicado explodiria a quota. Tradeoff: um job `pesado`
preso em rate limit repetido bloqueia o `leve` (barato, ~12 req) da mesma conta até o pesado completar —
trabalha contra a SC-2 nesse caso de borda. Aceitável porque o pesado também atualiza os números do dia;
quem precisar priorizar o leve deve revisar o dedup. **A raiz é o tier (B5).**
