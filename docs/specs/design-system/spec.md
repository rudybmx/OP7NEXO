# Fase 1 — Remover HeroUI

> Roadmap de consolidação flat shadcn — ver [`docs/design-system.md`](../../design-system.md) §7. Fase anterior (F0 + paleta) feita em `agent/ds-fundacao`.

## Objetivo

Eliminar o HeroUI do front: migrar os **7 usos reais** de `@heroui/react` para os componentes shadcn já existentes em `@/components/ui/*`, deletar o showcase morto `design-system-v2/`, e migrar `react-icons` → `lucide-react`.

## Escopo

**Entra (F1):**
- Migrar `@heroui/react` → shadcn nos 7 arquivos reais (Button, Input, Chip→Badge, Tabs, Switch, Table).
- Deletar o showcase `design-system-v2/` (rota + 26 componentes = 24/31 dos usos `@heroui` + o único uso de `@heroui-pro`).
- Remover os 28 `@import "@heroui/*"` de `globals.css`.
- Remover deps `@heroui/react`, `@heroui-pro/react`, `react-icons` de `package.json`.
- `react-icons` → `lucide-react` (7 arquivos).

**NÃO entra — adiado p/ F2 (decisão consciente):**
A **camada de tokens HeroUI-derivada** em `globals.css` — 2º bloco `@theme inline` (~106–133) + bloco `:root` HeroUI (`--default`/`--accent`/`--danger`/`--success`/`--warning`/`--focus`…, ~308–343). Motivo: removê-la faz `bg-accent`/`bg-muted` caírem para `var(--bg2)` (branco no light / navy no dark), **matando as superfícies de hover** — está acoplada ao re-skin de `accent`/`muted` da F2. As classes que ela gera têm **0 uso real** (verificado com grep incl. `-foreground`/`-soft`), então é remoção segura — mas pertence à F2 junto com `--ws-*`.

## Critérios de aceite

- `grep -rn "@heroui" src/` → **0** · `grep -rn "react-icons" src/` → **0**.
- `next build` + typecheck limpos.
- **Critério honesto:** "@heroui removido" significa **componentes + imports CSS + deps**. A camada de tokens HeroUI-derivada **permanece** em `globals.css` (adiada p/ F2) — o grep verde **não** significa `globals.css` livre de HeroUI.
- Sem regressão visual/funcional nas telas tocadas: Administração › Contas-ads, Empresas/Contas, Clientes, Usuários (novo/editar); CRM › Atendimento (input-mensagem, pagina-arquivado).
- Tabelas migradas renderizam **linhas** — verificar com **dados mockados** (não `[]` vazio, que só prova header + no-crash).

## Heurísticas Nielsen (telas tocadas)

Migração 1:1 — sem mudança de comportamento. #1 (estados loading/erro dos forms preservados) e #5 (nenhum dado de form perdido na troca: mesmos handlers/estado controlado).
