# Tasks — Refatoração de Tipografia

Ordenadas por fase. `[P]` = paralelizável dentro da fase. Cada fase: worktree próprio → build + tsc →
**QA visual pré-merge (light/dark)** → commit granular → push → merge em `production` → `lock-deploy` → smoke-check.

## Fase 0 — Fundação & governança  (worktree: `tipografia-fundacao`)
- [ ] T0.1 `layout.tsx`: trocar Plus Jakarta Sans → Inter (`--font-sans-base`).
- [ ] T0.2 `globals.css`: apontar `--font-sans`/`--font-heading`/`body`/portais para `--font-sans-base`; remover refs antigas.
- [ ] T0.3 [P] `globals.css` `@theme`: adicionar tokens `--text-*` (px + line-height).
- [ ] T0.4 [P] `globals.css`: `body { font-size:14px; font-weight:400 }`.
- [ ] T0.5 [P] `globals.css` `@layer components`: classes `.ds-table-th/.ds-table-td/.ds-label/.ds-kpi-label/.ds-kpi-value/.ds-page-title`.
- [ ] T0.6 `ui/ws-table.tsx`: exportar `wsTableHeadStyle` + `wsTableCellStyle`.
- [ ] T0.7 [P] Matar 16 `fontFamily:'Plus Jakarta Sans'` inline + 3 `var(--font-plus-jakarta-sans)`. Guard grep = 0.
- [ ] T0.8 [P] Governança: reescrever `AGENTS.md` "Padrão Visual de Componentes" + `ds-agentes.md` + página `/design-system`.
- [ ] T0.9 Build + tsc + QA visual (`/design-system`, login, 1 página densa) → liberar.

## Fase 1 — Primitivos compartilhados (fix-once)
- [ ] T1.1 [P] `ui/button.tsx` (normalizar `sm` `text-[0.8rem]`→`text-xs`; confirmar default 14/500).
- [ ] T1.2 [P] `ui/badge.tsx` (12/500).
- [ ] T1.3 [P] `ui/input.tsx` / `ui/textarea.tsx` / `ui/label.tsx` (14; label 14/500; helper 12).
- [ ] T1.4 [P] select/dropdown/chips primitivos.
- [ ] T1.5 Build + QA + liberar.

## Fase 2 — Tabelas (maior ganho)  ⚠️ depende da decisão de casing (ver spec Open Questions)
- [ ] T2.1 Tabelas inline (WSTable): substituir `const TH/TD` por `wsTableHeadStyle/wsTableCellStyle` (`InsightsIaTabela`, `ConsumoIaPainel`, demais).
- [ ] T2.2 `campanhas-tabela.tsx` e raw `<table>`: `text-[10px] font-bold` → `.ds-table-th`; células → 14/400.
- [ ] T2.3 [P] `tabular-nums` em colunas numéricas.
- [ ] T2.4 Varredura dos demais `*-tabela.tsx` (followup, agenda, recorrencia, crm).
- [ ] T2.5 Build + QA (campanhas, admin, CRM) + liberar.

## Fase 3 — KPIs / dashboards / charts
- [ ] T3.1 Cards KPI → `.ds-kpi-*`.
- [ ] T3.2 [P] Recharts: fontes de eixo/legenda/tooltip.
- [ ] T3.3 Build + QA (overview/dashboards) + liberar.

## Fase 4 — Forms & labels
- [ ] T4.1 `form-*.tsx`: label 14/500, input 14, helper 12, erro 14.
- [ ] T4.2 Build + QA (1–2 formulários) + liberar.

## Fase 5 — Títulos / hierarquia
- [ ] T5.1 `app/**/page.tsx`: h1→24/600, h2→18/600; reduzir `font-bold`.
- [ ] T5.2 Build + QA + liberar.

## Fase 6 — Cauda longa (sprinkled inline)
- [ ] T6.1 Codemod assistido para casos inequívocos; revisar diff por arquivo.
- [ ] T6.2 Limpeza dos painéis admin e afins com inline restante.
- [ ] T6.3 Build + QA + liberar.

## Fase 7 — Trava (guardrail)
- [ ] T7.1 Gate pre-commit/CI: bloquear **novos** `style fontSize` + `text-[Npx]` em linhas adicionadas.
- [ ] T7.2 (opcional) ESLint `no-restricted-syntax`.
- [ ] T7.3 Documentar a trava no AGENTS.md.
