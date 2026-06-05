# Implementation Plan: Meta Sync Incremental + UI Contas-Ads

**Branch**: `001-meta-sync-incremental-ui` | **Date**: 2026-06-05
**Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md) | **Data Model**: [data-model.md](data-model.md)

---

## Summary

Implementar sync incremental do catálogo Meta Ads usando watermarks já armazenados (`updated_since`), registrar histórico de sync em nova tabela `meta_sync_log`, expor histórico via endpoint REST, e melhorar a UI da página `/administracao/contas-ads` com dialog de edição centralizado e painel de histórico de sync.

---

## Technical Context

**Language/Version**: Python 3.11 (FastAPI/SQLAlchemy) + TypeScript (Next.js 14)
**Primary Dependencies**: FastAPI, SQLAlchemy 2.x, Alembic, APScheduler, httpx, Radix UI, React
**Storage**: PostgreSQL (nova tabela `meta_sync_log`)
**Testing**: curl para API, build do front para verificação de tipos
**Target Platform**: Linux VPS (api.op7franquia.com.br + nexo.op7franquia.com.br)
**Performance Goals**: Reduzir rodada completa do scheduler de ~2h para <45min; cada conta em <5min
**Constraints**: Multi-tenancy absoluto; soft delete; deploy via `bash /root/deploy.sh`
**Scale/Scope**: 72 contas ativas; 3×/dia; ~70–135 chamadas API por conta

---

## Constitution Check

- [x] Multi-tenancy: `meta_sync_log` acessa via `ads_account_id` que já tem `workspace_id`; endpoints verificam ownership
- [x] Fonte única: Front acessa dados via API FastAPI, não direto ao banco
- [x] Soft delete: não aplicável — `meta_sync_log` é append-only (sem delete de negócio)
- [x] Deploy via script: instruções de deploy usam `bash /root/deploy.sh`
- [x] Migrations imutáveis: nova migration `053_meta_sync_log.py` (última existente: `052`)
- [x] Secrets: nenhum valor de token é logado ou serializado
- [x] Conventional Commits: commits com `feat:` / `migration:`

---

## Project Structure

```text
op7nexo-api/
├── alembic/versions/
│   └── 053_meta_sync_log.py              [NOVO]
├── app/models/
│   └── meta_sync_log.py                  [NOVO]
├── app/services/
│   ├── meta_graph.py                     [MODIFICADO — request_count counter]
│   └── meta_sync.py                      [MODIFICADO — updated_since + log entries]
└── app/api/
    └── meta.py                           [MODIFICADO — novo endpoint historico]

op7nexo-front/
└── src/
    ├── components/administracao/contas-ads/
    │   └── editar-conta-dialog.tsx        [NOVO]
    └── app/(plataforma)/administracao/contas-ads/
        └── page.tsx                       [MODIFICADO — usa editar-conta-dialog]
```

---

## Implementation Steps

### Step 1 — Migration `053_meta_sync_log.py` [BACKEND]

**File**: `alembic/versions/053_meta_sync_log.py`

```python
def upgrade():
    op.create_table(
        "meta_sync_log",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ads_account_id", sa.UUID(), nullable=False),
        sa.Column("sync_mode", sa.String(30), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("stage_failed", sa.String(80), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("campaigns_upserted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("adsets_upserted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ads_upserted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("insights_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("request_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rate_limit_usage_pct", sa.Integer(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["ads_account_id"], ["ads_accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meta_sync_log_account_started", "meta_sync_log",
                    ["ads_account_id", sa.text("started_at DESC")])

def downgrade():
    op.drop_index("ix_meta_sync_log_account_started")
    op.drop_table("meta_sync_log")
```

---

### Step 2 — Model `MetaSyncLog` [BACKEND]

**File**: `app/models/meta_sync_log.py` (novo)

Criar modelo SQLAlchemy 2.x com `Mapped[]` annotations seguindo padrão de `app/models/meta_sync_state.py`. Campos conforme `data-model.md`. Garantir que Alembic detecta o modelo via import em `alembic/env.py` ou via `Base.metadata` já carregado.

---

### Step 3 — `MetaGraphClient` — request_count [BACKEND]

**File**: `app/services/meta_graph.py`

- Adicionar `self._request_count: int = 0` em `__init__` da classe `MetaGraphClient`
- Adicionar `@property request_count(self) -> int: return self._request_count`
- No método `get()` (linha ~174): adicionar `self._request_count += 1` como primeira linha após a validação de parâmetros

---

### Step 4 — Sync Incremental do Catálogo [BACKEND — core]

**File**: `app/services/meta_sync.py`

#### 4a. Helper `_watermark_to_ts(raw) -> int | None`

Adicionar função no topo do módulo:
```python
def _watermark_to_ts(raw: Any) -> int | None:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return int(raw.timestamp())
    try:
        dt = datetime.fromisoformat(str(raw))
        return int(dt.timestamp())
    except Exception:
        return None
```

#### 4b. Alterar assinatura de `_sync_catalogo()` (linha ~1849)

Adicionar parâmetro `watermarks_anteriores: dict | None = None`. Extrair timestamps antes de chamar as 3 funções de catálogo:
```python
prev = watermarks_anteriores or {}
camp_ts = _watermark_to_ts(prev.get("campaigns_updated_time"))
sets_ts = _watermark_to_ts(prev.get("adsets_updated_time"))
ads_ts  = _watermark_to_ts(prev.get("ads_updated_time"))
```

#### 4c. Alterar `_sync_catalog_campanhas()`, `_sync_catalog_conjuntos()`, `_sync_catalog_anuncios_criativos_videos()`

Adicionar parâmetro `updated_since_ts: int | None = None` em cada função. Incluir no dict de params da chamada API quando não-null:
```python
if updated_since_ts is not None:
    params["updated_since"] = updated_since_ts
```

#### 4d. Preservar watermark quando lista vazia

Em `_sync_catalogo()`, após chamar cada função de catálogo: se o resultado for `None` (nenhum item retornado) e havia watermark anterior, mantê-lo:
```python
if watermarks["campaigns_updated_time"] is None and prev.get("campaigns_updated_time"):
    watermarks["campaigns_updated_time"] = _parse_meta_updated_time(prev["campaigns_updated_time"])
```

#### 4e. Passar `watermarks_anteriores` em `_sincronizar_conta_impl()`

Antes da chamada a `_sync_catalogo()`, ler `state.watermarks` e passar:
```python
prev_watermarks = (state.watermarks or {}) if state else {}
catalog_watermarks = _sync_catalogo(
    client, db, conta, meta_account_id, token, totais,
    watermarks_anteriores=prev_watermarks,
)
```

---

### Step 5 — Histórico de Sync em `sincronizar_conta()` [BACKEND]

**File**: `app/services/meta_sync.py`

O `MetaGraphClient` (`client`) é criado dentro de `_sincronizar_conta_impl()`. Para ter acesso ao `request_count` no escopo de `sincronizar_conta()`, retornar o client junto com o resultado, ou expor o count via `totais["api_requests"]` dentro de `_sincronizar_conta_impl()`.

**Abordagem recomendada**: Em `_sincronizar_conta_impl()`, ao final, adicionar `totais["api_requests"] = client.request_count`.

Em `sincronizar_conta()`:

```python
# Após _upsert_meta_sync_state(..., last_run_status="running")
log_entry = MetaSyncLog(
    ads_account_id=uuid.UUID(ads_account_id),
    sync_mode=modo_sync,
    started_at=now,
    status="running",
)
db.add(log_entry)
db.flush()

# ... execução do sync ...

# No caminho de sucesso:
totais_final = result.get("totais") or {}
log_entry.finished_at = datetime.now(timezone.utc)
log_entry.status = "success"
log_entry.campaigns_upserted = totais_final.get("catalog_campanhas", 0)
log_entry.adsets_upserted = totais_final.get("catalog_conjuntos", 0)
log_entry.ads_upserted = totais_final.get("catalog_anuncios", 0)
log_entry.insights_days = totais_final.get("diarios", 0)
log_entry.request_count = totais_final.get("api_requests", 0)
db.flush()

# No except MetaRateLimitError:
log_entry.finished_at = datetime.now(timezone.utc)
log_entry.status = "rate_limited"
log_entry.rate_limit_usage_pct = int(exc.usage_percent or 0)
log_entry.stage_failed = exc.endpoint
db.flush()  # antes do rollback nos dados de negócio

# No except Exception (geral):
log_entry.finished_at = datetime.now(timezone.utc)
log_entry.status = "error"
log_entry.stage_failed = getattr(exc, "stage", None)
log_entry.error_message = str(exc)[:500]
db.flush()
```

**Atenção**: O `db.flush()` do log deve ocorrer ANTES de qualquer `db.rollback()` nos erros. Usar transação separada se necessário (savepoint ou SessionLocal() isolada para o log).

---

### Step 6 — Endpoint `GET /meta/sync/historico/{ads_account_id}` [BACKEND]

**File**: `app/api/meta.py`

Adicionar rota após os endpoints existentes de sync. Seguir padrão de autenticação e verificação de ownership dos outros endpoints do módulo:
- Verificar que `conta.workspace_id` pertence ao workspace do usuário autenticado
- Retornar `[]` (não 404) se conta existe mas não tem histórico
- Incluir campo calculado `duracao_segundos` na serialização

---

### Step 7 — Verificar `GET /ads-accounts` com `sync_state` [BACKEND]

**File**: endpoint de listagem de contas

Confirmar que o retorno já inclui `sync_state`. Se não, adicionar LEFT JOIN com `meta_sync_states` e serializar os campos necessários pelo frontend: `last_run_at`, `last_run_status`, `last_success_at`, `cooldown_until`, `last_error_stage`, `last_error_message`.

---

### Step 8 — `editar-conta-dialog.tsx` [FRONTEND]

**File**: `src/components/administracao/contas-ads/editar-conta-dialog.tsx` (novo)

Extrair todo o conteúdo do Sheet de edição (linhas ~1767–2173 de `page.tsx`) para este componente, trocando o wrapper `Sheet`/`SheetContent` por `Dialog`/`DialogContent`:

```tsx
<Dialog open={!!conta} onOpenChange={(open) => !open && onClose()}>
  <DialogContent
    style={{
      maxWidth: 640,
      width: '95vw',
      maxHeight: '90vh',
      display: 'flex',
      flexDirection: 'column',
      padding: 0,
      ...wsSheetCreamStyle,
    }}
  >
    <DialogTitle className="sr-only">Editar Conta</DialogTitle>
    <DialogDescription className="sr-only">Editar configurações da conta de anúncios</DialogDescription>
    {/* Header */}
    {/* Scroll body com campos + SyncHistoricoPanel */}
    {/* Footer com Cancel/Salvar */}
  </DialogContent>
</Dialog>
```

Referência visual: `src/components/administracao/canais/editar-canal-dialog.tsx`

---

### Step 9 — `SyncHistoricoPanel` [FRONTEND]

Sub-componente dentro de `editar-conta-dialog.tsx`. Carrega `GET /meta/sync/historico/{id}?limit=10` ao montar. Exibe mini-tabela com colunas:

| Data/Hora | Modo | Status | Campanhas | Duração |
|-----------|------|--------|-----------|---------|

Badge de status por cor usando tokens do design system.

---

### Step 10 — Ícones de status na tabela (page.tsx) [FRONTEND]

Adicionar ícones Lucide antes da data na coluna "Última Atualização":
- `CheckCircle2` verde → `last_run_status === "success"`
- `AlertTriangle` coral → `last_run_status === "error"`
- `Clock` amarelo → `cooldown_until && isFutureIso(cooldown_until)`
- `Loader2 animate-spin` azul → sync em andamento (já tratado pela lógica de `syncJobs`)

---

## Deploy Sequence

```bash
# 1. Backend (migration + código)
bash /root/deploy.sh api

# 2. Verificar migration aplicada
cd /root/op7nexo-api && docker compose logs --tail=50 | grep "053\|meta_sync_log"

# 3. Frontend
bash /root/deploy.sh front

# 4. Smoke test
TOKEN=$(curl -s -X POST https://api.op7franquia.com.br/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@op7nexo.com","senha":"admin123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Triggar sync manual
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  https://api.op7franquia.com.br/meta/sync/<ADS_ACCOUNT_ID>

# Consultar histórico (após ~2min)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.op7franquia.com.br/meta/sync/historico/<ADS_ACCOUNT_ID>?limit=5"
```

---

## Verification Checklist

- [ ] Migration `053` aplicada sem erro (`alembic upgrade head`)
- [ ] Sync manual de uma conta cria entrada em `meta_sync_log` com status `success`
- [ ] Segunda rodada da mesma conta: `request_count` menor que a primeira (incremental funcionando)
- [ ] Conta com rate limit: entrada com `status = rate_limited` e `rate_limit_usage_pct` preenchido
- [ ] `GET /meta/sync/historico/{id}` retorna array com entradas e `duracao_segundos`
- [ ] `GET /meta/sync/historico/{id_conta_de_outro_workspace}` retorna 404
- [ ] `GET /meta/sync/historico/{conta_sem_historico}` retorna `[]`
- [ ] Dialog de edição abre centralizado (não como Sheet lateral)
- [ ] Painel "Histórico de Sync" carrega no dialog
- [ ] Tabela exibe ícone correto para cada status de sync
- [ ] `npm run build` no front sem erros de TypeScript
