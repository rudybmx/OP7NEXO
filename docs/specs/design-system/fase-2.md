# Fase 2 (contida) — Remover camada de tokens HeroUI morta + atalhos de estilo

> Escolha do usuário (2026-06-25): **limpeza contida**, não o flatten global. ⚠️ O app **continua glassy** — os `--ws-*` diretos (238 arquivos) ficam; vira flat só num épico futuro (F3 por área). Esta fase remove a camada *morta* e os *atalhos*, e fecha os débitos da F1.

## Objetivo

Remover a camada de tokens HeroUI-derivada (2º `@theme inline` + bloco `:root` HeroUI — **0 uso real confirmado**: nem classes `bg-success`/etc., nem `var(--default)`/etc.), redefinir os neutros presos (`accent`/`secondary`/`popover`), e aposentar os atalhos de estilo glass (`glass-card` = 5 usos, objetos de `src/lib/utils.ts` = 41 usos → Card/Button/Tabs shadcn). Fora de escopo: os `--ws-*` diretos.

## P1 — Tokens (`globals.css`) — a parte delicada (mudança global, verificar por amostragem)

**Remover (lixo morto, seguro):**
- 2º `@theme inline` (≈106–133) inteiro.
- Bloco `:root` "HeroUI component tokens" (≈308–343): `--disabled-opacity`, `--cursor-*`, `--ease-*`, `--ring-offset-width`, `--default*`, `--accent*` (heroui), `--danger*`, `--success*`, `--warning*`, `--focus`, `--surface-secondary`, `--separator*`.
- `.dark`: `--surface-secondary`.

**Preservar (deferido — NÃO mexer em `muted`):** ao remover o 2º `@theme`, `--color-muted` cairia p/ `var(--bg2)` (#fff → quebra os 22 `bg-muted/30` + Tabs vira branco). Mover a linha p/ o 1º `@theme`: `--color-muted: var(--ws-text-3)` (mantém `#9ca3af`, inalterado).

**Redefinir (limpo):**
- `accent` (hover de dropdown/select/command — hoje `#005691` teal off-brand; cairia p/ #fff se só removido): `--color-accent: var(--accent)`; brand `--accent` = `#eef1f5` (light) / `rgba(255,255,255,0.06)` (dark). `accent-foreground` = foreground normal.
- `popover` (elevação — débito F1, hoje = `var(--bg)` = fundo da página): `--color-popover`/`--popover` → `var(--card)` (light #fff / dark #0d2e5a).
- `secondary` (botão/badge — hoje #fff invisível): brand `--secondary` = `#e8eaed` (light) / `#00214d` (dark, mantém).

**Tabs strip:** TabsList usa `bg-muted` (#9ca3af). Decidir na implementação (grep nº de `<Tabs>`): se poucos, bg explícito pontual; se vários, trocar o default `bg-muted`→`bg-accent` em `ui/tabs.tsx` (agora que accent é cinza claro limpo).

**Verificação P1 (amostragem, light+dark):** dropdown/select aberto (hover = accent cinza, não teal/branco), popover (elevação vs fundo), botão `bg-secondary`, badge secondary, Tabs strip, + 1 tela glass (confirmar `--ws-*` intacto). Build + typecheck.

## P2 — `glass-card.tsx` (5 usos) → `Card` shadcn

Substituir `<GlassCard>` por `<Card>` (flat) nos 5 call sites. Remover `glass-card.tsx` quando zerar. (Os 5 usos viram flat de verdade — exceção pontual ao "continua glassy".)

## P3 — Objetos de `utils.ts` (41 usos) → shadcn

`tabAtiva`/`tabInativa` (14) → `Tabs`; `filtroAtivo`/`filtroInativo` (10) → `Button`/toggle; `glassCard`/`glassCardHover` (10) → `Card`; `botaoPrimario` (7) → `Button`. Por call site, incremental. Remover os objetos de `utils.ts` (manter só `cn`) quando zerarem.

## Sequência (commits granulares, cada um verificado)

1. P1 tokens (`globals.css`) — **commit + verificação visual ampla** (é o de maior risco).
2. P2 glass-card → Card.
3. P3 objetos utils.ts → shadcn (pode ser sub-dividido por tipo de objeto).

Guard-rails: worktree `agent/ds-fundacao`; commit granular; qualquer coisa globals.css-global é verificada **por amostragem**, não exaustivamente — sempre declarar isso.
