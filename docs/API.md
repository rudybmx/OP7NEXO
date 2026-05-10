# API — op7nexo-api

Base URL (interno): `http://op7nexo-api:8000`  
Autenticação: `Authorization: Bearer <JWT>` em todos os endpoints, exceto `/auth/registro`, `/auth/login` e `/health`.

**Roles:** `platform_admin` > `network_admin` > `network_viewer` > `company_admin` > `company_agent`

---

## Auth (`/auth`)

### `POST /auth/registro`
Cria o primeiro usuário da plataforma (somente funciona quando `users` está vazia).

**Body:**
```json
{ "nome": "string", "email": "string", "senha": "string" }
```

**Resposta 201:**
```json
{ "id": "uuid", "nome": "string", "email": "string", "role": "platform_admin", "ativo": true }
```

**Acesso:** Público (só funciona com 0 usuários no banco).

---

### `POST /auth/login`
Autentica e retorna JWT.

**Body:**
```json
{ "email": "string", "senha": "string" }
```

**Resposta 200:**
```json
{ "access_token": "string", "token_type": "bearer" }
```

**Acesso:** Público.

---

### `GET /auth/me`
Retorna dados do usuário autenticado.

**Resposta 200:**
```json
{ "id": "uuid", "nome": "string", "email": "string", "role": "string", "ativo": true }
```

**Acesso:** Qualquer autenticado.

---

## Usuários

### `GET /usuarios`
Lista todos os usuários.

**Resposta 200:** `[UsuarioAdminOut]` — inclui `workspace_id` e `workspace_nome`.

**Acesso:** `platform_admin` (todos), `company_admin` (somente do seu workspace).

---

### `POST /usuarios`
Cria usuário.

**Body:**
```json
{
  "nome": "string",
  "email": "string",
  "senha": "string",
  "role": "platform_admin|network_admin|network_viewer|company_admin|company_agent",
  "workspace_id": "uuid|null"
}
```

**Acesso:** `platform_admin`.

---

### `POST /auth/registro-usuario`
Alias de `POST /usuarios` (mesmo comportamento).

**Acesso:** `platform_admin`.

---

### `PUT /users/{usuario_id}`
Atualiza usuário. Campos opcionais: `nome`, `email`, `senha`, `role`, `ativo`.

**Acesso:** Próprio usuário (nome/email/senha) ou superior na hierarquia (todos os campos).

---

### `DELETE /users/{usuario_id}`
Desativa usuário (soft delete — `ativo = false`).

**Acesso:** `platform_admin` ou `network_admin` da mesma network.

---

### `GET /companies/{company_id}/users`
Lista usuários vinculados a uma company.

**Acesso:** Usuário com acesso à company.

---

### `POST /companies/{company_id}/users`
Cria usuário já vinculado a uma company.

**Acesso:** `company_admin` ou superior com acesso à company.

---

### `POST /users/{usuario_id}/access`
Vincula um `network_viewer` a companies específicas.

**Body:** `{ "company_ids": ["uuid", ...] }`

**Acesso:** `platform_admin` ou `network_admin` da mesma network.

---

## Workspaces (`/workspaces`)

### `GET /workspaces`
Lista workspaces visíveis para o usuário autenticado.

- `platform_admin`: todos
- `network_admin`/`network_viewer`: workspaces da sua network
- Outros: apenas o workspace do usuário

**Resposta 200:** `[WorkspaceOut]` — inclui lista de módulos ativos.

**Acesso:** Qualquer autenticado.

---

### `POST /workspaces`
Cria workspace.

**Body:**
```json
{
  "nome": "string",
  "razao_social": "string|null",
  "cnpj": "string|null",
  "endereco": {},
  "modulos": ["marketing", "crm"]
}
```

**Acesso:** `platform_admin`.

---

### `GET /workspaces/{workspace_id}`
Detalhes de um workspace.

**Acesso:** Qualquer autenticado.

---

### `PUT /workspaces/{workspace_id}`
Atualiza workspace e seus módulos (substituição completa da lista de módulos).

**Acesso:** `platform_admin`.

---

### `DELETE /workspaces/{workspace_id}`
Desativa workspace (`ativo = false`).

**Acesso:** `platform_admin`.

---

## Networks (`/networks`)

### `GET /networks`
Lista networks ativas.

**Acesso:** `platform_admin`.

---

### `POST /networks`
Cria network.

**Body:** `{ "nome": "string", "slug": "string", "descricao": "string|null" }`

**Acesso:** `platform_admin`.

---

### `GET /networks/{network_id}`
Detalhes de uma network.

**Acesso:** `platform_admin` ou usuário da mesma network.

---

### `PUT /networks/{network_id}`
Atualiza network.

**Acesso:** `platform_admin`.

---

### `DELETE /networks/{network_id}`
Desativa network (`ativo = false`).

**Acesso:** `platform_admin`.

---

## Companies

### `GET /networks/{network_id}/companies`
Lista companies de uma network visíveis ao usuário.

**Acesso:** Qualquer autenticado com acesso à network.

---

### `POST /networks/{network_id}/companies`
Cria company.

**Body:** `{ "nome": "string", "slug": "string", "cidade": "string|null", "estado": "UF|null", "telefone": "string|null" }`

**Acesso:** `platform_admin` ou `network_admin`.

---

### `GET /companies/{company_id}`
Detalhes de uma company.

**Acesso:** Usuário com acesso à company.

---

### `PUT /companies/{company_id}`
Atualiza company.

**Acesso:** `platform_admin`, `network_admin` ou `company_admin`.

---

### `DELETE /companies/{company_id}`
Desativa company.

**Acesso:** `platform_admin` ou `network_admin` da mesma network.

---

## Contas de Anúncios

### `GET /ads-accounts`
Lista todas as contas de anúncios de todos os workspaces.

**Resposta 200:** `[AdsAccountOut]` — inclui `workspace_nome`.

**Acesso:** `platform_admin`.

---

### `GET /workspaces/{workspace_id}/ads-accounts`
Lista contas de anúncios de um workspace específico.

**Resposta 200:** `[AdsAccountOut]`

**AdsAccountOut:**
```json
{
  "id": "uuid",
  "workspace_id": "uuid",
  "workspace_nome": "string|null",
  "plataforma": "string",
  "account_id": "string",
  "account_name": "string|null",
  "bm_id": "string|null",
  "status": "string",
  "config": {},
  "sincronizado_em": "ISO8601|null",
  "periodo_sync_inicio": "YYYY-MM-DD|null",
  "agrupamento": "string|null"
}
```

**Acesso:** Qualquer autenticado com acesso ao workspace.

---

### `POST /workspaces/{workspace_id}/ads-accounts`
Cria conta de anúncio manualmente.

**Body:**
```json
{
  "plataforma": "string",
  "account_id": "string",
  "account_name": "string|null",
  "token_acesso": "string|null",
  "bm_id": "string|null",
  "status": "ativo",
  "config": {},
  "agrupamento": "string|null"
}
```

**Acesso:** Qualquer autenticado com acesso ao workspace.

---

### `PUT /ads-accounts/{ads_account_id}`
Atualiza conta de anúncio (inclui campo `agrupamento`).

**Acesso:** `platform_admin`.

---

### `DELETE /ads-accounts/{ads_account_id}`
Remove conta de anúncio permanentemente.

**Acesso:** `platform_admin`.

---

## Meta Ads — Integração (`/meta`)

### `GET /meta/contas`
Busca contas de anúncio diretamente na Meta Graph API usando o token informado.

**Query params:** `token=string`

**Resposta 200:**
```json
[{ "account_id": "act_...", "account_name": "string", "account_status": 1, "currency": "BRL" }]
```

**Acesso:** `platform_admin`.

---

### `POST /meta/importar-contas`
Importa e/ou atualiza contas Meta selecionadas no banco.

**Body:**
```json
{
  "workspace_id": "uuid",
  "token": "string",
  "token_expira_em": "ISO8601|null",
  "periodo_sync": "mes_atual|1_mes|2_meses|3_meses",
  "contas": [{ "account_id": "act_...", "nome": "string" }]
}
```

**Resposta 200:** `{ "criadas": 2, "atualizadas": 1 }`

**Acesso:** `platform_admin`.

---

### `POST /meta/sync/{ads_account_id}`
Dispara sincronização imediata de uma conta Meta Ads (busca dados da Graph API e salva no banco).

**Resposta 200:** `{ "ok": true, "conta": "act_...", "totais": { "diarios": 30, "campanhas": 120, ... } }`

**Acesso:** `platform_admin`.

---

## Meta Ads — Insights (`/meta/insights`)

### `GET /meta/insights/visao-geral`
Agregado de performance do período para o workspace.

**Query params:**

| Param | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `workspace_id` | UUID | Sim | |
| `data_inicio` | YYYY-MM-DD | Sim | |
| `data_fim` | YYYY-MM-DD | Sim | |
| `conta_ids` | string | Não | IDs externos separados por vírgula (`account_id`, não UUID) |

**Resposta 200:**
```json
{
  "kpis": {
    "spend": 4801.24,
    "leads": 156,
    "impressions": 419319,
    "reach": 349271,
    "clicks": 11605,
    "ctr": 2.77,
    "cpc": 0.4137,
    "cpm": 11.5,
    "cpl": 30.7772,
    "frequencia": 1.2006
  },
  "contas": [{
    "id": "uuid",
    "account_id": "act_...",
    "account_name": "string",
    "spend": 0, "leads": 0, "cpl": 0, "ctr": 0, "cpc": 0, "cpm": 0,
    "impressions": 0, "reach": 0, "frequencia": 0, "saldo": null
  }],
  "dados_diarios": [{ "data": "YYYY-MM-DD", "spend": 0, "leads": 0, "impressions": 0, "clicks": 0 }],
  "leads_por_canal": [{ "canal": "facebook|feed", "leads": 0, "spend": 0, "percentual": 0 }],
  "periodo": { "inicio": "YYYY-MM-DD", "fim": "YYYY-MM-DD" }
}
```

**Acesso:** Qualquer autenticado.

---

### `GET /meta/insights/campanhas`
Performance por campanha no período.

**Query params:** Mesmos de `visao-geral`.

**Resposta 200:**
```json
[{
  "campaign_id": "string",
  "nome": "string",
  "status": "string",
  "objetivo": "string",
  "spend": 0, "leads": 0, "cpl": 0, "ctr": 0, "cpc": 0, "cpm": 0,
  "impressions": 0, "reach": 0, "clicks": 0
}]
```

**Acesso:** Qualquer autenticado.

---

### `GET /meta/insights/ia`
Gera 3 insights de IA analisando os KPIs e contas do período.

**Query params:** `workspace_id`, `data_inicio`, `data_fim`.

**Resposta 200:**
```json
[{
  "tipo": "OPORTUNIDADE|ALERTA",
  "mensagem": "string",
  "acao": "string"
}]
```

Retorna `[]` se `OPENAI_API_KEY` não estiver configurada.

**Acesso:** Qualquer autenticado.

---

## Canais de Entrada

### `GET /canais`
Lista todos os canais visíveis ao usuário.

**Acesso:** Qualquer autenticado (filtrado por workspace/network).

---

### `GET /workspaces/{workspace_id}/canais`
Lista canais de um workspace.

**Acesso:** Qualquer autenticado.

---

### `POST /workspaces/{workspace_id}/canais`
Cria canal. Para `tipo = 'webhook'`, gera `webhook_token` automaticamente.

**Body:**
```json
{
  "tipo": "whatsapp_evolution|whatsapp_oficial|instagram|facebook|webhook",
  "nome": "string",
  "config": {},
  "mensagem_boas_vindas": "string|null",
  "status": "inativo"
}
```

**Acesso:** Qualquer autenticado com acesso ao workspace.

---

### `GET /canais/{canal_id}`
Detalhes de um canal.

**Acesso:** Qualquer autenticado.

---

### `PUT /canais/{canal_id}`
Atualiza canal (nome, config, mensagem_boas_vindas, status).

**Acesso:** `platform_admin`.

---

### `DELETE /canais/{canal_id}`
Remove canal permanentemente.

**Acesso:** `platform_admin`.

---

### `POST /webhook/{token}`
Recebe payload de webhook externo (sem autenticação JWT).

**Path param:** `token` — deve corresponder ao `webhook_token` de um canal.

**Resposta 200:** `{ "recebido": true }`

**Acesso:** Público.

---

## Health

### `GET /health`
Verifica se a API está no ar.

**Resposta 200:** `{ "status": "ok" }`

**Acesso:** Público.
