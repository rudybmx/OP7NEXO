# Plan — Refatoração de Tipografia

Arquitetura técnica e decisões. Fonte da spec: [`spec.md`](./spec.md).

## Decisões (confirmadas com o usuário)
1. **Escala = Equilibrado** — 14px majoritário no conteúdo; tier 11–12px retido para metadado/badge/KPI label.
2. **Rollout = Faseado por superfície** — cada fase isolada, com QA visual **antes** do merge.
3. **Trava + docs** — gate anti-regressão (pre-commit/CI) + reescrita da governança.

## Arquitetura

### 1. Troca de fonte (Inter) — enumerar todos os pontos
- `src/app/layout.tsx`: trocar `Plus_Jakarta_Sans` por `Inter({ subsets:['latin'], variable:'--font-sans-base', display:'swap' })`; `<html className={inter.variable}>`. (Variável Inter carrega 100–900 → 400/500/600/700 resolvem.)
- `src/app/globals.css`: `--font-sans` (l.90), `--font-heading` (l.92), `body` (l.491) e portal `[data-radix-popper-content-wrapper],[data-radix-portal]` (l.496) → `var(--font-sans-base), ui-sans-serif, system-ui, sans-serif`.
- Renomear var `--font-plus-jakarta-sans` → `--font-sans-base`.
- Matar 16 `fontFamily:'Plus Jakarta Sans'` inline + 3 `var(--font-plus-jakarta-sans)` inline. Guard: `grep -ri "plus.jakarta" src/` = 0.

### 2. Tokens + fonte única de verdade (globals.css)
- Bloco `@theme`: adicionar `--text-micro/caption/body/md/lg/xl/2xl/3xl` (px + line-height da spec).
- `body { font-size:14px; font-weight:400 }` (padrão herdado; não conflita com `text-sm`/`text-xs` que são rem-relativos).
- `@layer components`: `.ds-table-th` (14/500), `.ds-table-td` (14/400 + tabular-nums), `.ds-label` (14/500), `.ds-kpi-label` (12/500 uppercase), `.ds-kpi-value` (20/500), `.ds-page-title` (24/600).

### 3. Constantes compartilhadas em `src/components/ui/ws-table.tsx`
- Exportar `wsTableHeadStyle` e `wsTableCellStyle` (React.CSSProperties) para as dezenas de tabelas inline
  substituírem seus `const TH/TD` locais por `import` → alavanca "fix-once" da cauda inline.

### 4. Migração = triagem, não codemod cego (3 tiers, confirmados na leitura)
- **Fix-once (primitivos):** `ui/button.tsx` (já 14/500; normalizar `sm` `text-[0.8rem]`→`text-xs`), `ui/badge.tsx`, `ui/input.tsx`, `ui/textarea.tsx`, `ui/label.tsx`.
- **Fix-per-file (constantes):** ex. `admin/InsightsIaTabela.tsx`, `admin/ConsumoIaPainel.tsx` (`const TH={fontSize:10,fontWeight:600}` → importar/retargetar).
- **Cauda longa (sprinkled):** ex. `campanhas/campanhas-tabela.tsx` (cada `<th>/<td>` à mão). Codemod (Node/regex) só para casos inequívocos (`fontSize:13`→14, `fontWeight:600` em corpo→400/500), revisando diff por arquivo. Tamanhos acoplados a layout revisados à mão.

### 5. Governança (anti-regressão)
- Reescrever `AGENTS.md` → "Padrão Visual de Componentes" (KPI/Tabelas) com a nova escala.
- Atualizar `src/components/design-system/ds-agentes.md` e a página `/design-system` (vitrine = superfície de QA).
- Trava: estender o hook `pre-commit` (lefthook) / CI para falhar com **novos** `style={{…fontSize…}}` e `text-[\d+px]` em linhas adicionadas (grep no diff). Opcional ESLint `no-restricted-syntax` para `JSXAttribute[name=style]` com `fontSize`.

## Operacional (obrigatório no projeto)
- Worktree por fase: `bash /root/agent-worktree.sh front tipografia-<fase>` → trabalhar em `/root/wt/front-tipografia-<fase>`.
- Commit granular (nunca `git add -A`); push `agent/tipografia-<fase>`.
- Liberar: `git -C /root/op7nexo-front checkout production && merge --ff-only agent/<id> && push origin production` → `lock-deploy bash /root/deploy.sh front`.
- Deploy SEMPRE de `origin/production` (anti-downgrade): só sobe o que foi pushado.
- Ritual de fim: `graphify update .`; atualizar `CONTEXT.md` se mudar comportamento/estrutura.

## Verificação
Ver `spec.md` → Plano de teste e Critérios de aceite. Gate central: build + tsc baseline + QA visual light/dark **pré-merge**.
