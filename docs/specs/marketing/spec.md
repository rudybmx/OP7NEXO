# Marketing — Meta Ads UI

## Objetivo
Dashboard de performance do Meta Ads com 5 superfícies principais (Visão Geral, Campanhas, Públicos, Criativos e Anúncios) consumindo os dados da API Python via proxy.

## Estado atual
Implementado e em produção. Visão Geral + Campanhas com dados reais. Públicos com filtro por campanha. Criativos implementados. Anúncios com modal de vídeo, poster HQ e métricas de retenção.

## Escopo
- In scope: Meta Ads (5 superfícies), filtros de período e conta, insights IA, modal de vídeo em Anúncios
- Out of scope: Google Ads (placeholder), LinkedIn, TikTok

## Rota
`/marketing/campanhas/meta-ads`

## Regras de comportamento

### Filtros globais
- Filtro de período: início/fim (default: mês atual)
- Filtro de conta: multi-select das contas ativas do workspace
- Filtros persistem entre abas durante a sessão

### Aba Visão Geral
- KPI cards: Spend, Leads, Impressões, Alcance, Cliques, CTR, CPC, CPM, CPL, Frequência
- Gráfico de linha temporal (Recharts)
- Tabela de contas com métricas individuais
- Seção de insights IA (3 cards OPORTUNIDADE/ALERTA)
- Mock fallback via `src/lib/mock-meta-ads.ts` quando API retorna vazio

### Aba Campanhas
- Tabela hierárquica: campanha → adset → anúncio
- Colunas: nome, status, objetivo, spend, leads, CPL, CTR, CPC, CPM, impressões, alcance

### Aba Públicos
- Breakdowns demográficos (idade/gênero) e placement (facebook/feed, etc.)
- Filtro por campanha: dropdown Radix UI com scroll, opção "Todas"
- Dados via `GET /meta/insights/publicos?workspace_id=...&campaign_id=...`

### Aba Criativos
- Grid de criativos com thumbnail, métricas (spend, leads, CPL, CTR)
- Tipos: IMAGE, VIDEO, CAROUSEL

### Aba Anúncios
- A listagem segue o mesmo conjunto de campanhas visíveis na aba `Campanhas`
- O filtro de campanhas é herdado do shell e a aba não depende de uma campanha ativa única
- Ordenação padrão: `Campanha A-Z` com desempate por `Conjunto` e `Anúncio`
- Ordenação manual disponível por `Anúncio A-Z`, `Campanha A-Z`, `Conjunto A-Z`, `Score`, `Leads`, `CPL`, `CTR`, `Spend`, `Hook Rate` e `Frequência`
- Filtro `Com resultado` mantém apenas itens com `result_count > 0`; se a conta/período não tiver `result_count` preenchido, a API usa `leads > 0` como fallback para não ocultar anúncios que realmente performaram
- O resultado bruto só considera indicadores primários do Meta, como mensagens iniciadas, leads, vídeo e tráfego; `reach`, `post_engagement` e `post_reaction` não devem inflar a listagem
- Linhas compactas: títulos de `Anúncio`, `Campanha` e `Conjunto` com quebra em até 2 linhas; `Status efetivo`, `Plataformas` e `Leads` centralizados e mais estreitos
- Modal de detalhe com player de vídeo nativo quando o criativo é VIDEO
- Poster em alta qualidade vindo de `video_thumbnail_hq_url` com fallback para a thumbnail normal
- Vídeo não inicia automaticamente e não entra em loop
- Métricas exibidas abaixo do player: Hook Rate, tempo médio de visualização e gráfico de retenção
- Contexto operacional preservado: origem, status efetivo, campanha e conjunto
- Destino preservado: headline, descrição, URL final, UTM tags e Pixel ID
- Dados via `GET /meta/insights/anuncios-performance` com `video_source_url`, `video_thumbnail_url`, `video_thumbnail_hq_url`, `video_metrics` e `video_retention_data`

## Padrões técnicos
- Hooks: `src/hooks/use-meta-[recurso].ts`
- Componentes: `src/components/meta-ads/`
- Todas as chamadas via `src/lib/api-client.ts` → `/api/proxy` → API Python
- `workspace_id` do `AuthContext`

## Design
- Design system Classic: navy `#0f2744` + gold `#c9a84c`
- KPI cards: bg `var(--card)`, border 0.5px rgba, padding 12px 14px
- Gráficos Recharts: tooltip bg `#0f2744`, grid `rgba(15,39,68,0.06)`

## Critérios de aceite
- [x] KPIs calculados corretamente (CPL = spend/leads)
- [x] Filtro de conta filtra todos os dados das abas
- [x] Filtro de campanha em Públicos funciona
- [x] Mock fallback ativo quando API retorna vazio
- [x] Insights IA exibidos quando disponíveis
- [x] Modal de Anúncios abre vídeo com poster HQ e exibe retenção/tempo médio sem autoplay
- [x] Anúncios abre com a cascata ligada às campanhas visíveis e a ordenação padrão prioriza `Campanha`

## Open Questions
- Filtro campaign_id + adset_id em Criativos pendente
