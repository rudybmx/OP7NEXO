# Auditoria de Tenant, Roles e Liberação de Páginas — OP7NEXO

> **Tipo:** auditoria técnica + plano de padronização (Fase 1, **documentação apenas**).
> **Nada foi alterado:** sem código de produção, sem migration, sem banco, sem deploy, sem backfill, sem mexer em WhatsApp/atendimento/Webhook/Helena/Evolution/Meta Ads.
> **Data:** 2026-05-31. **Escopo:** `op7nexo-api` (FastAPI) + `op7nexo-front` (Next.js).
> Relacionado: `docs/specs/auth-multitenancy/` (spec anterior de multitenancy).

## Contexto

A plataforma está evoluindo para liberar telas por cliente/workspace e por usuário. Hoje convivem **três modelos de tenant sobrepostos** e **duas superfícies de API** com guardas independentes. Antes de implementar qualquer liberação por módulo/role, é preciso mapear o que está em uso, o que é legado, onde há duplicidade e onde há risco de vazamento cross-tenant. Este documento é o resultado dessa auditoria + o plano em fases.

**Decisões oficiais do usuário que guiam o plano:**
1. **`user_workspace_access` (UWA) é a fonte única de verdade de acesso a workspaces.** `users.workspace_id` passa a ser **apenas workspace padrão/preferência**, nunca concessão autônoma. Deprecação **gradual** (documentar → log → backfill → remover). Nesta etapa: só documentar.
2. **Front direct-DB / WhatsApp:** auditar agora, **não** alterar comportamento de WhatsApp/atendimento; migração é trilha futura separada.

---

## 1. Modelo de tenant atual

### 1.1 "Cliente = workspace" — VERDADE OPERACIONAL ATUAL ✅
`workspace` é o tenant real das telas e endpoints modernos (CRM, canais, ads, contatos, conversas). Tudo multi-tenant moderno filtra por `workspace_id`. `network/company` e o modelo Supabase/`org` são legados.

### 1.2 Tabelas — em uso / legado / futuro

| Tabela | Definição | Status | Observação |
|---|---|---|---|
| `users` | `app/models/user.py:19` | 🟢 EM USO | `workspace_id` (fallback), `role` (enum global), `network_id`, `ativo` |
| `workspaces` | `app/models/workspace.py:10` | 🟢 EM USO | **sem coluna `modulos`** — módulos vivem em `workspace_modules` |
| `user_workspace_access` (UWA) | `app/models/user_workspace_access.py:11` | 🟢 EM USO | relação real usuário↔workspace; `role` string `viewer/editor/admin`; **não exportado em `models/__init__.py`** |
| `workspace_modules` | raw SQL em `app/api/workspaces.py:19,39,44` | 🟢 EM USO (dados) | `(workspace_id, modulo, ativo)`; **lido/gravado mas NÃO aplicado como gate** |
| `ads_accounts` | `app/models/ads_account.py:11` | 🟢 EM USO | sempre ligado a 1 workspace |
| `ads_account_workspace_access` | `app/models/ads_account_workspace_access.py:11` | 🔵 ESPARSO | compartilhar conta entre workspaces |
| `networks` | `app/models/network.py:10` | 🟡 LEGADO | só escopo de `network_admin` |
| `companies` | `app/models/company.py:10` | 🟡 LEGADO | só endpoints antigos `/networks/.../companies` |
| `user_company_access` | `app/models/user_company_access.py:10` | 🟡 LEGADO | criado só p/ `network_viewer` |
| `user_permissions` | `app/models/user_permission.py:17` | 🔵 FUTURO/MORTO | nível por módulo — **nunca criado nem checado** |
| `account_resources` | `app/models/account_resource.py:16` | 🔵 FUTURO/MORTO | sem controle de acesso |
| `plans`/`modules`/`plan_modules` | `app/models/{plan,module,plan_module}.py` | 🔵 INCOMPLETO | catálogo existe; **não ligado a workspace** |
| `auth.users`, `org_members`, `organizations`, `organizacoes`, `perfis`, `meta_contas/campanhas/anuncios` | só em handlers Next legados | 🔴 LEGADO/MORTO | modelo Supabase/GoTrue+org de geração anterior (ver §6) |

**Duplicidade de modelo:** (a) `workspace` (ativo) vs `network/company` (legado) vs `org`/Supabase (morto); (b) `workspace_modules` (string) vs `plans/modules` (ORM); (c) `RoleUsuario` enum vs `user_workspace_access.role` string vs `level` numérico do front.

### 1.3 Duas superfícies de API (achado central)
- **Backend FastAPI** (`op7nexo-api`): guardas consolidadas em `app/core/deps.py`. Front chega via `src/lib/api-client.ts` → `/api/proxy/[...path]`. **É a superfície viva.**
- **Route handlers Next** (`op7nexo-front/src/app/api/**`): **21 handlers conectam direto no Postgres** (`src/lib/db.ts`, lib `postgres`), sem passar pelo backend. Auth via `getUserFromRequest` (`src/lib/api-auth.ts`) decodificando o **mesmo JWT** (header `Authorization` **ou** cookie `ws-session`). `workspace_id` aqui vem do **claim do JWT** (= workspace padrão), não do UWA. Inventário concreto na §7.

---

## 2. Roles globais (`RoleUsuario`, enum `app/models/user.py:11`)

| Role | Onde é enforced | O que permite hoje |
|---|---|---|
| `platform_admin` | `deps.py:43` `exigir_platform_admin`; bypass em todas as checagens | Tudo; todos os workspaces |
| `network_admin` | `deps.py:122`; hierarquia em `users.py` | Escopo da própria network |
| `network_viewer` | `users.py`; `deps.py` | Leitura; companies via UCA |
| `company_admin` | `users.py`; `canais.py:150` | Admin do próprio workspace (via UWA ou fallback) |
| `company_agent` | base; menu CRM | Operação básica de atendimento |

- Enforcement real no backend: `platform_admin`, `network_admin`, `company_admin`.
- Hierarquia de criação: `users.py` `_ROLES_PERMITIDAS` / `_verificar_pode_criar_role`.
- **Inconsistência:** roles globais (enum), roles de workspace (string UWA) e `level` numérico (`api-auth.ts:5 roleToLevel`) são três representações do mesmo conceito.

## 3. Roles por workspace (`user_workspace_access.role`)
Valores `viewer/editor/admin` (string). Resolução central: `deps.py:49 listar_workspaces_autorizados`. **Matriz desejada só parcialmente seguida:** a maioria dos endpoints checa **acesso ao workspace** (`verificar_acesso_workspace`) mas **não a role mínima**. Exceções que exigem role: atendimento (`_exigir_permissao_atendimento`, `canais.py:197`, editor/admin) e edição de canal (`_exigir_admin_canal`, `canais.py:146`, admin). Ou seja, **viewer hoje opera quase tudo que editor opera**, salvo enviar mensagem e editar canal.

## 4. Fallback `users.workspace_id` — resumo (detalhe na §9)
`listar_workspaces_autorizados` (`deps.py:72-79`): sem linha UWA ativa, concede `users.workspace_id`. Mesmo padrão em `canais.py:159`, `canais.py:191` e nos handlers Next que escopam por `user.workspace_id`. **Não é cross-tenant** (só libera o próprio workspace padrão), mas contorna o UWA e mantém acesso após revogação de UWA.

## 5. Páginas do front (menu em `src/lib/contexto-layout.tsx`; filtro em `src/components/layout/barra-lateral.tsx:348 gruposPermitidos`)

- **Guard de rota real: NÃO existe.** `middleware.ts` só checa presença do cookie `ws-session`. `(plataforma)/layout.tsx` injeta `AuthProvider`/`WorkspaceProvider`, mas a página **renderiza mesmo sem permissão** — o menu apenas **esconde** o item.
- Visibilidade de menu = **só role global**. Administração → só `platform_admin`; CRM → agent/admin; Marketing → admin+.
- **Módulo por workspace NÃO filtra menu nem rota** (ver §8).
- Não há `usePermission`/`useRole` nem `<RequirePermission>`. Só `useAuth` (`src/hooks/use-auth.ts`) e `useWorkspace` (`src/lib/workspace-context.tsx`).

| Área | Páginas | Rota base | Guard front | Risco |
|---|---|---|---|---|
| Admin | Usuários, Clientes, Canais, Contas Ads, Planos | `/administracao/**`, `/admin/**` | menu esconde; **rota não bloqueia** | acesso por URL direta |
| CRM | Conversas, Contatos, Agentes, Prompt IA | `/crm/atendimento/**` | menu por role; sem gate por módulo | viewer opera quase tudo |
| Marketing | Meta Ads, Campanhas, Criativos, Públicos | `/marketing/**` | menu por role | sem gate por módulo |

## 6. Endpoints backend — escopo de tenant

Padrão geral **bom**: maioria injeta `get_workspace_atual` ou chama `verificar_acesso_workspace`. Correções a exageros de severidade:
- `GET /conversas` (`conversas.py:186`) e `GET /mensagens` (`mensagens.py:129`): aceitam `workspace_id` por query **mas chamam `verificar_acesso_workspace` antes de filtrar** (`conversas.py:215`) → **não vazável**; é *smell* de clareza.
- `enviar-mensagem` (`canais.py:1359`): resolve workspace do **recurso** (`canal.workspace_id`) + `_exigir_permissao_atendimento` → seguro.
- Webhooks (`/webhook/meta|{token}|evolution`): sem auth de usuário (correto p/ webhook), workspace derivado do canal via token. Riscos anexos (fora de permissões): **rotação de secret retorna texto puro** (`canais.py:807`) e **sem rate-limit** no GET de verificação (`canais.py:1891`).
- Admin-only corretos: workspaces CRUD, ads-accounts list/update/delete, gestão de UWA (`users.py`) — `exigir_platform_admin`.

**"Sem workspace" (comportamento real):** `get_workspace_atual` retorna `[]`. Em `conversas`/`mensagens` → `400`. Em `criar_conversa` (`conversas.py:243`) → `403`. Em filtros por lista vazia → resultado vazio.

**Lacuna de role:** quase nenhuma escrita exige **role mínima de workspace** (editor/admin) — só atendimento e edição de canal.

---

## 7. Inventário handler-por-handler (front direct-DB)

> **21 handlers** em `op7nexo-front/src/app/api/**` que usam `getSql()`/`sql` (`src/lib/db.ts`).
> **Dois helpers de tenant:** (A) `resolveWhatsappWorkspaceAccess` (`src/lib/whatsapp-workspace-access.ts`) → busca `GET /me/workspaces` no backend → `allowedWorkspaceIds` (**honra UWA**); (B) `getUserFromRequest` (`src/lib/api-auth.ts`) → só o claim `user.workspace_id` do JWT (**ignora UWA**).
> **Decisivo:** o login vivo é o do **backend** (`lib/auth.ts:20 signIn → api.post('/auth/login') → /api/proxy`). Logo os handlers que falam com o schema Supabase/GoTrue+org são **código morto**.

### 7.1 Ativos — modelo workspace (`crm_whatsapp_*`, `users`, `workspaces`)

| # | Arquivo | Rota | Domínio | L/E | Tabelas | Resolve workspace hoje | UWA? | Risco | Prio. migr. | Recomendação futura |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `whatsapp/send/route.ts` | POST `/api/whatsapp/send` | Atendimento | E | `crm_whatsapp_conversas`, `canais_entrada` (+forward backend) | `resolveWhatsappWorkspaceAccess` + `workspace_id` body validado; envio real via backend `/canais/{id}/enviar-mensagem` | ✅ Sim | 🟢 Baixo (duplo guard) | Média | Mover resolução de canal p/ backend |
| 2 | `whatsapp/messages/route.ts` | GET `/api/whatsapp/messages` | Atendimento | L | `crm_whatsapp_mensagens`, `crm_whatsapp_conversas` | `getUserFromRequest` + `user.workspace_id`; query `workspace_id` só se == claim | ❌ Não | 🟠 Médio (ignora UWA; multi-ws quebrado; depende do fallback) | **Alta** | Usar `allowedWorkspaceIds` |
| 3 | `whatsapp/media/route.ts` | GET `/api/whatsapp/media` | Atendimento/mídia | L | `crm_whatsapp_midia` | **NENHUM** — filtra só por `conversa_id`, sem workspace, sem join | ❌ Não | 🔴 **Alto — IDOR cross-tenant** (qualquer autenticado lê mídia de qualquer conversa pelo `conversa_id`) | **Urgente** | JOIN com conversa + `allowedWorkspaceIds` |
| 4 | `whatsapp/media/upload/route.ts` | POST `/api/whatsapp/media/upload` | Atendimento/mídia | E (MinIO+DB) | `crm_whatsapp_conversas`, `crm_whatsapp_midia` | `getUserFromRequest` + `user.workspace_id` | ❌ Não | 🟠 Médio | **Alta** | `allowedWorkspaceIds` |
| 5 | `whatsapp/context/route.ts` | GET/DELETE `/api/whatsapp/context` | Atendimento/IA | L/E (Redis; escopo via DB) | `crm_whatsapp_conversas` (+Redis) | `getUserFromRequest` + `user.workspace_id` | ❌ Não | 🟠 Médio | **Alta** | `allowedWorkspaceIds` |
| 6 | `whatsapp/transfer/route.ts` | POST `/api/whatsapp/transfer` | Atendimento | E | `crm_whatsapp_conversas`, `users`, `crm_whatsapp_equipes`, `..._equipe_membros` | `resolveWhatsappWorkspaceAccess` + RBAC equipe (admin) | ✅ Sim | 🟢 Baixo | Média | Mover p/ backend |
| 7 | `whatsapp/agentes/route.ts` | GET `/api/whatsapp/agentes` | Atendimento | L | `users`, `workspaces` | `resolveWhatsappWorkspaceAccess` + `workspace_id` param validado | ✅ Sim | 🟢 Baixo | Média | — |
| 8 | `whatsapp/conversations/[id]/assumir/route.ts` | POST | Atendimento | E | `crm_whatsapp_conversas`, `users`, `..._equipe_membros` | `resolveWhatsappWorkspaceAccess` + `pode_atender_canais` + RBAC equipe | ✅ Sim | 🟢 Baixo | Média | Mover p/ backend |
| 9 | `whatsapp/conversations/[id]/status/route.ts` | PATCH | Atendimento (resolver/ia) | E | `crm_whatsapp_conversas`, `..._equipe_membros` | `resolveWhatsappWorkspaceAccess` + RBAC (responsável/admin) | ✅ Sim | 🟢 Baixo | Média | Mover p/ backend |
| 10 | `equipes/route.ts` | GET/POST `/api/equipes` | CRM/equipes | L/E | `crm_whatsapp_equipes`, `..._equipe_membros` | GET: `resolveWhatsappWorkspaceAccess` (UWA); **POST: `getUserFromRequest` + `user.workspace_id`** | ⚠️ Parcial | 🟠 Médio (POST) | **Alta** | Unificar no helper forte |
| 11 | `equipes/[id]/route.ts` | GET/PUT/DELETE | CRM/equipes | L/E | `crm_whatsapp_equipes`, `..._equipe_membros`, `users` | `getUserFromRequest` + `user.workspace_id` | ❌ Não | 🟠 Médio | **Alta** | `allowedWorkspaceIds` |
| 12 | `equipes/[id]/membros/route.ts` | GET/POST/DELETE | CRM/equipes | L/E | `..._equipe_membros`, `crm_whatsapp_equipes`, `users` | `getUserFromRequest` + `user.workspace_id` | ❌ Não | 🟠 Médio | **Alta** | `allowedWorkspaceIds` |
| 13 | `admin/usuarios/route.ts` | GET/POST/PUT `/api/admin/usuarios` | Admin/usuários | L/E | `users`, `workspaces` | Só `role==platform_admin` (sem escopo ws) | N/A | 🟠 Médio: **POST cria usuário só com `workspace_id`, SEM linha UWA → gera dependente de fallback**; PUT muda role/workspace livremente; paralelo ao `/usuarios` do backend | **Alta** | Usar endpoint do backend (`users.py`) que cria UWA |
| 14 | `health/route.ts` | GET `/api/health` | Infra | L | `SELECT 1` | Sem auth | N/A | 🟢 Baixo | Baixa | Manter ou apontar p/ healthcheck do backend |

### 7.2 Legado/morto — modelo Supabase/GoTrue + `org` (app NÃO usa; login real é o backend)

| # | Arquivo | Rota | Domínio | L/E | Tabelas (schema legado) | Escopo | Risco | Prio. migr. | Recomendação |
|---|---|---|---|---|---|---|---|---|---|
| 15 | `auth/login/route.ts` | POST `/api/auth/login` | Auth legado | L/E | `auth.users`, `user_profiles`, `org_members`, `organizations`, `auth.refresh_tokens` | — | 🟠 Médio-latente: emite JWT paralelo com `org_id` (modelo divergente); não chamado pelo app | Remover | Excluir handler (dead code) |
| 16 | `auth/me/route.ts` | GET `/api/auth/me` | Auth legado | L | `auth.users`, `user_profiles`, `org_members`, `organizations` | claim | ⚪ Baixo (morto) | Remover | Excluir |
| 17 | `auth/refresh/route.ts` | POST `/api/auth/refresh` | Auth legado | L/E | `auth.users`, `org_members`, `organizations`, `auth.refresh_tokens` | — | 🟠 Médio-latente | Remover | Excluir |
| 18 | `admin/organizacoes/route.ts` | GET/POST/PUT `/api/admin/organizacoes` | Admin legado | L/E | `organizacoes`, `perfis` | `level===0` | 🟠 Médio (platform_admin escreve em tabela morta) | Remover | Excluir |
| 19 | `meta/anuncios/route.ts` | GET `/api/meta/anuncios` | Meta legado | L | `meta_anuncios`, `meta_contas` | `user.org_id` (= `workspace_id` no token real → não casa) | ⚪ Baixo (retorna vazio) | Remover/reescrever | Usar `ads_accounts` do backend |
| 20 | `meta/campanhas/route.ts` | GET `/api/meta/campanhas` | Meta legado | L | `meta_campanhas`, `meta_contas` | `user.org_id` | ⚪ Baixo | Remover/reescrever | idem |
| 21 | `meta/overview/route.ts` | GET `/api/meta/overview` | Meta legado | L | `vw_meta_account_summary`, `vw_meta_account_financeiro`, `meta_contas` | `user.org_id` | ⚪ Baixo | Remover/reescrever | idem |

**Síntese:** 14 handlers ativos (modelo workspace) + 7 legados/mortos. Risco sistêmico: cada handler reimplementa escopo à mão → **um esquecimento = vazamento invisível ao backend** (caso já materializado em #3, `whatsapp/media`). 5 handlers ativos honram UWA; 8 dependem só do claim `user.workspace_id`; 1 (media) não escopa nada.

---

## 8. Módulos por workspace

- **Contrato de dados existe:** `workspace_modules` (backend) e o campo `modulos: string[]` salvo pela tela Clientes (`administracao/empresas/contas/page.tsx`; módulos `marketing/crm/gestao/performance`).
- **NÃO é aplicado em lugar nenhum:** nem menu, nem guard de rota, nem endpoint consulta `workspace_modules` para bloquear. Usuário com módulo desligado **acessa via URL direta** e o **backend responde normalmente**. Módulo é hoje **metadado decorativo**.

---

## 9. Depreciação do fallback `users.workspace_id`

> **Decisão oficial:** UWA = fonte única de verdade de acesso. `users.workspace_id` = só workspace padrão/preferência. **Nesta etapa: só documentar.** Não remover, não alterar comportamento, não rodar backfill, não mexer em backend/WhatsApp.

**1. Onde o fallback aparece (código)**
- `app/core/deps.py:72-79` — `listar_workspaces_autorizados`: sem UWA ativa, concede `users.workspace_id`. **Raiz**; tudo que usa `get_workspace_atual`/`verificar_acesso_workspace` herda daqui.
- `app/api/canais.py:159` — `_exigir_admin_canal`: `company_admin` vira admin do canal se `users.workspace_id == canal.workspace_id`, mesmo sem UWA.
- `app/api/canais.py:191` — `_workspace_access_role_para_atendimento`: deriva role pelo fallback quando não há UWA.
- `op7nexo-front/src/app/api/whatsapp/messages/route.ts:49,54` e demais handlers do grupo "só claim" (#2,#4,#5,#10-POST,#11,#12 da §7.1): escopam por `user.workspace_id` do JWT (claim = workspace padrão).
- `op7nexo-front/src/app/api/admin/usuarios/route.ts:72` — **cria** usuários só com `workspace_id`, **sem** linha UWA → fabrica dependentes do fallback.

**2. Endpoints que dependem dele** — qualquer um que use `get_workspace_atual`/`verificar_acesso_workspace` é coberto pelo fallback de `deps.py` quando o usuário não tem UWA: conversas, mensagens, contatos, canais, ads (`/workspaces/{id}/ads-accounts`), insights Meta, `GET /me/workspaces`. Pontos com fallback **próprio**: `canais.py:159`, `canais.py:191`, e os handlers Next "só claim".

**3. Risco de acesso indevido**
- **Não é cross-tenant** (só libera o próprio workspace padrão). Risco real = **revogação incompleta**: ao apagar a linha UWA, o usuário **continua acessando** enquanto `users.workspace_id` apontar para o workspace. UWA deixa de ser fonte confiável de "quem tem acesso".
- **Inconsistência multi-workspace:** usuário com vários acessos via UWA, lido por caminho "só claim" (`whatsapp/messages`), enxerga apenas 1 workspace.

**4. Query de diagnóstico (somente leitura — NÃO executar nesta etapa)**
```sql
-- Usuários ativos que dependem EXCLUSIVAMENTE do fallback (sem UWA ativa)
SELECT u.id, u.email, u.nome, u.role, u.workspace_id, w.nome AS workspace_padrao
FROM users u
JOIN workspaces w ON w.id = u.workspace_id
LEFT JOIN user_workspace_access uwa
       ON uwa.user_id = u.id AND uwa.ativo IS TRUE
WHERE u.ativo IS TRUE
  AND u.workspace_id IS NOT NULL
  AND uwa.user_id IS NULL          -- nenhuma linha UWA ativa
ORDER BY u.email;

-- Contagem agregada (dimensionar o backfill)
SELECT COUNT(*) AS usuarios_dependentes_do_fallback
FROM users u
LEFT JOIN user_workspace_access uwa
       ON uwa.user_id = u.id AND uwa.ativo IS TRUE
WHERE u.ativo IS TRUE AND u.workspace_id IS NOT NULL AND uwa.user_id IS NULL;
```

**5. Plano de backfill (planejado — NÃO executar agora)**
- Para cada usuário do diagnóstico, criar linha em UWA: `(user_id = u.id, workspace_id = u.workspace_id, role = <derivada>, ativo = true)`.
- `role` derivada do papel global reusando `_workspace_access_role_for_usuario` (`canais.py:168`): `platform_admin/network_admin/company_admin → admin`, `network_viewer → viewer`, demais → `editor`.
- Idempotente: `ON CONFLICT (user_id, workspace_id) DO NOTHING`.
- Entregar como **migration revisável** + script de verificação (rodar a query do item 4 → deve retornar 0). Fora desta etapa.

**6. Plano de remoção em fases**
- **Fase A (agora):** documentar (esta seção). Sem mudança de comportamento.
- **Fase B:** instrumentar — **log/alerta** no ramo de fallback (`deps.py:72-79`) registrando `user_id`/`workspace_id` quando o fallback for o que concedeu acesso. Observar em produção. Sem mudar decisão de acesso.
- **Fase C:** rodar backfill (item 5) + verificar diagnóstico zerado + confirmar logs de fallback ≈ 0.
- **Fase D:** remover o ramo de fallback de `deps.py`, `canais.py:159`, `canais.py:191`; migrar `whatsapp/messages` e demais handlers "só claim" para `allowedWorkspaceIds`; `admin/usuarios` POST passa a criar UWA. `users.workspace_id` segue **só** como default/preferência de UI.
- **Fase E:** regressão multi-tenant completa (item 7).

**7. Testes necessários antes de remover (Fase D)**
- Diagnóstico (item 4) retorna **0** dependentes.
- Logs da Fase B mostram fallback ≈ 0 por período representativo.
- Por papel (platform_admin, ws admin/editor/viewer, sem workspace, inativo): login + acesso a conversas/mensagens/contatos/canais/ads igual ao baseline.
- **Revogação:** apagar UWA de um usuário → ele **perde** o acesso imediatamente (hoje, com fallback, não perde).
- **Cross-tenant:** usuário do workspace A não acessa recursos do B por nenhum caminho (incluindo handlers direct-DB do front).
- Smoke end-to-end (`op7nexo-smoke.mjs`) antes/depois.

---

## 10. Matriz oficial proposta (alvo)

> Legenda: ✅ permitido · 👁 leitura · ❌ negado · 🔒 = gate adicional por módulo do workspace.
> "Sem workspace" = autenticado sem UWA e sem fallback.

| Ação / Página | platform_admin | ws admin | ws editor | ws viewer | sem ws | Guard front | Guard backend |
|---|---|---|---|---|---|---|---|
| Ver CRM/atendimento | ✅ | ✅ 🔒crm | ✅ 🔒crm | 👁 🔒crm | ❌ | rota+módulo | `verificar_acesso_workspace` + módulo |
| Enviar mensagem | ✅ | ✅ | ✅ | ❌ | ❌ | botão por role | `_exigir_permissao_atendimento` (já ✅) |
| Resolver conversa | ✅ | ✅ | ✅ | ❌ | ❌ | botão por role | exigir editor+ (HOJE: qualquer membro / RBAC equipe no handler) |
| Ver contatos | ✅ | ✅ | ✅ | 👁 | ❌ | rota+módulo | `verificar_acesso_workspace` |
| Editar/atribuir contato | ✅ | ✅ | ✅ | ❌ | ❌ | botão por role | exigir editor+ (HOJE: qualquer membro) |
| Editar canal | ✅ | ✅ | ❌ | ❌ | ❌ | menu admin | `_exigir_admin_canal` (já ✅) |
| Conectar número | ✅ | ✅ | ❌ | ❌ | ❌ | menu admin | `_exigir_admin_canal` (já ✅) |
| Ver Meta Ads | ✅ | ✅ 🔒mkt | ✅ 🔒mkt | 👁 🔒mkt | ❌ | rota+módulo | `verificar_acesso_workspace` + módulo |
| Administrar usuários | ✅ | parcial (do ws) | ❌ | ❌ | ❌ | menu admin | `exigir_platform_admin` (HOJE só platform) |
| Administrar cliente/workspace | ✅ | ❌ | ❌ | ❌ | ❌ | menu admin | `exigir_platform_admin` (já ✅) |
| Ver relatórios | ✅ | ✅ | 👁 | 👁 | ❌ | rota+módulo | `verificar_acesso_workspace` + módulo |
| Editar configurações do ws | ✅ | ✅ | ❌ | ❌ | ❌ | menu admin | exigir ws admin (HOJE: falta) |

Lacunas que a matriz expõe: (a) backend não exige **role mínima** na maioria das escritas; (b) **módulo** não é gate em lugar nenhum; (c) **guard de rota** inexistente no front; (d) `ws admin` ainda não administra usuários do próprio workspace.

## 11. Padrão técnico recomendado

**Backend (consolidar em `app/core/deps.py`):**
- `exigir_platform_admin` — já existe.
- `verificar_acesso_workspace(usuario, ws_id, db)` — já existe; tornar **único ponto** de checagem de acesso.
- `exigir_role_workspace(usuario, ws_id, min_role, db)` — **novo**: valida role mínima (`viewer<editor<admin`) via UWA, sem fallback silencioso.
- `resolver_workspace_do_recurso(...)` — **novo**: dado um recurso (canal/conversa/contato), retorna `workspace_id` do próprio recurso (nunca confiar no payload).
- `modulo_liberado(ws_id, modulo, db)` — **novo**: consulta `workspace_modules`; base do gate por módulo.
- Erro 403 padronizado; fallback isolado num único ponto com log (preparação p/ §9 Fase B).

**Front:**
- `usePermission()` / `useModulo()` — leem role + módulos do workspace atual.
- `<GuardRota minRole|modulo>` em layout de segmento → empty state "Sem acesso" em vez de renderizar.
- Menu (`gruposPermitidos`) filtra por **role + módulo**.
- Regra de ouro: **nunca confiar só no front** — todo gate front tem gate equivalente no backend.

## 12. Débitos e riscos (priorizado)

1. 🔴 **`whatsapp/media` GET — IDOR cross-tenant** (§7.1 #3): sem escopo de workspace. *(documentado; correção em fase futura — não mexer agora)*
2. 🔴 **Front direct-DB sem guarda unificada (21 handlers)** — cada um reimplementa escopo; 8 ativos dependem só do claim, 7 são legado/morto.
3. 🟠 **Guard de rota inexistente no front** — páginas admin acessíveis por URL direta.
4. 🟠 **Backend não exige role mínima** na maioria das escritas (viewer ≈ editor).
5. 🟠 **Módulos salvos mas não aplicados** (front e backend).
6. 🟡 **Fallback `users.workspace_id`** concede sozinho sem UWA (§9).
7. 🟡 **Modelos paralelos** workspace vs network/company vs org/Supabase; `workspace_modules` vs `plans/modules`; enum vs string vs level.
8. 🟡 **Auth/admin/meta legados (Supabase/org)** ainda deployados (dead code com superfície de risco latente).
9. 🟡 **Webhook secret em texto puro + sem rate-limit** (`canais.py:807,1891`). *(fora de permissões)*
10. ⚪ `user_workspace_access` ausente de `models/__init__.py` (cosmético).

## 13. Plano de implementação (fases futuras)

- **Fase 1 — Auditoria/documentação (ESTE documento).** Sem código de produção. ✅
- **Fase 2 — Helpers backend** (`exigir_role_workspace`, `resolver_workspace_do_recurso`, `modulo_liberado`; isolar fallback com log). Sem mudar comportamento de endpoint. Testes unitários.
- **Fase 3 — Endpoints críticos** (ordem): atendimento/envio → conversas/mensagens → canais → usuários → workspaces → Meta Ads. Aplicar role mínima; resolver workspace do recurso.
- **Fase 4 — Front guards/menu** (`usePermission`/`useModulo`, `<GuardRota>`, empty state, menu por role+módulo).
- **Fase 5 — Módulos por cliente/workspace** (`workspace_modules` canônico; gate de tela e de endpoint; liberação simples na tela Clientes).
- **Fase 6 — Regressão multi-tenant** (todos os papéis + inativo + cross-tenant, incl. handlers direct-DB).
- **Trilha separada (futura):** migração dos handlers direct-DB → backend e remoção dos legados Supabase/org. Inclui correção do IDOR de `whatsapp/media`.

## 14. Menor primeiro passo seguro
Após esta Fase 1, o menor passo seguro é a **Fase 2** (helpers no backend, sem alterar endpoints) com testes unitários — reversível e sem efeito em produção.

## 15. O que NÃO mexer agora
- **WhatsApp / Evolution / Webhook / Helena / Meta Ads / atendimento** — comportamento intocado (limite explícito). Handlers **auditados**, não alterados.
- **Banco** — sem migration, sem SQL destrutivo, sem alterar `workspace_modules`/UWA; **backfill não executado**.
- **Fallback `users.workspace_id`** — **não remover ainda**; só será deprecado com log + backfill (§9 Fases B–D).
- **Backend** — sem alterar `deps.py`/endpoints nesta etapa.
- **Front** — sem alterar handlers/guards/menu nesta etapa.
- **Modelos legados** (`network/company`, `org`/Supabase, `user_permissions`, `plans/modules`) — não apagar; consolidação só após auditoria aprovada.
- **Sem relaxar permissões:** toda mudança futura aperta ou mantém; nunca afrouxa.
