# Data Model: Meta Sync Incremental + UI Contas-Ads

**Date**: 2026-06-05

---

## Nova Tabela: `meta_sync_log`

```sql
CREATE TABLE meta_sync_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ads_account_id  UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
    sync_mode       VARCHAR(30) NOT NULL,       -- 'recorrente' | 'backfill'
    started_at      TIMESTAMPTZ NOT NULL,
    finished_at     TIMESTAMPTZ,                -- NULL enquanto em execução
    status          VARCHAR(30) NOT NULL,       -- 'running' | 'success' | 'error' | 'rate_limited' | 'skipped'
    stage_failed    VARCHAR(80),                -- ex: 'catalogo', 'insights', 'publicos'
    error_message   TEXT,
    campaigns_upserted  INTEGER DEFAULT 0,
    adsets_upserted     INTEGER DEFAULT 0,
    ads_upserted        INTEGER DEFAULT 0,
    insights_days       INTEGER DEFAULT 0,
    request_count       INTEGER DEFAULT 0,
    rate_limit_usage_pct INTEGER,              -- NULL se não houve rate limit
    criado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ix_meta_sync_log_account_started
    ON meta_sync_log(ads_account_id, started_at DESC);
```

**Relacionamentos**:
- `ads_account_id` → `ads_accounts.id` (CASCADE DELETE)
- Sem `workspace_id` direto — acesso controlado via `ads_account_id`

**Notas**:
- Status `running` é criado no início do sync; atualizado para `success`/`error`/`rate_limited` ao final
- `finished_at` NULL indica sync em andamento ou interrompido por restart
- `rate_limit_usage_pct` é populado apenas quando `status = 'rate_limited'`

---

## Alteração: `MetaGraphClient` (não-banco)

Adição de contador interno `_request_count: int` (em memória, não persistido):

```python
class MetaGraphClient:
    def __init__(self, ...):
        self._request_count: int = 0

    @property
    def request_count(self) -> int:
        return self._request_count

    def get(self, url, params=None, **kwargs):
        self._request_count += 1
        # ... resto do método existente
```

---

## Alteração: `meta_sync_states.watermarks` (uso, não schema)

O schema de `meta_sync_states.watermarks` não muda. O campo JSONB já existe com estrutura:

```json
{
  "campaigns_updated_time": "2026-06-04T18:00:00+00:00",
  "adsets_updated_time": "2026-06-04T18:00:00+00:00",
  "ads_updated_time": "2026-06-04T18:00:00+00:00"
}
```

A mudança é **funcional**: esses timestamps agora são lidos ANTES de iniciar o catálogo e passados como `updated_since` nas chamadas API.

---

## Modelo Python: `MetaSyncLog`

```python
# app/models/meta_sync_log.py
class MetaSyncLog(Base):
    __tablename__ = "meta_sync_log"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ads_account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ads_accounts.id", ondelete="CASCADE"))
    sync_mode: Mapped[str] = mapped_column(String(30))
    started_at: Mapped[datetime]
    finished_at: Mapped[datetime | None]
    status: Mapped[str] = mapped_column(String(30))
    stage_failed: Mapped[str | None] = mapped_column(String(80))
    error_message: Mapped[str | None]
    campaigns_upserted: Mapped[int] = mapped_column(default=0)
    adsets_upserted: Mapped[int] = mapped_column(default=0)
    ads_upserted: Mapped[int] = mapped_column(default=0)
    insights_days: Mapped[int] = mapped_column(default=0)
    request_count: Mapped[int] = mapped_column(default=0)
    rate_limit_usage_pct: Mapped[int | None]
    criado_em: Mapped[datetime] = mapped_column(default=datetime.now(timezone.utc))
```
