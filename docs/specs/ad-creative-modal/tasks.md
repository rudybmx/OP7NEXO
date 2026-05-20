# Tasks — `anuncio-detalhe` (Backend)

Ordenadas. `[P]` = paralelizável. `[x]` = já concluído (verificado em prod).

## Concluído (verificado 2026-05-20)
- [x] T1 — Endpoint `GET /meta/insights/anuncio-detalhe` implementado (`meta_insights.py:1962`).
- [x] T2 — Wrapper `/{ad_id}` (`:2506`).
- [x] T3 — Alias `score_ia` no payload.
- [x] T4 — Migration 038 `publisher_platform` criada e **aplicada** em prod.
- [x] T5 — Breakdown `publisher_platform` no sync (`meta_sync.py`).
- [x] T6 — `platforms`, `trend[14]`, `comparativo`, `distribution`, `video_metrics` no payload.
- [x] T7 — Cache em memória TTL 300s.
- [x] T8 — Guarda multi-tenant (`verificar_acesso_workspace`).

## Pendente
- [ ] T9 — **Probe UTM**: achar creative com `utm_source`/`url_tags` não-nulo no banco; chamar endpoint; classificar como extração-OK ou dado-ausente. (bloqueia fechar gap UTM)
- [ ] T10 [P] — Revisar `git diff app/api/meta_insights.py` e `app/services/meta_sync.py`; identificar hunks do modal vs não relacionados.
- [ ] T11 — Commit segmentado da feature:
  - `app/api/meta_insights.py` (hunks do modal), `app/services/meta_tracking.py`, `app/api/meta_delivery.py`, `alembic/versions/038_*.py`, `app/services/meta_sync.py` (hunks do breakdown).
  - Mensagem: `feat(meta-insights): endpoint anuncio-detalhe para AdCreativeModal unificado`.
  - **Não** `git add -A`.
- [ ] T11b — **Gap IA/quality** (se usuário escolher estender backend): adicionar `quality_rankings` (quality/engagement/conversion ranking do Meta, de `raw_payload`) e `ai_insight` (recomendação Escalar|Aguardar|Pausar + causa raiz, derivável de `score_ia`/CPL/CTR/freq) ao payload. Front consome em `mapDetailToOverview`/`mapDetailToAds`. Alternativa: front marca como placeholder (decisão do usuário).
- [ ] T12 [P] — (Opcional) Teste de fumaça em `tests/` para ad / creative / payload-vazio.
- [ ] T13 — RITUAL DE FIM: `graphify src/ docs/ --update`, atualizar `CONTEXT.md` (2-5 linhas sobre o endpoint), `git push`.

## Notas
- T9 depende de acesso ao DB de prod (o `db` local do compose não está rodando). Rodar via psql remoto ou endpoint.
- T11 exige cuidado: o working tree tem ~80 arquivos não relacionados. Confirmar com o usuário antes de push se algum hunk for ambíguo.
