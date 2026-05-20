# AdCreativeModal — Modal Unificado de Criativo (Frontend)

## Objective

Substituir os 3 modais separados e inconsistentes que abrem ao clicar num criativo por um único componente `AdCreativeModal` com 3 variantes (Overview, Campaign, Ads), todas alimentadas pelo endpoint único `anuncio-detalhe`. Sucesso = mesma fonte de dados, UX consistente, zero duplicação de fetch.

## Current State

Verificado em 2026-05-20 (working tree, **não commitado**):

- **Variantes (design-system) já existem:**
  - `src/components/design-system/ad-creative-modal-overview.tsx`
  - `src/components/design-system/ad-creative-modal-campaign.tsx`
  - `src/components/design-system/ad-creative-modal-ads.tsx`
  - `src/components/design-system/ad-creative-modal.tsx` — **ÓRFÃO** (não importado por ninguém; provável versão monolítica inicial, dead code).
- **Camada de dados:** `src/components/meta-ads/ad-creative-detail.ts` — hook `useAdCreativeDetail` (SWR) + mappers `mapDetailToOverview/Campaign/Ads`. Chama `/meta/insights/anuncio-detalhe`, com fallback `legacyEndpoint`.
- **Shell + estados:** `src/components/meta-ads/ad-creative-modal-shell.tsx` (`AdCreativeModalShell`, `AdCreativeModalStateCard` p/ loading/erro/vazio).
- **Wrappers de produção (já plugados):**
  - Visão Geral › Top Criativos → `modal-analise-criativo-overview.tsx` (`ModalAnaliseCriativoOverview`, `lookupType: 'creative'`), montado em `visao-geral/top-criativos.tsx:31`.
  - Campanhas › tabela hierárquica (nível Anúncio) → `campanhas/modal-criativo-ds.tsx` (`ModalCriativoDs`, `lookupType: 'ad'`), montado em `campanhas/tabela-hierarquica.tsx:807`.
  - Anúncios › grid → `anuncios/modal-anuncio-ds.tsx` (`ModalAnuncioDs`, `lookupType: 'ad'`), montado em `anuncios/index.tsx:262`.
- **Preview design-system:** `src/app/(plataforma)/design-system/modal-anuncios/page.tsx` com mock + switcher de variantes (Overview/Video/Campaign/Ads).
- **4º local fora da spec original:** `src/components/meta-ads/criativos/index.tsx:158` ainda monta o modal **ANTIGO** `ModalAnaliseCriativo` (de `visao-geral/modal-analise-criativo.tsx`). Inconsistência.

Os 3 locais da spec já usam o modal unificado. O trabalho restante é: migrar o 4º local, remover dead code, validar UI em produção, commit segmentado.

### Gap end-to-end: painéis de IA e quality rankings NÃO populados
O brief lista dois painéis que estão **hardcoded `undefined`** nos mappers (sem campo no payload do backend):
- `mapDetailToOverview` (`ad-creative-detail.ts:377-378`): `qualityRankings: undefined`, `aiInsight: undefined`.
- `mapDetailToAds` (`:454`): `aiInsight: undefined`.

Ou seja: o componente design-system renderiza esses painéis com **mock**, mas em produção eles nunca recebem dado real. O brief promete "quality rankings do Meta traduzidos para PT" (Overview) e "painel de IA acionável Escalar/Aguardar/Pausar" (Overview) + "painel de IA com causa raiz" (Ads). **Não implementado fim-a-fim.**

Os `signals` (CPL/CTR/Frequência/Pontuação IA) e `funnel` (com identificação de `gargalo`) da variante Ads **são derivados no front** (`buildSignals`/`buildFunnel`) e funcionam — o que falta é só o painel de IA nomeado.

## Scope

- In scope:
  - Confirmar/documentar as 3 variantes e seus wrappers.
  - **Migrar aba Criativos** (`criativos/index.tsx`) do modal antigo para o unificado (variante Overview, `lookupType: 'creative'`).
  - Remover dead code: `ad-creative-modal.tsx` (órfão) e os modais antigos sem mais referências após a migração.
  - Validar render das 4 variantes em produção.
  - Commit segmentado isolando os arquivos do modal dos ~80 não relacionados.
- Out of scope:
  - Endpoint backend (ver spec do op7nexo-api).
  - Demais features no working tree (pmp, sftp, meta_tokens, equipes, financeiro, design-system não-modal).

## Behavior Rules

- Cada wrapper só busca quando `aberto && lookupId && workspaceId && dataInicio && dataFim` (evita fetch desnecessário).
- Overview usa `lookupType: 'creative'`; Campaign e Ads usam `lookupType: 'ad'`.
- `mapDetailToOverview` **não** consome `comparativo` — `comparativo` vazio do backend é aceitável para essa variante.
- Estados loading/erro/vazio sempre via `AdCreativeModalStateCard` dentro de `AdCreativeModalShell`.
- Asset VIDEO → exibe `videoMetrics`; IMAGE → omite.
- Após migração da aba Criativos: clicar num card → abre variante Overview com o `creative_id` do card.

## Inputs and Outputs

- Inputs (por wrapper): `criativo`/`anuncio` (com `id`), `aberto`, `onFechar`, `filtros{dataInicio,dataFim,contaIds}`, `workspaceId`.
- Output: modal renderizado com dados de `anuncio-detalhe` mapeados para a estrutura da variante.

## Error Cases

- Endpoint 4xx/5xx → `AdCreativeModalStateCard` de erro.
- Payload sem dados (período sem métricas) → estado vazio, sem crash.
- Vídeo sem source/thumbnail → fallback visual (`makeFallbackPoster`), sem quebrar o resto.

## Acceptance Criteria

- [x] 3 variantes existem e estão plugadas nos 3 locais da spec.
- [x] `useAdCreativeDetail` consome `anuncio-detalhe` com guarda de `canLoad`.
- [ ] Aba Criativos migrada para o modal unificado (Overview); modal antigo removido.
- [ ] `ad-creative-modal.tsx` órfão removido.
- [ ] Modais antigos sem referência removidos (`modal-analise-criativo.tsx`, `modal-anuncio.tsx`, `modal-criativo.tsx` — confirmar refs antes).
- [ ] Render validado nas 4 abas em produção (clique → modal popula).
- [ ] Build front sem erros de tipo após remoção.
- [ ] Commit segmentado da feature.
- [ ] **Painéis IA + quality rankings**: decidir entre (a) estender payload backend + popular mappers, ou (b) marcar como placeholder explícito. Hoje renderizam mock — não atende o brief fim-a-fim.

## Test Plan

- Manual (prod, nexo.op7franquia.com.br):
  - Visão Geral › Top Criativos → clicar criativo → variante Overview com trend/platforms/score.
  - Campanhas › expandir até Anúncio → clicar → variante Campaign com comparativo do conjunto.
  - Anúncios › grid → clicar card → variante Ads com funil + distribution.
  - Criativos › clicar card → (após migração) variante Overview.
  - Design-system `/design-system/modal-anuncios` → switcher cobre 100% dos campos com mock.
- Build: `next build` / typecheck após remoção de dead code.

## Open Questions

- None (decisões resolvidas: migrar Criativos; remover dead code; commits segmentados).
