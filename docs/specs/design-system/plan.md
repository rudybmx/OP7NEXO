# Plan — Fase 1 Remover HeroUI

## Mapa de migração `@heroui/react` → shadcn

| HeroUI | shadcn `@/components/ui/*` | Notas |
|---|---|---|
| `Button` (6×) | `button` | `color`/`variant`/`size` HeroUI → CVA do button shadcn. Props v2 mortas (`isStriped`/`removeWrapper`/`variant="flat"`) descartadas — ver memória heroui-v3-front. |
| `Input` (3×) | `input` | label/erro por composição (`<label>` + texto), não props. |
| `Chip` (3×) | `badge` | cor → `variant`. Se removível (`onClose`), X manual com `lucide` `X`. |
| `Tabs` (1×) | `tabs` | `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (Radix). |
| `Switch` (1×) | `switch` | Radix Switch — `isSelected`→`checked`, `onValueChange`→`onCheckedChange`. |
| `Table` + subcomp (3 arq.) | **`<table>` HTML + `.ds-table-th`/`.ds-table-td` + `WSTableShell`** | ver decisão abaixo |

## Decisão Table (a parte pesada)

`ws-table.tsx` é **primitivos + wrapper de scroll** (não data-driven): `WSTableShell` (div com `overflow-x` + borda/sombra), `WSTable` (`<table>` cru), `.ds-table-th/td` (tipografia 14px em globals.css). **Não criar `ui/table.tsx`** — adicionaria um 3º padrão que a F4 (DataTable) teria que desfazer. Migrar a API declarativa HeroUI → HTML cru:

- `TableScrollContainer`/`TableContent` → `WSTableShell` (já cobre o overflow-x).
- `TableHeader`/`TableColumn` → `<thead><tr><th className="ds-table-th">`.
- `TableBody`/`TableRow`/`TableCell` → `<tbody><tr><td className="ds-table-td">`.
- Células com `Chip`→`Badge`, `Button`→`button` shadcn.

Arquivos: `administracao/contas-ads/page.tsx` (API completa, o mais pesado), `administracao/empresas/contas/page.tsx`, `crm/atendimento/pagina-arquivado.tsx`.

## Camada de tokens HeroUI

Permanece em `globals.css` nesta fase (ver spec §Escopo) — sai na F2 junto com `--ws-*` e a redefinição de `accent`/`muted`/`secondary`/`popover`.

## Sequência (commits granulares — cada passo build-green)

1. **Deletar showcase v2** (`chore`) — derruba 24/31 `@heroui` + único `@heroui-pro` de uma vez.
2. **Migrar forms simples** (`refactor`) — Switch, Input, Tabs, Button nos arquivos não-tabela.
3. **Migrar 3 tabelas** (`refactor`) — Table → ds-table + WSTableShell; Chip→Badge.
4. **react-icons → lucide** (`refactor`, commit próprio) — ortogonal ao HeroUI, arquivos disjuntos.
5. **Remover `@import @heroui` + deps** (`chore`) — 28 linhas de globals.css + package.json. Prova real = grep→0 + build (o `node_modules` hard-linked ainda resolve o pacote, então dep-removal é bookkeeping).
