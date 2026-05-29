# Constituição OP7NEXO

> Lei canônica do ecossistema (api + front + infra). Vive na raiz de cada repo do ecossistema (op7nexo-api e op7nexo-front), byte-idêntica; em `/root` há um symlink para a cópia da api, lido por agentes que operam da VPS.
> Todo agente (Claude Code, Codex, opencode, Copilot) lê e obedece em toda fase.
> `.specify/memory/constitution.md` aponta para este arquivo, não copia.
> Última revisão: 2026-05-29 · v1

---

## 1. Princípios de processo

1. **Spec-first.** Feature relevante começa por spec, depois plano, depois tasks, depois código. Sem vibe coding em produção.
2. **O grafo é o mapa.** Antes de grep/find/ler arquivo inteiro, usar `graphify query "<pergunta>"`. GRAPH_REPORT.md só para review amplo de arquitetura.
3. **Fonte única de instrução.** `AGENTS.md` é canônico e cross-tool. `CLAUDE.md` contém apenas `@AGENTS.md` mais extras Claude-only. Nunca manter dois arquivos de instrução gêmeos por cópia manual.
4. **Doc amarrada a evento, nunca a calendário.** CONTEXT.md e CHANGELOG atualizam por gatilho (fim de spec, hook de git), nunca "se passou X tempo".

## 2. Princípios não-negociáveis do produto

> Estes são LEI. Violação quebra produção ou segurança, independente da feature.

1. **Multi-tenancy absoluto.** TODA query filtra `workspace_id`, nos dois stacks (FastAPI/Python e BFF/Node). Não há RLS no banco, então este filtro é a ÚNICA barreira de isolamento entre tenants. Não é convenção, é a parede.

2. **Fonte única de dados.** O front NUNCA acessa Postgres, Redis ou MinIO direto. Todo dado passa pela API FastAPI (que aplica `workspace_id` e auth).
   - Estado atual: 21 route handlers do front violam isso via `lib/db.ts`. Isso é DÍVIDA em migração, não padrão.
   - Código novo é PROIBIDO de importar `lib/db.ts`.
   - Enforcement: o hook `pre-push` bloqueia qualquer diff novo que adicione import de `lib/db.ts` fora da lista de débito conhecida.

3. **Soft delete padrão.** `ativo BOOLEAN DEFAULT true`. Nunca DELETE físico de dado de negócio.

4. **Deploy só via script.** `bash /root/deploy.sh [api|front|both]`. Nunca `docker compose up` direto.

5. **Migration aplicada é imutável.** Migrations vivem em `alembic/versions/` (NÃO em `migrations/`, esse path no CONTEXT.md está errado), numeradas sequencialmente. Migration já aplicada nunca é editada: mudança é sempre nova migration.

6. **Secrets nunca vazam.** Jamais imprimir, logar ou commitar VALOR de secret/token/senha. Só nomes de variáveis. Vale para todo agente e todo log.

7. **Conventional Commits obrigatório.** `feat:`, `fix:`, `docs:`, `refactor:`, `migration:`. É o que alimenta a extração automática do CHANGELOG.

8. **Hermes está descomissionado.** Não faz parte do ecossistema. O `hermes-gateway.service` (unit de **sistema**, não `--user`) está `disabled` no boot e a instalação foi removida da VPS — não há agente rodando nem memória persistida. Reintroduzir Hermes exige decisão explícita do CTO e nova entrada aqui.
   - *Porquê:* o que não existe não pode violar multi-tenancy nem escrever no repo. Verificado e decidido em 2026-05-29.

## 3. Débitos conhecidos (roadmap de segurança)

- **Ausência de RLS no Postgres.** Hoje o isolamento multi-tenant é 100% camada de aplicação. Ativar Row Level Security como defesa em profundidade é débito de segurança aberto. Enquanto não existir, a regra 2.1 é a única proteção.
- **Split-brain de dados (front → Postgres).** 21 handlers Node batem direto no banco, incluindo auth, mutações de CRM e escrita admin. Alvo: backend único (API FastAPI). Migração pendente.

## 4. O que está fora de escopo desta constituição

- O QUE o sistema é (isso vive no PRD).
- O ESTADO técnico atual (isso vive no CONTEXT.md).
- COMO fazer X (isso vive nas specs e skills).
- Esta constituição contém apenas o que, se violado, quebra produção ou segurança.

---

*Regra de manutenção: este arquivo carrega em todo turn de todo agente. Mantê-lo curto. Cada lei: uma linha de regra, uma linha de porquê apenas se contraintuitivo. Se passar de ~60 linhas, algo aqui não é lei e deve sair.*
