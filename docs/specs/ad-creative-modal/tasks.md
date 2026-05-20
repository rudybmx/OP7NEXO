# Tasks — AdCreativeModal (Frontend)

`[P]` = paralelizável. `[x]` = concluído (verificado por leitura de código).

## Concluído (verificado 2026-05-20)
- [x] T1 — Variante Overview (`design-system/ad-creative-modal-overview.tsx`).
- [x] T2 — Variante Campaign (`design-system/ad-creative-modal-campaign.tsx`).
- [x] T3 — Variante Ads (`design-system/ad-creative-modal-ads.tsx`).
- [x] T4 — `useAdCreativeDetail` + mappers (`meta-ads/ad-creative-detail.ts`).
- [x] T5 — Shell + estados (`ad-creative-modal-shell.tsx`).
- [x] T6 — Wrapper Overview plugado em Top Criativos.
- [x] T7 — Wrapper Campaign plugado na tabela hierárquica de Campanhas.
- [x] T8 — Wrapper Ads plugado no grid de Anúncios.
- [x] T9 — Preview design-system com switcher e mock 100% campos.

## Pendente
- [ ] T10 — **Migrar aba Criativos**: em `criativos/index.tsx`, trocar `ModalAnaliseCriativo` por `ModalAnaliseCriativoOverview`; conferir que `criativoSelecionado.id` = creative_id. Atualizar import.
- [ ] T11 — Remover `ad-creative-modal.tsx` (órfão confirmado).
- [ ] T12 — Pós-T10: remover `visao-geral/modal-analise-criativo.tsx` se sem mais refs. Conferir `modal-anuncio.tsx`/`modal-criativo.tsx` e remover se órfãos.
- [ ] T13 [P] — Avaliar `legacyEndpoint` em `useAdCreativeDetail`. NOTA: primária = `/meta/insights/anuncios/{id}`; `anuncio-detalhe` é o fallback. Confirmar se o fallback ainda é necessário; remover se morto.
- [ ] T13b — **Painéis IA + quality rankings** (gap fim-a-fim). Decidir com usuário: (a) backend adiciona `quality_rankings` + `ai_insight` ao payload e mappers populam (`mapDetailToOverview:377-378`, `mapDetailToAds:454`); ou (b) marcar painéis como placeholder não-implementado no design-system. Hoje hardcoded `undefined` → mock-only.
- [ ] T14 — `next build` / typecheck; corrigir só erros ligados ao modal (working tree tem ruído não relacionado).
- [ ] T15 — **Validação UI em prod** (skill `verify` ou clique manual), 4 abas:
  - Visão Geral › Top Criativos → Overview.
  - Campanhas › Anúncio → Campaign (comparativo do conjunto).
  - Anúncios › card → Ads (funil + distribution).
  - Criativos › card → Overview (após T10).
- [ ] T16 — Commit segmentado: `feat(meta-ads): AdCreativeModal unificado (3 variantes) + migra aba Criativos`. **Não** `git add -A`.
- [ ] T17 — RITUAL DE FIM: `graphify src/ docs/ --update`, atualizar `CONTEXT.md`, `git push`.

## Dependências
- T12 depende de T10. T15 depende de T10+T14. T16 depende de T10-T14.
- T15 exige acesso ao browser/prod — não verificável só por leitura.
