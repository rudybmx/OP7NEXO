# Atendimento — Layout Responsivo (Conversas)

## Objetivo
Tornar a página de Conversas (`/crm/atendimento/conversas`) responsiva e bem encaixada no `<main>` do layout da plataforma, aplicando boas práticas de layout (mobile-first, sem scroll horizontal, sem nested-scroll, touch targets ≥44px). Hoje o layout é um grid fixo de 3 colunas que quebra em telas pequenas.

## Estado atual
- `PaginaAtendimento` (`src/components/crm/atendimento/pagina-atendimento.tsx`) renderiza um `display:grid` fixo: `minmax(320px,360px) | 1fr | minmax(0,320px)`.
- O grid não tem nenhuma adaptação por breakpoint → em <768px as 3 colunas ficam espremidas / geram scroll horizontal e mis-taps.
- O `layout.tsx` detecta `isMobile` e transforma a `BarraLateral` em bottom-nav (<768px), além de reservar `paddingBottom:80` no `<main>` — mas a página de Conversas ignora isso.
- O card externo (radius 28 + padding 12 + sombra) desperdiça área útil em telas pequenas.

## Escopo
- In scope: comportamento responsivo da página de Conversas em 3 faixas (desktop / tablet / mobile); encaixe correto no `<main>`; botão "voltar" no `PainelChat` para o drill-down mobile.
- Out of scope: migração de estilos inline para tokens; rework visual dos painéis internos; mudanças de lógica de negócio (SSE, envio, status); demais páginas do CRM.

## Regras de comportamento

### Breakpoints
- **Desktop (≥1024px)**: mantém o grid de 3 colunas atual (Inbox | Chat | Contato), com o painel de Contato alternável via `painelAberto`.
- **Tablet (768–1023px)**: 2 colunas (Inbox | Chat). O painel de Contato vira um *drawer* sobreposto pela direita (overlay), sem consumir largura do chat.
- **Mobile (<768px)**: coluna única com navegação drill-down.

### Navegação mobile (drill-down)
- A vista é **derivada de `conversaAtivaId`** (fonte única de verdade): `null` → lista (Inbox 100%); preenchido → Chat 100%.
- Selecionar uma conversa leva ao Chat; o header do Chat exibe uma seta "voltar" (44×44) que faz `setConversaAtivaId(null)` e retorna à lista.
- O painel de Contato abre como overlay full-screen sobre o Chat e **inicia fechado** no mobile (não herdar o default `painelAberto = true`).

### Encaixe no `<main>` (invariante de preenchimento)
- A página preenche exatamente o `<main>`: `height:100%` + `box-sizing:border-box`, nunca excedendo a caixa → o `overflowY:auto` do `<main>` não engata (sem scroll duplo). Cada painel mantém seu scroll interno.
- No mobile, remover o "card chrome" (border-radius, padding externo, sombra, borda) para usar a tela inteira; respeitar o `paddingBottom:80` já aplicado pelo `<main>` sem duplicá-lo.

## Inputs e Outputs
- Inputs: largura da viewport (`window.innerWidth` + `resize`), `conversaAtivaId`, `painelAberto`.
- Outputs: layout renderizado conforme a faixa de tela; nenhuma mudança em payloads de API.

## Error cases
- Resize desktop→mobile com conversa aberta: deve cair na vista Chat (derivada de `conversaAtivaId`), sem desync.
- Resize mobile→desktop: restaura o grid de 3 colunas preservando a conversa selecionada.
- Sem conversa selecionada no desktop: coluna do Chat mostra o placeholder "Selecione uma conversa".

## Critérios de aceite
- [ ] Desktop ≥1024px: grid 3 colunas idêntico ao atual.
- [ ] Tablet 768–1023px: 2 colunas + Contato como drawer overlay.
- [ ] Mobile <768px: Inbox em tela cheia; selecionar conversa abre Chat com "voltar"; Contato em overlay full-screen iniciando fechado.
- [ ] Sem scroll horizontal em 375px; sem scrollbar dupla em nenhuma faixa.
- [ ] Touch target do "voltar" ≥44×44px.
- [ ] Última conversa da lista não fica escondida atrás da bottom-nav no mobile.

## Test plan
- Manual: redimensionar em 375 / 768 / 1024 / 1440px e verificar cada faixa + transições de resize com conversa aberta.
- Manual: no mobile, fluxo lista → chat → contato → voltar.
- Build: `next build` sem erros de tipo.

## v2 — Aprofundamento mobile (touch / iOS / safe-area)

Confirmado acesso mobile real (atendentes no celular). Refinamentos sobre o baseline:

- **Breakpoint compartilhado**: hook `useBreakpoint` (em `src/hooks/use-mobile.ts`) consumido 1× em `pagina-atendimento` e repassado por prop `isMobile` aos painéis (sem múltiplos listeners).
- **Sem desmontar no mobile**: Inbox e Chat ficam montados e alternam por `display` (preserva scroll/estado da lista ao voltar do chat).
- **Touch targets ≥44** (§2): botões de ação do inbox 32→40; chips de filtro com `min-height`; ações do header do chat 32→40; "contato" vira icon-only no mobile.
- **Anti-zoom iOS** (§5): inputs/textarea com `fontSize:16` no mobile (busca, select de canal, composer).
- **Safe-area** (§2): composer com `paddingBottom: calc(16px + env(safe-area-inset-bottom))`; bottom-nav e `main` alinhados a `64px + env(safe-area-inset-bottom)`.
- **Bolhas de mensagem**: `maxWidth` 70%→85% no mobile.

### Critérios de aceite v2
- [ ] Nenhum input dispara zoom ao focar no iOS (fontSize ≥16 no mobile).
- [ ] Alvos de toque ≥44px no header do chat e ações do inbox.
- [ ] Voltar do chat preserva a rolagem da lista (sem desmontar).
- [ ] Composer e bottom-nav não colidem com a home-indicator (safe-area).

## Open Questions
- Nenhuma (escopo confirmado: só Conversas, celular+tablet, hook compartilhado).
