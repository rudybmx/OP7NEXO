# Plano — AdCreativeModal (Frontend)

## Arquitetura (verificada 2026-05-20)

```
anuncio-detalhe (API)
   └── useAdCreativeDetail (ad-creative-detail.ts, SWR)
         ├── mapDetailToOverview ──► AdCreativeModalOverview (design-system)
         ├── mapDetailToCampaign ──► AdCreativeModalCampaign (design-system)
         └── mapDetailToAds      ──► AdCreativeModalAds      (design-system)

Wrappers de produção (ligam contexto da página → variante):
   visao-geral/top-criativos.tsx ──► ModalAnaliseCriativoOverview (lookupType creative)
   campanhas/tabela-hierarquica.tsx ──► ModalCriativoDs           (lookupType ad)
   anuncios/index.tsx               ──► ModalAnuncioDs            (lookupType ad)
   criativos/index.tsx              ──► ModalAnaliseCriativo  ❌ ANTIGO (migrar)

Shell comum: AdCreativeModalShell + AdCreativeModalStateCard (loading/erro/vazio)
```

## Decisões

1. **3 locais da spec já migrados** — não mexer, só validar.
2. **Aba Criativos migra** para `ModalAnaliseCriativoOverview` (mesmo componente do Top Criativos). As props do antigo (`criativo`, `aberto`, `onFechar`, `filtros{dataInicio,dataFim,contaIds}`, `workspaceId`) batem com as do novo → swap quase 1:1. Confirmar shape de `criativo` (precisa de `.id` = creative_id).
3. **Dead code removível:**
   - `ad-creative-modal.tsx` (órfão confirmado).
   - `visao-geral/modal-analise-criativo.tsx` — só após migrar Criativos (hoje é o único consumidor restante).
   - `modal-anuncio.tsx` / `modal-criativo.tsx` — confirmar zero refs antes de remover.
4. **Commit segmentado** — isolar arquivos do modal; não `git add -A`.

## Arquivos da feature (frontend) a isolar no commit

Novos (??):
- `src/components/design-system/ad-creative-modal-overview.tsx`
- `src/components/design-system/ad-creative-modal-campaign.tsx`
- `src/components/design-system/ad-creative-modal-ads.tsx`
- `src/components/meta-ads/ad-creative-detail.ts`
- `src/components/meta-ads/ad-creative-modal-shell.tsx`
- `src/components/meta-ads/visao-geral/modal-analise-criativo-overview.tsx`
- `src/components/meta-ads/campanhas/modal-criativo-ds.tsx`
- `src/components/meta-ads/anuncios/modal-anuncio-ds.tsx`
- `src/app/(plataforma)/design-system/modal-anuncios/` (page + head)

Modificados (M) — revisar hunks (podem conter mudanças não-modal):
- `src/components/meta-ads/visao-geral/top-criativos.tsx`
- `src/components/meta-ads/campanhas/tabela-hierarquica.tsx`
- `src/components/meta-ads/anuncios/index.tsx`
- `src/components/meta-ads/criativos/index.tsx` (será modificado pela migração)

A remover (parte do trabalho):
- `src/components/design-system/ad-creative-modal.tsx`
- `src/components/meta-ads/visao-geral/modal-analise-criativo.tsx` (pós-migração)

## Riscos

- `criativos/index.tsx` usa `criativoParaTop()` e `ModalPreview` — a migração só troca o componente final do detalhe, mantendo o fluxo de preview. Não tocar `ModalPreview`.
- Working tree tem ~80 arquivos não relacionados; `next build` pode falhar por motivos fora do modal. Validar build antes de atribuir erro à feature.
- `legacyEndpoint` no `useAdCreativeDetail`: confirmar se ainda é necessário (o endpoint principal responde 200). Se legado morto, remover na limpeza.

## Validação (UI)

Não verificável só por leitura de código — exige clicar em produção ou rodar a skill `verify`/`run`. Marcado como pendente nas tasks.
