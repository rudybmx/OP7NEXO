# Spec — Persistência de estado de UI ("parar de perder o lugar no F5")

## Problema
Ao recarregar (F5), trocar de aba ou voltar, o usuário perde o estado de UI:
1. Sidebar fecha todos os grupos (inclusive o da página atual).
2. Formulários apagam o conteúdo não submetido.
3. Telas de dados perdem aba ativa e filtros.

## Heurísticas de Nielsen atendidas
- **#1 Visibilidade do estado** — indicador "rascunho salvo".
- **#3 Controle do usuário** — restauração de rascunho com opção de descartar.
- **#5 Prevenção de erros** — autosave (nunca perder dado silenciosamente).
- **#6 Reconhecer em vez de lembrar** — navegação/visualização sobrevive ao F5.

## Comportamento esperado por fase

### Fase 1 — Sidebar ✅
- Hook `usePersistedState` (SSR-safe) em `src/hooks/use-estado-persistido.ts`.
- Regra de abertura de grupo: `secaoAtiva(pathname) ? true : (toggleUsuario[chave] ?? grupo.abertoPadrao)`.
  - **Rota atual sempre vence**: o grupo da página onde o usuário está abre, mesmo que tivesse sido fechado.
  - Demais grupos: toggle explícito do usuário persiste; senão `abertoPadrao`.
- Colapso da sidebar migrado ao mesmo hook (elimina flash de hidratação).
- Critério de aceite: após F5 numa subpágina, o grupo correto continua aberto e destacado; toggles do usuário em grupos não-ativos persistem.

### Fase 2 — Rascunho de formulários (pendente)
- Hook `useRascunho` sobre `usePersistedState`.
- **Chave com escopo de usuário obrigatório**: `rascunho:${userId}:<form>` (evita vazar rascunho entre usuários na mesma máquina).
- Autosave com debounce ~500ms; **flush síncrono** em `pagehide`/`beforeunload` (NÃO usar diálogo bloqueante — protege só a janela antes do debounce).
- Restaurar no mount com aviso discreto + opção de descartar; `clear()` no submit.
- Aplicar em: `EstudioCriativos.tsx`, `modal-meu-perfil.tsx`, `modal-config-empresa.tsx`.
- ⚠️ **Pendência registrada**: `modal-meu-perfil.tsx` e `modal-config-empresa.tsx` estão no inventário da migração futura modais→páginas (fase Layout). O autosave aplicado agora será migrado junto.

### Fase 3 — Estado de visualização das telas de dados (pendente)
- Persistir aba ativa + filtros via `localStorage` (decisão do usuário: **NÃO** por URL/compartilhável).
- Aplicar em `pagina-meta-ads.tsx`, `pagina-google-ads.tsx`, `PmpTabs.tsx`.
- Padronizar filtros que já usam localStorage à mão (`filtros-criativos.tsx`, `grid-criativos.tsx`) pelo mesmo hook.

## Verificação
- Gate de tipos: `npx tsc --noEmit` não pode introduzir erro novo vs baseline (build mascara com `ignoreBuildErrors`).
- Navegador: F5 nas telas-alvo; console sem warning de hydration mismatch.
