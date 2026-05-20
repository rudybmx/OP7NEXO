# AdCreativeModal — Endpoint de Detalhe de Anúncio (`anuncio-detalhe`)

## Objective

Expor, em uma única chamada read-only, todos os dados que o modal unificado de criativo (`AdCreativeModal`) precisa para suas 3 variantes (Overview, Campaign, Ads). Sucesso = front renderiza qualquer variante sem chamadas adicionais e sem campos ausentes.

## Current State

- Endpoint `GET /meta/insights/anuncio-detalhe` **existe e está em produção** (`app/api/meta_insights.py:1962`), retornando **HTTP 200** com payload completo. Verificado em prod (workspace Doutor Feridas, ads reais) em 2026-05-20.
- Endpoint alternativo `GET /meta/insights/anuncio-detalhe/{ad_id}` (`:2506`) delega para o principal.
- **Toda a implementação está NÃO COMMITADA** (working tree, +2313 linhas vs HEAD em `meta_insights.py`). Produção roda código sem ponto de rollback git. Migration 038 (`publisher_platform`) está como arquivo não rastreado mas **já aplicada** no banco de produção.
- Não havia spec dedicada — `docs/specs/meta-ads/spec.md` cobre sync/analytics genérico, não o modal.

## Scope

- In scope:
  - Contrato do endpoint `anuncio-detalhe` (params, payload, regras de agregação).
  - Coluna `publisher_platform` em `meta_anuncios_insights` (migration 038) e seu breakdown no sync.
  - Alias `score_ia` no payload.
  - Suporte a `lookup_type` `ad` e `creative`.
  - Cache em memória (TTL 300s) do payload.
  - Commit segmentado da feature (isolar arquivos do modal dos ~80 arquivos não relacionados no working tree).
- Out of scope:
  - Layout/UI do modal (ver spec do front).
  - Demais features no working tree (pmp, sftp, meta_tokens, equipes, financeiro, etc.).
  - Persistência de UTM histórica (coberto por `docs/specs/meta-ads/plan-utm-persistido.md`).

## Behavior Rules

- `lookup_type` aceita apenas `ad` ou `creative`; outro valor → 400.
- `lookup_type=ad`: filtra por `a.ad_id = :lookup_id`. Retorna `comparativo` (demais criativos do mesmo conjunto, com `is_current`) e `distribution` (cross-campaign).
- `lookup_type=creative`: filtra pela chave canônica `COALESCE(NULLIF(a.creative_id,''), cr.creative_id, a.ad_id)`. `comparativo` pode vir vazio — variante Overview não consome esse campo, então é aceitável.
- `workspace_id` ausente → usa workspace padrão do usuário; se não houver workspace acessível → 403.
- Período padrão: `data_fim` = hoje, `data_inicio` = `data_fim - 29 dias`; se invertido, troca.
- Acesso multi-tenant: `verificar_acesso_workspace` antes de consultar contas.
- Sem contas para o workspace → payload "vazio" estruturado (todos os campos presentes, zerados), nunca erro.
- `score` e `score_ia` carregam o mesmo valor (alias) — front lê `score_ia`.
- Agregação de `meta_anuncios_insights`: `GROUP BY a.data, a.ad_id, a.publisher_platform`; campos não-agrupados via `MAX(...)`; `raw_payload`/`carousel_items` via `(ARRAY_AGG(... ORDER BY last_seen_at DESC))[1]`.
- Metadata do criativo (`creative_meta_row`): `DISTINCT`/`LIMIT 1` por `last_seen_at DESC`, sem agregação.
- `trend`: série dos últimos 14 dias com `date`, `cpl`, `leads`.
- `platforms`: breakdown por `publisher_platform` normalizado (`instagram` → Instagram; `facebook`/`messenger`/`audience_network`/`threads` → Facebook).
- `video_metrics` presente quando `creative_type=VIDEO`; caso contrário pode ser `null`.

## Inputs and Outputs

- Inputs (query): `workspace_id?`, `lookup_id` (obrigatório), `lookup_type` (default `ad`), `data_inicio?`, `data_fim?`, `conta_ids?` (CSV).
- Output: JSON único. Campos top-level: `id, lookup_type, lookup_id, period{inicio,fim,label}, ad_id, creative_id, name, status, creative_type, thumbnail_url, image_url_hq, meta_url, campaign_id, campaign_name, adset_id, adset_name, spend, leads, impressions, reach, clicks, link_click, cpl, ctr, frequencia, score_ia, dias_ativo, trend[], platforms[], comparativo[], distribution[], headline, destination_url, url_tags, utm_source, utm_medium, utm_campaign, utm_content, utm_term, pixel_id, video_metrics, period_rank, period_total`.

## Error Cases

- `lookup_type` inválido → 400 "lookup_type deve ser 'ad' ou 'creative'".
- `workspace_id` malformado → 400 "workspace_id inválido".
- Usuário sem workspace acessível → 403.
- Sem contas no workspace → 200 com payload vazio estruturado (não é erro).
- `GroupingError` Postgres (ARRAY_AGG sem GROUP BY) → **não ocorre na versão atual**; era a hipótese da task original, refutada por teste em prod (200).

## Acceptance Criteria

- [x] `GET /meta/insights/anuncio-detalhe?lookup_type=ad` retorna 200 com payload completo (verificado: ad `120241554595130520`).
- [x] `GET /meta/insights/anuncio-detalhe?lookup_type=creative` retorna 200 (verificado: creative `1549787559580257`).
- [x] `platforms` traz breakdown IG/FB real (migration 038 aplicada).
- [x] `score_ia` presente no payload.
- [ ] Implementação commitada em commit isolado da feature, sem arrastar arquivos não relacionados.
- [ ] Migration 038 rastreada no git.
- [ ] Probe UTM: confirmar se ad CTWA com UTM no banco retorna `utm_*` preenchido (extração) ou null (dado ausente).

## Test Plan

- Manual: `curl` em prod para `ad` e `creative`, validar HTTP 200 e presença dos campos (feito).
- Manual: ad sem dados no período → payload vazio estruturado, 200.
- Manual: `lookup_type=xpto` → 400.
- Probe: `SELECT ... FROM meta_creatives_catalog WHERE utm_source IS NOT NULL LIMIT 1` → chamar endpoint com esse lookup → comparar.
- Automated: nenhum teste automatizado existe hoje para este endpoint (lacuna; opcional adicionar em `tests/`).

## Open Questions

- None (decisões de escopo resolvidas: 4º local Criativos migra no front; commits segmentados).
