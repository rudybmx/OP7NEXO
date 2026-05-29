# OP7NEXO — Instruções do Agente

## ARQUIVO CANÔNICO

Este `AGENTS.md` é a **fonte única** de instrução (padrão aberto, lido nativo por Codex/opencode/Copilot). `CLAUDE.md` apenas importa este arquivo via `@AGENTS.md`. **Não edite o CLAUDE.md** — toda mudança de instrução vem aqui. Ver constituição, regra 1.3.

---

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
- Após qualquer migration: `bash /root/deploy.sh api`

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
Se a implementação mudou comportamento, adicionou módulo, endpoint ou modelo de dados, atualize `/root/op7nexo-api/CONTEXT.md` com 2-5 linhas descrevendo o que mudou. Mantenha o arquivo conciso — é o resumo de orientação rápida para novos agentes.

## COMANDOS ÚTEIS

```bash
# Auth
TOKEN=$(curl -s -X POST https://api.op7franquia.com.br/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@op7nexo.com","senha":"admin123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# Deploy (USAR SEMPRE ESTE — nunca docker compose up direto)
bash /root/deploy.sh api        # só API
bash /root/deploy.sh front      # só front
bash /root/deploy.sh both       # ambos em sequência

# Logs
cd /root/op7nexo-api && docker compose logs -f --tail=50
cd /root/op7nexo-front && docker compose logs -f --tail=50

# Graphify
graphify src/ docs/ --update   # incremental (só arquivos modificados)
graphify src/ docs/            # rebuild completo (primeiro run ou >24h)
```

## DEPLOY — REGRA OBRIGATÓRIA

**NUNCA** rodar `docker compose up` diretamente.
**SEMPRE** usar:
```bash
bash /root/deploy.sh api    # deploy da API
bash /root/deploy.sh front  # deploy do front
bash /root/deploy.sh both   # os dois em sequência (não paralelo)
```
O script tem lock — impede dois agentes deployando ao mesmo tempo.

### Comportamento em caso de lock (fila)
Se o script retornar erro de lock (outro agente deployando):
1. Aguarde 30 segundos
2. Tente novamente — máximo 5 tentativas
3. Se após 5 tentativas o lock persistir, **pare e reporte ao usuário**
Nunca ignore o lock. Nunca force o deploy.

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

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
