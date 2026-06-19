# Spec — Refatoração de Tipografia (Inter + escala base 14px)

## Objetivo / Problema
O CRM é visualmente cansativo: o texto está espremido (a maioria entre **10–13px**) e os pesos são
pesados (bold/600 dominam). Os clientes precisam de uma interface **mais legível e no tamanho ideal de
leitura**. Sucesso = um padrão tipográfico **único, limpo e rápido de ler**: fonte **Inter**, **14px** como
tamanho majoritário do conteúdo, escada de pesos **400/500/600/700**.

Referência externa adotada: [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
recomenda Inter + a mesma escada de pesos. Divergência consciente: a escala dela é base 16px (long-form);
para um CRM denso usamos **base 14px** (padrão Linear/Stripe). Mantemos line-heights e mínimos de
acessibilidade da referência.

## Estado atual (por que não basta)
- Fonte atual: **Plus Jakarta Sans** (`src/app/layout.tsx` via `next/font`).
- **~3.100 pontos de tipografia explícita**, sem fonte única: ~2.211 `style fontSize` inline + ~601
  `text-[Npx]` arbitrário (só 5× `text-[14px]`) + ~301 `text-*` padrão.
- Tamanhos enviesados a 10–13px; pesos a bold/600 (peso 400 quase ausente: ~32 no total) — o oposto do alvo.
- **Governança perpetua o padrão antigo:** `AGENTS.md` → seção "Padrão Visual de Componentes" e
  `src/components/design-system/ds-agentes.md` codificam KPI label 10px, cabeçalho de tabela `fontSize:10/600`.

## Escopo
- **In:** `op7nexo-front`. Fonte Inter; tokens de tipografia (`@theme`); classes semânticas `.ds-*`;
  constantes exportadas em `ws-table.tsx`; migração faseada de todas as superfícies (tabelas, KPIs, forms,
  títulos, cauda longa inline); atualização da governança (AGENTS.md, ds-agentes.md, página `/design-system`);
  trava anti-regressão (pre-commit/CI).
- **Out:** `op7nexo-api` (sem UI). Mudança de paleta/cores. Redesenho de layout/espaçamento além do
  necessário para acomodar a nova tipografia. Páginas de marketing/landing externas.

## Heurísticas de Nielsen
- **#8 Estético e minimalista** — remove peso/tamanho "gritado", hierarquia limpa.
- **Acessibilidade** (referência ui-ux-pro-max): corpo ≥14px, contraste ≥4.5:1, tier micro só para metadado.
- #1/#3/#5/#6/#9 não afetadas (sem mudança de comportamento assíncrono/estado/navegação).

## Regras de comportamento (o padrão)
**Família:** `Inter, ui-sans-serif, system-ui, sans-serif` (mono inalterado).

**Escala (token · px · line-height · peso padrão · uso):**
| Token | px | lh | peso | uso |
|---|---|---|---|---|
| `--text-micro` | 11 | 1.4 | 400 | timestamps, utm, código inline, metadado ultra-denso |
| `--text-caption` | 12 | 1.45 | 400/500 | labels de KPI, helper text, badges |
| **`--text-body`** | **14** | **1.5** | **400** | **corpo, células, inputs — a MAIORIA** |
| `--text-md` | 16 | 1.5 | 400/500 | corpo enfatizado, título de card pequeno |
| `--text-lg` | 18 | 1.4 | 600 | título de seção/card |
| `--text-xl` | 20 | 1.35 | 500/600 | valor de KPI, subtítulo |
| `--text-2xl` | 24 | 1.3 | 600 | H1 de página |
| `--text-3xl` | 30 | 1.2 | 700 | hero/login (raro) |

**Pesos:** 400 corpo/células · 500 cabeçalho de tabela, botão, nav, label, valor KPI · 600 título de
seção/card · 700 H1/ênfase forte (**restrito**).

**Por superfície:** cabeçalho de tabela 14/500 (casing: ver Open Questions) · célula 14/400 + `tabular-nums`
em colunas numéricas · botão 14/500 · badge 12/500 · label 14/500, helper 12/400 · KPI label 12/500
uppercase muted, value 20/500, delta 11–12.

**Mapeamento de→para (perfil "Equilibrado"):**
| Atual | Novo |
|---|---|
| 7–9px | 11px |
| 10px | 12px (cabeçalho/label) · 11px (metadado) |
| 11px | 11–12px |
| 12px | 12px (label) · 14px (se conteúdo) |
| 13px | **14px (promover)** |
| 14/16px | mantém |
| 18/20px | mantém |
| peso 600/700 em corpo/célula | 400 |
| peso 600 em cabeçalho | 500 |

14px é majoritário no **conteúdo**; o tier 11–12px é retido para metadado denso/badge/timestamp/label de KPI.

## Casos de erro / risco
- Texto maior estoura largura de tabela / altura de linha → **QA visual por fase (pré-merge)** é o gate.
- "Ilhas" da fonte antiga (16 `fontFamily:'Plus Jakarta Sans'` inline + 3 `var(--font-plus-jakarta-sans)`)
  → guard `grep -ri "plus.jakarta" src/` = 0.
- HeroUI `Table`/`Button` com tamanho próprio (usados em `design-system-v2`) → conferir explicitamente.
- Agentes concorrentes revertem o working tree compartilhado → trabalhar em worktree; commit/push por fase.

## Critérios de aceite
- [ ] Inter carregada; `grep -ri "plus.jakarta" src/` = 0.
- [ ] `body` padrão 14px/400; tokens `--text-*` no `@theme`.
- [ ] Classes `.ds-*` e constantes `ws-table` disponíveis e usadas nas superfícies migradas.
- [ ] Cada fase: `npm run build` sem erro; `tsc --noEmit` sem erro novo vs baseline; QA visual light/dark **aprovado antes do merge**.
- [ ] Tabelas: cabeçalho peso 500, célula 14/400, números tabulares alinhados.
- [ ] `AGENTS.md` + `ds-agentes.md` + `/design-system` refletem a nova escala.
- [ ] Trava bloqueia **novos** `style fontSize` e `text-[Npx]` em linhas adicionadas.

## Plano de teste
- Build: `npm run build` no worktree (Next 16). Tipos: `npx tsc --noEmit` sem erro novo vs baseline (build mascara com `ignoreBuildErrors`).
- QA visual (Chrome MCP, light+dark, antes/depois) **no dev server, pré-merge**: `/design-system`, campanhas (tabela densa), overview/dashboard, atendimento/kanban, um formulário, login.
- Guards de grep (fonte antiga = 0; sem novos fontSize/text-[Npx] no diff após a fase de trava).

## Decisões resolvidas (2026-06-19)
- **Casing de cabeçalho de tabela:** ✅ **sentence-case** (ex.: "Plataforma", não "PLATAFORMA"). UPPERCASE fica reservado só para labels de KPI (12px).
- **Gate de deploy:** ✅ rollout **fase-a-fase**; cada deploy em produção (cliente) sob `lock-deploy` exige **OK explícito do usuário** antes de subir.

## Open Questions
- Nenhuma.
