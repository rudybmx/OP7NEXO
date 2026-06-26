# Deploy — OP7NEXO

> **Fonte de verdade:** seções **DEPLOY — REGRA OBRIGATÓRIA**, **BRANCH DE PRODUÇÃO + ANTI-DOWNGRADE** e **ISOLAMENTO POR AGENTE** do [`AGENTS.md`](AGENTS.md). Este arquivo é só o resumo operacional.

## Como deployar

Todo deploy/build/restart passa **obrigatoriamente** por `lock-deploy` (trava única `flock` que coordena os agentes; espera até 10 min se outro deploy estiver rodando):

```bash
lock-deploy bash /root/deploy.sh api      # só API
lock-deploy bash /root/deploy.sh front    # só front
lock-deploy bash /root/deploy.sh worker   # só worker (automações CRM + scheduler + scan agenda/lembretes)
lock-deploy bash /root/deploy.sh both     # api+front em sequência — NÃO inclui worker
```

## Regras que tornam o deploy seguro

- **Anti-downgrade:** o `deploy.sh` builda **SEMPRE de `origin/<branch-de-prod>`** num worktree isolado em `/tmp` — ignora o checkout local. As branches de produção vivem em **`/root/deploy.env`** (fonte de verdade máquina-legível): `front=production`, `api/worker=api/production`. Front e API compartilham o mesmo repo remoto (`rudybmx/OP7NEXO`), separados por branch.
- **Sua mudança só sobe se você der `git push` na branch de produção ANTES do deploy.** Trabalho local não-pushado não vai pro ar.
- **NUNCA** rodar `docker compose up` / `docker build` / restart de container / `deploy.sh` direto (sem `lock-deploy`). **NUNCA** `git push --force` em branch de produção.
- Emergência (subir um ref específico): `DEPLOY_REF=<sha|branch> lock-deploy bash /root/deploy.sh front` (escape consciente).

## Fluxo completo (worktree isolado → liberar → deploy)

O passo a passo de ponta a ponta (criar worktree por sessão, commit granular, `merge --ff-only` na branch de produção, push, deploy) está na seção **ISOLAMENTO POR AGENTE** do [`AGENTS.md`](AGENTS.md).
