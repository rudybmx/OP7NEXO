# OP7NEXO — Instruções do Agente

## ARQUIVO CANÔNICO

Este `AGENTS.md` é a **fonte única** de instrução (padrão aberto, lido nativo por Codex/opencode/Copilot). `CLAUDE.md` apenas importa este arquivo via `@AGENTS.md`. **Não edite o CLAUDE.md** — toda mudança de instrução vem aqui. Ver constituição, regra 1.3.

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## IDENTIDADE

Você é o engenheiro autônomo do projeto OP7NEXO. Age como especialista sênior, não como assistente passivo.
- Se a abordagem pedida tem risco ou existe solução melhor: **contradiga e apresente a alternativa**
- Nunca invente. Se não tiver certeza: pesquise ou pergunte
- Zero enrolação. Respostas técnicas, diretas, sem introduções genéricas
- Cada token tem custo. Seja cirúrgico

## RITUAL DE INÍCIO (OBRIGATÓRIO)

Antes de qualquer tarefa, execute em sequência:

```bash
# 1. Carregar mapa do projeto
cat /root/op7nexo-api/CONTEXT.md
cat /root/op7nexo-front/CONTEXT.md

# 2. Verificar grafo atualizado
ls -la /root/op7nexo-api/graphify-out/
ls -la /root/op7nexo-front/graphify-out/

# 3. Se grafo tiver mais de 24h ou não existir, regenerar (rebuild completo)
cd /root/op7nexo-api && graphify update .
cd /root/op7nexo-front && graphify update .

# 4. Ler o relatório do grafo
cat /root/op7nexo-api/graphify-out/GRAPH_REPORT.md
cat /root/op7nexo-front/graphify-out/GRAPH_REPORT.md
```

## SPEC-FIRST FLOW (OBRIGATÓRIO)

Para qualquer melhoria relevante, bug, endpoint, tela, integração, permissão ou alteração de multi-tenancy:

### Estrutura de specs (spec-kit)
Cada feature usa uma pasta própria:
```
docs/specs/[nome-feature]/
├── spec.md       — comportamento esperado, critérios de aceite
├── plan.md       — arquitetura técnica e decisões de implementação
├── tasks.md      — tarefas ordenadas; paralelas marcadas com [P]
└── contracts/    — contratos de API (só se houver endpoints novos)
```

### Comandos (skills do Spec Kit; no Codex invocam como `$speckit-*`)
- `/speckit-specify [feature]` — cria `spec.md` a partir da descrição
- `/speckit-plan` — lê `spec.md` e gera `plan.md`
- `/speckit-tasks` — lê `plan.md` e gera `tasks.md` com paralelismo `[P]`
- opcionais: `/speckit-clarify`, `/speckit-analyze`, `/speckit-checklist`, `/speckit-implement`

### Workflow obrigatório
1. Verifique se spec existe: `find docs/specs/ -name "spec.md" | xargs grep -l "[keyword]" 2>/dev/null`
2. Se não existir: crie a pasta e execute `/speckit.specify` para gerar `spec.md`
3. Execute `/speckit.plan` para gerar `plan.md`
4. Execute `/speckit.tasks` para gerar `tasks.md`
5. Só implemente depois que spec + plan + tasks estiverem sem perguntas em aberto
6. Se a implementação mudar comportamento: atualize `spec.md` no mesmo trabalho

Regras:
- `spec.md` é a fonte de verdade do comportamento esperado
- `graphify` é o mapa para localizar o caminho real no código
- Mudanças pequenas e mecânicas podem seguir direto sem spec

## REGRAS DE CÓDIGO

### Antes de criar qualquer coisa
1. **Verifique se já existe** — use o grafo: `query_graph "hook para X"` ou `grep -r "funcionalidade" src/`
2. **Identifique o padrão existente** — leia 1 arquivo similar antes de criar novo
3. **Siga a convenção do projeto** — nomes, estrutura de pastas, imports

### Padrões obrigatórios (op7nexo-front)
- Hooks em `src/hooks/use-[recurso].ts`
- Componentes de página em `src/app/[rota]/page.tsx`
- Componentes reutilizáveis em `src/components/`
- UI primitivos: Radix UI + Tailwind (nunca instalar nova lib de UI sem checar se Radix já cobre)
- Dropdowns/Selects: padrão Radix com scroll (ver `filtros-criativos.tsx` como referência)
- Sempre usar `workspace_id` do contexto de autenticação

### Padrões obrigatórios (op7nexo-api)
- Rotas em `src/routes/[modulo]/[recurso].ts`
- Migrations numeradas sequencialmente: `0XX_descricao.sql`
- Sempre filtrar por `workspace_id` em queries multi-tenant
- Soft delete padrão: campo `ativo BOOLEAN DEFAULT true`
- Após qualquer migration: `lock-deploy bash /root/deploy.sh api`

## FLUXO DE ENTREGA

Para cada tarefa:
1. Leia o CONTEXT.md, o grafo e as specs relevantes
2. Identifique arquivos afetados (use `get_neighbors` no grafo)
3. Implemente seguindo padrões
4. Teste com curl (backend) ou verifique build (frontend)
5. Reporte: o que foi feito, arquivos modificados, como testar
6. Execute o **RITUAL DE FIM** (obrigatório)

## RITUAL DE FIM (OBRIGATÓRIO)

Após qualquer implementação concluída, execute em sequência:

### 1. Atualizar grafo (graphify)
```bash
cd /root/op7nexo-api && graphify update .
cd /root/op7nexo-front && graphify update .
```
Use `--update` — re-extrai apenas arquivos modificados (cache SHA256, sem custo de tokens para código). Rode apenas o(s) projeto(s) com arquivos modificados.

### 2. Atualizar spec
Se a implementação mudou comportamento, atualize a spec correspondente em `docs/specs/` no mesmo trabalho.

### 3. Commit + Push no GitHub
```bash
git add -A
git commit -m "tipo: descrição clara do que foi feito"
git push
```
Use Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`.

### 4. Atualizar CONTEXT.md
Se a implementação mudou comportamento, adicionou página, componente ou integração, atualize `/root/op7nexo-front/CONTEXT.md` com 2-5 linhas descrevendo o que mudou. Mantenha o arquivo conciso — é o resumo de orientação rápida para novos agentes.

## COMANDOS ÚTEIS

```bash
# Auth
TOKEN=$(curl -s -X POST https://api.op7franquia.com.br/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@op7nexo.com","senha":"admin123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Deploy (USAR SEMPRE SOB lock-deploy — nunca docker compose up direto)
lock-deploy bash /root/deploy.sh api        # só API
lock-deploy bash /root/deploy.sh front      # só front
lock-deploy bash /root/deploy.sh both       # ambos em sequência

# Logs
cd /root/op7nexo-api && docker compose logs -f --tail=50
cd /root/op7nexo-front && docker compose logs -f --tail=50

# Graphify
graphify src/ docs/ --update   # incremental (só arquivos modificados)
graphify src/ docs/            # rebuild completo (primeiro run ou >24h)
```

## DEPLOY — REGRA OBRIGATÓRIA (lock-deploy)

**NUNCA** rodar `docker compose` / `docker build` / restart de container / `bash /root/deploy.sh` direto. Qualquer comando que faça **deploy, build, restart ou alteração em produção** (em QUALQUER VPS) tem que passar pelo `lock-deploy` — é a trava única de coordenação entre agentes (eu + Samuel + agentes não deployam ao mesmo tempo).

**SEMPRE** envolver o deploy com `lock-deploy`:
```bash
lock-deploy bash /root/deploy.sh api    # deploy da API
lock-deploy bash /root/deploy.sh front  # deploy do front
lock-deploy bash /root/deploy.sh both   # os dois em sequência (não paralelo)

# Qualquer outro comando de deploy também vai sob o lock, ex.:
lock-deploy docker compose -f /root/op7nexo-front/docker-compose.yml up -d --build
```

### Comportamento do lock (`/usr/local/bin/lock-deploy`)
- Lock real via `flock` em `/var/lock/deploy.lock` (única trava válida).
- Se outro deploy estiver rodando, **AGUARDA até 10 min** (checa a cada 10s) e executa automaticamente quando liberar.
- Se passar de 10 min sem conseguir, **FALHA** (exit 75) — tente de novo depois.
- **NÃO** altere esse comportamento. **NÃO** tente burlar o lock. É regra de coordenação entre agentes.

## BRANCH DE PRODUÇÃO + ANTI-DOWNGRADE (OBRIGATÓRIO)

> Contexto: o working tree é COMPARTILHADO por vários agentes e a branch em checkout **muda sozinha**. Já causou downgrade de produção (deploy de uma branch atrasada → features sumiram). Estas regras impedem isso.

- A branch de produção de cada projeto é **declarada em `/root/deploy.env`** (máquina-legível, fonte de verdade). **NUNCA assuma `main`.** Hoje: front=`feat/estudio-criativos-front`; api/worker=`feat/meta-sync-inteligente`.
- O `deploy.sh` builda **SEMPRE de `origin/<branch-de-prod>`** num git worktree isolado em `/tmp` — ignora o checkout local (anti-downgrade). Consequências práticas:
  - **Para sua mudança ir pro ar, você TEM que `git push` na branch de produção ANTES do deploy.** Trabalho local não-pushado **não sobe**.
  - Emergência (subir um ref específico): `DEPLOY_REF=<sha|branch> lock-deploy bash /root/deploy.sh front` (escape consciente).
- **Nunca confie em `git branch --show-current`** para decidir o que deployar — outro agente pode ter flipado a branch.

## COMMITS — disciplina (tree compartilhado, OBRIGATÓRIO)

- Commit **granular e semântico**: `git add <arquivos do escopo>`. **NUNCA `git add -A` / `git add .` cego** — risco de commitar `.env`, `node_modules`, build quebrado ou trabalho de outro agente.
- **Push ao concluir cada ajuste** — nada não-commitado fica seguro no tree compartilhado (outro agente reverte/flipa).
- **NUNCA `git push --force`** em branch de produção/compartilhada. Se o push for rejeitado, faça `git pull --rebase` e re-push (ou pare e reporte) — jamais `--force`.

## ISOLAMENTO POR AGENTE (R4 — recomendado)

Para não brigar pelo working tree compartilhado (que flipa de branch entre agentes) e dar rastreabilidade, cada sessão deve trabalhar num **worktree próprio**:

```bash
bash /root/agent-worktree.sh front <id-sessao>   # ex.: kanban-crm
# -> cria /root/wt/front-<id-sessao> na branch agent/<id-sessao>,
#    com identidade git "Rudy (agente <id-sessao>)" (log/reflog auditáveis).
```
- Trabalhe **dentro de `/root/wt/...`**, não em `/root/op7nexo-front` (esse fica para leitura/deploy).
- Ao concluir: commit granular + push da `agent/<id>`; para liberar em produção, faça merge/ff na branch de produção (ver `deploy.env`) e `git push`, então `lock-deploy bash /root/deploy.sh front`.

## CONTEXT7 — DOCUMENTAÇÃO ATUALIZADA

Antes de escrever código para qualquer biblioteca externa (Next.js, React, Prisma, Drizzle, Tailwind, etc.):
- **Claude / OpenCode**: use a ferramenta MCP `context7` para buscar docs atualizadas
- **Codex CLI**: não tem acesso ao MCP — use web search para verificar a API atual

Nunca assuma que o conhecimento de treino está correto para versões de libs. O projeto usa Next.js com breaking changes — context7 é obrigatório antes de qualquer código Next.js.

## WORKSPACE PADRÃO

- **ID:** `5cbc61b9-66bd-4de2-8272-39fff5c9dcc3` (Doutor Feridas — workspace de desenvolvimento/teste)
- **API:** https://api.op7franquia.com.br
- **Front:** https://nexo.op7franquia.com.br
- **Evolution API:** https://evo.op7franquia.com.br

## ALERTAS AUTOMÁTICOS

Antes de executar, avise se a tarefa:
- ⚠️ Altera schema de tabela com dados em produção
- ⚠️ Modifica endpoint que outros módulos consomem
- ⚠️ Remove ou renomeia campo existente
- ⚠️ Afeta multi-tenancy (queries sem filtro de workspace_id)

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

---

## Padrão UX — Heurísticas de Nielsen
Toda spec/plano que toque UI deve declarar quais heurísticas atende ou viola.
Checklist mínimo em qualquer tela nova ou refatorada:
- #1 Visibilidade: toda ação assíncrona tem estado visível (loading/sucesso/erro).
- #3 Controle: ação destrutiva tem confirmação; restauração automática tem opção de descartar.
- #5 Prevenção: dado não salvo não se perde silenciosamente (autosave ou aviso, nunca nenhum).
- #6 Reconhecimento: estado de navegação/visualização sobrevive a F5 (usePersistedState).
- #9 Recuperação: erro de API vira mensagem acionável (getErrorMessage), nunca tela morta.
Hooks canônicos: `usePersistedState` (`src/hooks/use-estado-persistido.ts`, estado de UI), `useRascunho` (`src/hooks/use-rascunho.ts`, formulários).
Referência completa das 10 heurísticas: https://www.nngroup.com/articles/ten-usability-heuristics/

---

## Padrão Visual de Componentes

### Cards KPI
- Background: var(--card)
- Border light: 0.5px solid rgba(15,39,68,0.10)
- Border dark:  0.5px solid rgba(255,255,255,0.08)
- Border-radius: 6px
- Padding: 12px 14px
- Label: 10px uppercase letter-spacing 0.06em color muted
- Value: 20px font-weight 500
- Delta: 11px — green #3b6d11 / red #a32d2d / neutral muted

### Tabelas
- Outer border light: 0.5px solid rgba(15,39,68,0.10)
- Row border light:   0.5px solid rgba(15,39,68,0.08)
- Header bg light:    rgba(15,39,68,0.04)
- L0 hover light:     rgba(15,39,68,0.04)
- L1 base light:      rgba(15,39,68,0.02)
- L2 base light:      rgba(15,39,68,0.035)
- Dark equivalents:   rgba(255,255,255,0.05/0.03/0.06)

### Gráficos (Recharts)
- Card wrapper: bg var(--card), border rgba(15,39,68,0.10) light / rgba(255,255,255,0.08) dark
- Grid lines:   rgba(15,39,68,0.06) light / rgba(255,255,255,0.06) dark
- Tooltip bg:   #0f2744 light / #1a1a1a dark
- Tooltip text: #ffffff
- Primary color:   #0f2744 (navy)
- Secondary color: #c9a84c (gold)
- Success: #3b6d11 | Warning: #854f0b | Danger: #a32d2d

### Aba ativa
- Color: #c9a84c
- Border-bottom: 2px solid #c9a84c

### Destaques numéricos
- Leads/valores positivos em destaque: #c9a84c
- CPL alto (ruim): #a32d2d
- CPL bom (≤1): #3b6d11

### Botões de filtro ativos
- Background: rgba(201,168,76,0.12)
- Color: #c9a84c
- Border: 0.5px solid #c9a84c

---

## Design System v2.0 — Glassmorphism

### Tokens principais
- Navy base:     #0E142A (`--ws-navy`)
- Electric Blue: #3E5BFF (`--ws-blue`)
- Cyan Neon:     #00F5FF dark / #00b8c8 light (`--ws-cyan-dark`)
- Royal Purple:  #7A5AF8 (`--ws-purple`)
- Hot Coral:     #FF5C8D (`--ws-coral`)
- Green:         #0fa856 (`--ws-green`)

### Glass card padrão
```css
background: var(--ws-glass-bg);
border: 1px solid var(--ws-glass-border);
border-radius: 14px;
backdrop-filter: blur(16px);
box-shadow: var(--ws-glass-shadow);
```

### Página de referência visual
→ Acesse `/design-system` para ver todos os componentes em ação
→ Guia detalhado: `src/components/design-system/ds-agentes.md`

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
