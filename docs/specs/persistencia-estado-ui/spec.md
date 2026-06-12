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

### Hook base `usePersistedState` (`src/hooks/use-estado-persistido.ts`)
Implementado com **`useSyncExternalStore`** (não `useEffect`):
- Snapshot consistente entre renders concorrentes e múltiplas instâncias — o restore
  por `useEffect` PERDIA a corrida em dashboards pesados (Meta/Google re-renderizam
  durante o load), deixando a aba no padrão apesar do valor salvo.
- SSR-safe: `getServerSnapshot = padrao` (sem hydration mismatch; verificado em prod, console limpo).
- Cache por chave mantém a referência do snapshot estável (exigência do useSyncExternalStore).
- Bônus: sincroniza entre abas (evento `storage`).

### Fase 1 — Sidebar ✅
- Hook `usePersistedState` (SSR-safe) em `src/hooks/use-estado-persistido.ts`.
- Regra de abertura de grupo: `secaoAtiva(pathname) ? true : (toggleUsuario[chave] ?? grupo.abertoPadrao)`.
  - **Rota atual sempre vence**: o grupo da página onde o usuário está abre, mesmo que tivesse sido fechado.
  - Demais grupos: toggle explícito do usuário persiste; senão `abertoPadrao`.
- Colapso da sidebar migrado ao mesmo hook (elimina flash de hidratação).
- Critério de aceite: após F5 numa subpágina, o grupo correto continua aberto e destacado; toggles do usuário em grupos não-ativos persistem.

### Fase 2 — Rascunho de formulários (PARCIAL)
- Hook `useRascunho` (`src/hooks/use-rascunho.ts`) sobre `usePersistedState`.
- **Chave com escopo de usuário obrigatório**: `rascunho:${userId}:<form>` (evita vazar rascunho entre usuários na mesma máquina).
- Autosave com debounce ~500ms; **flush síncrono** em `pagehide`/`beforeunload` (NÃO usar diálogo bloqueante — protege só a janela antes do debounce).
- Restaurar no mount com banner "Recuperamos o que você estava preenchendo" + Restaurar/Descartar; `limpar()` no submit/geração ok.
- **FEITO:** `GeradorCriativos.tsx` (briefing + copy: headline/subheadline/cta/bullets/cidade/selo/tom/público/cores). NÃO persiste uploads (dataUrls — quebraria cota do localStorage).
- **NÃO aplicado (decisão de engenharia):**
  - `modal-config-empresa.tsx` — **somente leitura** (zero inputs). Nada a persistir.
  - `modal-meu-perfil.tsx` — só nome/email **pré-preenchidos do servidor** + **campo de senha** (segurança: senha nunca vai para localStorage). Modal fecha no F5 e reabre com dados do servidor → rascunho de baixo/nenhum valor.
- **Pendente de decisão do usuário:** cadastros reais são **dialogs** (`novo-usuario-dialog`, `nova-conta-dialog`, `novo-canal-dialog`) que fecham no F5; rascunho neles é o padrão "reabrir para recuperar". Confirmar se vale aplicar (e cuidado com senha no novo-usuário).

### Fase 3 — Estado de visualização das telas de dados (FEITO, verificado em prod)
Todas as abas restauram após F5 (Meta=Financeiro, Google=Campanhas, PMP=Resumo, Estúdio=Histórico).
- Persistir **aba ativa** via `usePersistedState` (decisão do usuário: **NÃO** por URL/compartilhável):
  - `pagina-meta-ads.tsx` → `op7-nexo-meta-aba`
  - `pagina-google-ads.tsx` → `op7-nexo-google-aba`
  - `app/.../demandas/pmp/page.tsx` (dono do estado, não o `PmpTabs` presentacional) → `op7-nexo-pmp-aba`
  - `EstudioCriativos.tsx` → `op7-estudio-aba`
- **Filtros NÃO migrados (decisão):** `filtros-criativos.tsx`/`grid-criativos.tsx` guardam só um número (`colunas`/`cols`) — refatorar não traz ganho. Filtros do Meta Ads (`op7-nexo-meta-filtros`) têm lógica de recência de data que o hook JSON genérico regrediria. Mantidos como estão.

## Verificação
- Gate de tipos: `npx tsc --noEmit` não pode introduzir erro novo vs baseline (build mascara com `ignoreBuildErrors`).
- Navegador: F5 nas telas-alvo; console sem warning de hydration mismatch.
