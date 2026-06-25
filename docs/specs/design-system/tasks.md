# Tasks — Fase 1 Remover HeroUI

Ordenadas; `[P]` = paralelizáveis entre si (arquivos disjuntos). Commit ao fim de cada bloco.

- [x] **T1.** Deletar `src/app/(plataforma)/design-system-v2/` + `src/components/design-system-v2/` (26 arq.). Verif: `grep -rln @heroui src` cai de 31 → 7. **→ commit `chore`**
- [x] **T2.** [P] `crm/atendimento/input-mensagem.tsx` — `Switch` HeroUI → `ui/switch`.
- [x] **T3.** [P] `administracao/clientes/cliente-form.tsx` — `Button`/`Input`/`Tabs`.
- [x] **T4.** [P] `administracao/usuarios/novo-usuario-form.tsx` + `editar-usuario-form.tsx` — `Button`/`Input`. **→ commit `refactor` (T2–T4)**
- [x] **T5.** Tabelas — `crm/atendimento/pagina-arquivado.tsx`, `administracao/empresas/contas/page.tsx`, `administracao/contas-ads/page.tsx`: `Table`→`<table>`+`.ds-table-*`+`WSTableShell`, `Chip`→`Badge`, `Button`. **→ commit `refactor`**
- [x] **T6.** `react-icons` → `lucide-react` em 7 arq. (followup×2, campanhas×4, saldo-card). Mapear cada ícone. **→ commit `refactor` próprio**
- [x] **T7.** Remover 28 `@import "@heroui/*"` (globals.css) + `@heroui/react`/`@heroui-pro/react`/`react-icons` (package.json). **→ commit `chore`**
- [x] **T8.** Verificar: `grep @heroui src`=0, `grep react-icons src`=0; `next build` + typecheck; screenshots Playwright das telas de tabela **com dados mockados** (rows, não `[]`).
