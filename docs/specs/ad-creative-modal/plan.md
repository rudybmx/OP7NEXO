# Plano — Endpoint `anuncio-detalhe` (Backend)

## Estado verificado (2026-05-20)

| Item | Hipótese da task | Realidade no código/prod |
|------|------------------|--------------------------|
| Bug SQL ARRAY_AGG sem GROUP BY (linha 2102) | Causa 500 em prod | **Refutado.** Prod retorna 200. Linha 2102 (`creative_meta_row`) usa `ORDER BY last_seen_at DESC LIMIT 1`, sem agregação. ARRAY_AGG (2077-2078) tem `GROUP BY a.data, a.ad_id, a.publisher_platform` válido. |
| `score_ia` ausente | Gap a corrigir | **Já resolvido.** Alias em `meta_insights.py:1276/1956/2482`. Payload retorna `score_ia=45`. |
| `publisher_platform` não coletado | Gap a corrigir | **Já resolvido.** Migration 038 aplicada; `platforms[]` retorna IG/FB. |

Conclusão: backend está funcional e em produção. O trabalho real é **rastreabilidade git** + **validação** + **probe UTM**, não correção de bug.

## Arquitetura atual

- `anuncio_detalhe()` (`meta_insights.py:1962`): orquestra. Resolve workspace/período/contas → cache → query métricas (`metric_rows`) → query metadata criativo (`creative_meta_row`) → trend → platforms → comparativo → distribution → tracking → video_metrics → monta payload → cacheia.
- `anuncio_detalhe_por_ad_id()` (`:2506`): wrapper REST para `/{ad_id}`.
- Cache: `_DETALHE_CACHE` dict em memória, TTL 300s, chave por (workspace, lookup_type, lookup_id, período, contas).
- Helpers: `_creative_key_sql`, `_tipo_modal`, `_plataforma_modal`, `_normalizar_status_modal`, `_score_anuncio`.
- Dependência: `extrair_tracking_info` de `app/services/meta_tracking.py`; status de `app/api/meta_delivery.py`.

## Risco crítico: working tree não commitado

`git status` mostra `meta_insights.py` M (+2313 linhas) e arquivos ?? (`meta_tracking.py`, `meta_delivery.py`, `038_*.py`) misturados com ~mudanças não relacionadas (`ads_accounts.py`, `users.py`, `workspaces.py`, `scheduler.py`, etc.). Produção roda sem commit = sem rollback.

### Arquivos da feature AdCreativeModal (backend) a isolar no commit
- `app/api/meta_insights.py` (M) — endpoint + helpers do modal. **ATENÇÃO:** o arquivo também pode conter mudanças não-modal; revisar o diff e, se necessário, commit por hunks (`git add -p`).
- `app/services/meta_tracking.py` (??) — `extrair_tracking_info`.
- `app/api/meta_delivery.py` (??) — resolução de status/veiculação consumida pelo modal.
- `alembic/versions/038_meta_anuncios_publisher_platform.py` (??).
- `app/services/meta_sync.py` (M) — breakdown `publisher_platform` no sync. Revisar diff (pode ter mudanças não-modal).

> Não rodar `git add -A`. Isolar com `git add <arquivo>` / `git add -p`.

## Decisões

1. **Não corrigir o "bug"** — não existe. Documentar a refutação na spec (feito).
2. **Manter ARRAY_AGG com GROUP BY** na query `metric_rows` — está correto, não trocar por DISTINCT ON.
3. **Probe UTM** antes de concluir gap: distinguir extração quebrada de dado ausente.
4. **Commit isolado** da feature; resto do working tree fica para o usuário segmentar depois.
5. **Migration 038** já aplicada — apenas rastrear o arquivo, não reaplicar.

## Passos

1. Probe UTM (DB prod via API ou psql remoto): achar 1 creative com `utm_source`/`url_tags` não-nulo; chamar endpoint; comparar.
2. Revisar `git diff meta_insights.py` e `meta_sync.py` para separar hunks do modal de hunks não relacionados.
3. Commit segmentado: `feat(meta-insights): endpoint anuncio-detalhe para AdCreativeModal unificado` + arquivos da feature + migration 038.
4. (Opcional) Adicionar teste de fumaça em `tests/` para os 3 cenários (ad/creative/vazio).
5. RITUAL DE FIM: `graphify update`, atualizar CONTEXT.md, push.

## Validação

- Endpoint já validado em prod (ad + creative → 200). Ver `contracts/endpoints.md`.
- Validação UI das 3+1 variantes é responsabilidade do front (ver spec do front) — backend só garante o contrato.
