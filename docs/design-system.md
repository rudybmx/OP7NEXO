# OP7NEXO — Design System

> **Fonte única de verdade visual.** Antes de criar qualquer componente de UI, leia este arquivo.
> Base: **shadcn/ui** (componentes Radix + Tailwind) · **Tailwind CSS v4** (`@theme inline`, sem `tailwind.config`) · fonte **Inter**.
> Ícones: **lucide-react** sempre (nunca `react-icons` ou SVG inline).

**Estado da migração (2026-06):** estética alvo = **flat shadcn**. O app está consolidando de um estado híbrido (HeroUI + glassmorphism `--ws-*`) para shadcn puro. Ver "Estado e roadmap" no fim.

---

## 1. Identidade visual

### 1.1 Paleta de marca (oficial)

| Uso | Valor |
|---|---|
| Gradiente primário | `#006EFF` (azul) → `#000533` (navy profundo) |
| Gradiente secundário | `#c80010` (vermelho) → `#ff6332` (laranja) |
| Apoio | `#00214d` (navy) · `#3d3d3d` (grafite) · `#f5f5f5` (cinza claro) |
| Tipografia | Inter |

### 1.2 Tokens semânticos (o que usar no código)

Use **sempre** as classes utilitárias do Tailwind (`bg-primary`, `text-foreground`, `border-border`…), nunca os hex direto. Os tokens vivem em `src/app/globals.css` (`@theme inline` + `:root`/`.dark`).

| Token / classe | Light | Dark | Uso |
|---|---|---|---|
| `bg-background` | `#f5f5f5` | `#000533` | fundo da página |
| `bg-card` | `#ffffff` | `#0d2e5a` | cards, superfícies flat |
| `bg-popover` | `#f5f5f5` | `#000533` | dropdowns/selects/popovers — ⚠️ ligado a `--bg` (sem elevação vs. fundo); alinhar a `--card` na Fase 2 |
| `text-foreground` | `#3d3d3d` | `#f5f5f5` | texto principal |
| `text-muted-foreground` | `#636e7d` | `#94a3b8` | labels, metadados (hierarquia mais fraca) — passa WCAG AA |
| `bg-primary` / `text-primary` / `ring` | `#006EFF` | `#006EFF` | ação principal, links, foco |
| `text-primary-foreground` | `#ffffff` | `#ffffff` | texto sobre `bg-primary` |
| `bg-destructive` | `#c80010` | `#c80010` | ações destrutivas, erro |
| `border-border` | `#e9e9e7` | `#2d2d2d` | bordas |
| `bg-sidebar` | `#00214d` | `#00214d` | sidebar (navy sólido, sempre escura) |
| `bg-sidebar-primary` | `#006EFF` | `#006EFF` | item de nav ativo |

**Cor primária = azul `#006EFF` sólido.** O laranja/vermelho da marca são **acento** (gradiente secundário), não a primária.

> ⚠️ **Neutros — estado real.** `card`, `muted-foreground`, `border` (`#e9e9e7`/`#2d2d2d`), `input` (`#e2e1de`/`#2a2a2a`) já estão definidos (acima/no código). Mas **`secondary`, `accent` e `muted` ainda resolvem para a camada legada `--ws-*`/HeroUI** — `bg-accent` = `#005691` (teal) no light / `#282828` no dark; `bg-muted` = `#9ca3af`. São **redefinidos na Fase 2** (re-skin, com revisão visual), quando essa camada e o 2º `@theme inline` saírem. As 7 cores de marca são definitivas.

### 1.3 Gradientes de marca — onde usar

Superfícies flat são **sólidas**. Os gradientes aparecem **apenas** como acento de marca:

| Local | Tratamento | Token |
|---|---|---|
| Sidebar | navy sólido (`bg-sidebar`) + gradiente sutil **só no header do logo** | `--brand-gradient-primary` |
| Tela de login / conexão | gradiente primário como fundo/hero | `--brand-gradient-primary` |
| Badge "urgente" | gradiente secundário | `--brand-gradient-secondary` |
| Notificação (destaque) | gradiente secundário suave | `--brand-gradient-secondary` |
| **Todo o resto da UI** | **flat sólido** — `bg-card` + `border` + `shadow-sm` | — |

Tokens disponíveis: `var(--brand-gradient-primary)`, `var(--brand-gradient-secondary)`, `var(--brand-navy)`, `var(--brand-navy-deep)`, `var(--brand-orange)`, `var(--brand-red)`, `var(--brand-gray)`.

> ❌ Não usar `backdrop-filter: blur()` / glassmorphism em código novo. Cards são flat.

### 1.4 Tipografia

- Fonte **Inter** (`next/font`, var `--font-sans-base`). Base **14px = `text-sm`** (tamanho majoritário).
- Pesos: **400** corpo/células · **500** cabeçalho de tabela, botão, nav, label, valor de KPI · **600** título de seção/página · **700** restrito.
- Escala = defaults do Tailwind: `text-xs` 12 · `text-sm` **14 (base)** · `text-base` 16 · `text-lg` 18 · `text-xl` 20 · `text-2xl` 24 · `text-3xl` 30. Tier micro **11px** = `text-micro` / `.ds-micro`.

**Classes semânticas** (definidas em `globals.css`, prefira-as a estilos avulsos):
`.ds-page-title` (24/600) · `.ds-section-title` (18/600) · `.ds-table-th` (14/500, sentence-case) · `.ds-table-td` (14/400) · `.ds-table-num` (tabular-nums) · `.ds-label` (14/500) · `.ds-help` (12/400) · `.ds-kpi-label` (12/500 uppercase) · `.ds-kpi-value` (20/500) · `.ds-micro` (11/400).

> Refator de tipografia em andamento — ver `docs/specs/tipografia/`. ❌ Nunca `style={{ fontSize }}` nem `text-[Npx]` arbitrário em código novo.

### 1.5 Radius

`rounded-sm` 4 · `rounded-md` 5 · `rounded-lg` 6 · `rounded-xl` 8 · `rounded-2xl` 10 · `rounded-3xl` 12 · `rounded-4xl` 16 (tokens `--radius-*`).

---

## 2. Componentes shadcn disponíveis

Importe **sempre** de `@/components/ui/[nome]`. Props/variantes exatas: ver o arquivo-fonte (é a fonte de verdade).

| Componente | Import | Base |
|---|---|---|
| Button | `@/components/ui/button` | Radix Slot + CVA |
| Badge | `@/components/ui/badge` | Tailwind |
| **Card** | `@/components/ui/card` | shadcn (`Card`/`Header`/`Title`/`Description`/`Action`/`Content`/`Footer`) |
| Dialog | `@/components/ui/dialog` | Radix |
| Sheet | `@/components/ui/sheet` | Radix (Dialog) |
| Select | `@/components/ui/select` | Radix |
| Input · Textarea | `@/components/ui/input` · `.../textarea` | HTML nativo + Tailwind |
| Switch · Toggle · ToggleGroup | `@/components/ui/switch` · `.../toggle` · `.../toggle-group` | Radix |
| Tabs | `@/components/ui/tabs` | Radix |
| Tooltip · Popover · DropdownMenu | `@/components/ui/tooltip` · `.../popover` · `.../dropdown-menu` | Radix |
| Avatar | `@/components/ui/avatar` | Radix |
| Calendar | `@/components/ui/calendar` | react-day-picker |
| Command | `@/components/ui/command` | cmdk |
| Progress · Separator · ScrollArea · Skeleton | `@/components/ui/progress` · `.../separator` · `.../scroll-area` · `.../skeleton` | Radix / Tailwind |
| Sonner (Toast) | `@/components/ui/sonner` | sonner |
| Sidebar | `@/components/ui/sidebar` | Radix + CVA |

**Componentes custom (em transição):**
- `glass-card.tsx` → **substituir por `Card`** (flat). Deprecado.
- `ws-table.tsx` → padrão de tabela atual; será unificado num `DataTable` (Fase 4).
- `info-tooltip.tsx`, `mini-gauge.tsx` → manter (casos específicos).

**Card (exemplo):**
```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

<Card>
  <CardHeader><CardTitle>Receita</CardTitle></CardHeader>
  <CardContent><p className="ds-kpi-value">R$ 50.000</p></CardContent>
</Card>
```

---

## 3. Ícones

`lucide-react` sempre. Tamanho padrão `size-4` (16px) dentro de botões/inputs; `size-3` compacto; `size-5` avulso. `aria-label` em ícone isolado sem texto.

```tsx
import { Search, X, Plus } from 'lucide-react'
```

---

## 4. Layout

```tsx
<h1 className="ds-page-title">Título</h1>
<p className="text-sm text-muted-foreground">Descrição</p>

{/* grid de cards */}
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
  <Card>…</Card>
</div>
```

KPI: `<Card><CardContent><p className="ds-kpi-label">Receita</p><p className="ds-kpi-value">R$ 50.000</p></CardContent></Card>`.

---

## 5. Dark mode

Controlado pelo `ProvedorTema` (`src/components/provedores/provedor-tema.tsx`): classe `.dark` no `<html>` + `localStorage` (sem `next-themes`). As cores trocam sozinhas via CSS variables — componentes shadcn não precisam de nada. Para diferenciar manualmente: `.dark .minha-classe { … }`. O `<html>` tem `suppressHydrationWarning`; não use estado de tema em JS para estilizar — use as classes `.dark`.

---

## 6. Regras de código (OBRIGATÓRIO)

1. **shadcn/ui (Radix) + lucide-react** exclusivamente. UI primitiva nova: cheque se Radix já cobre antes de instalar lib.
2. ❌ **NUNCA HeroUI** (`@heroui/*`, `@heroui-pro/*`) — em remoção (Fase 1).
3. ❌ **NUNCA `react-icons`** — `lucide-react` sempre.
4. ❌ **NUNCA `style={{}}` para tema** (cor, tamanho, espaçamento) — use classes Tailwind/tokens.
5. **Superfícies flat**: `bg-card` + `border` + `shadow-sm`. ❌ Sem glassmorphism/`backdrop-filter` em código novo.
6. **Gradiente só nos 4 locais de marca** (§1.3). Resto sólido.
7. **Cores via tokens semânticos**: `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-destructive` — não hex fixos.
8. ⚠️ **Tokens `--ws-*` estão DEPRECADOS** (repontados para a brand durante a transição). Não use em código novo; serão removidos na Fase 2.
9. Antes de criar um componente de UI, verifique se já existe em `src/components/ui/`.

---

## 7. Estado e roadmap

- **Fase 0 (feita):** nova paleta de marca aplicada nos tokens; `card.tsx` criado; este doc; governança unificada no `AGENTS.md`. Camada `--ws-*` preservada (repontada) para não quebrar o app.
- **Fase 1:** remover HeroUI (showcase `design-system-v2/` + ~4 forms) e `react-icons`.
- **Fase 2:** aposentar `--ws-*`/`glass-card`/objetos de estilo em `src/lib/utils.ts` → componentes shadcn; consolidar showcase único.
- **Fase 3:** eliminar `style={{}}` inline por área (reconciliar com `docs/specs/tipografia`).
- **Fase 4:** padronizar tabelas (`DataTable`).
