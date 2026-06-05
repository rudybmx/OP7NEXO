# API Contracts: Meta Sync Incremental

---

## GET /meta/sync/historico/{ads_account_id}

**Auth**: Bearer token (admin ou workspace com acesso à conta)
**Verificação de acesso**: Conta deve pertencer ao workspace do usuário autenticado

### Query Parameters
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | 20 | Número de entradas (max 100) |

### Response 200
```json
[
  {
    "id": "uuid",
    "ads_account_id": "uuid",
    "sync_mode": "recorrente",
    "started_at": "2026-06-05T06:00:01Z",
    "finished_at": "2026-06-05T06:04:32Z",
    "status": "success",
    "stage_failed": null,
    "error_message": null,
    "campaigns_upserted": 3,
    "adsets_upserted": 8,
    "ads_upserted": 15,
    "insights_days": 3,
    "request_count": 42,
    "rate_limit_usage_pct": null,
    "duracao_segundos": 271
  }
]
```

**Campo calculado**: `duracao_segundos = (finished_at - started_at).total_seconds()` se ambos não-null, else null.

### Response 200 (sem histórico)
```json
[]
```

### Response 404
```json
{"detail": "Conta não encontrada"}
```

---

## Alteração: GET /ads-accounts

Verificar e garantir que cada item do array já inclui `sync_state` embutido:

```json
{
  "id": "uuid",
  "account_id": "123456",
  "nome": "Conta Franquia SP",
  "sincronizado_em": "2026-06-05T06:04:32Z",
  "periodo_sync_inicio": "2026-01-01",
  "sync_state": {
    "last_run_at": "2026-06-05T06:00:01Z",
    "last_run_status": "success",
    "last_success_at": "2026-06-05T06:04:32Z",
    "last_run_mode": "recorrente",
    "cooldown_until": null,
    "last_error_stage": null,
    "last_error_message": null,
    "last_rate_limit_usage_percent": null
  }
}
```
