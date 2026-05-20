# Auth + Multi-tenancy

## Objetivo
Autenticação JWT e isolamento de dados por workspace. Toda entidade do sistema pertence a um workspace; usuários enxergam apenas os dados do(s) workspace(s) ao qual têm acesso.

## Estado atual
Implementado e em produção. Cobre login, registro, verificação de sessão e hierarquia completa de roles.

## Escopo
- In scope: JWT, roles, hierarquia networks/workspaces/companies/users, filtros multi-tenant
- Out of scope: OAuth externo, SSO, refresh token (token atual tem 24h de vida)

## Hierarquia de roles
```
platform_admin
  └── network_admin (enxerga todos os workspaces/companies da sua network)
        ├── network_viewer (somente leitura, limitado a companies vinculadas)
        └── company_admin (administrador de uma company específica)
              └── company_agent (operacional de uma company)
```

## Regras de comportamento

### Auth
- `POST /auth/registro` — cria o **primeiro** usuário (só funciona com 0 usuários no banco). Role: `platform_admin`.
- `POST /auth/login` — retorna `{ access_token, token_type: "bearer" }`. JWT HS256, exp 1440min (24h). Payload: `{ sub: user_id, role, workspace_id, exp }`.
- `GET /auth/me` — retorna dados do usuário autenticado. Qualquer role.
- Token inválido ou expirado → 401.

### Multi-tenancy
- Toda query deve filtrar por `workspace_id`. Nunca retornar dados de outros workspaces.
- `platform_admin`: enxerga tudo, sem filtro de workspace.
- `network_admin`/`network_viewer`: filtrado pela `network_id` do usuário.
- `company_admin`/`company_agent`: filtrado pelo `workspace_id` do usuário.
- Soft delete padrão: `ativo = false`. Registros inativos não aparecem em listagens.

### Acesso a companies (`user_company_access`)
- `network_viewer` pode ser vinculado a companies específicas via `POST /users/{id}/access`.
- Sem vínculo = sem acesso.

## Entidades afetadas
`networks`, `workspaces`, `workspace_modules`, `companies`, `users`, `user_company_access`, `user_permission`, `user_workspace_access`

## Inputs e outputs
- Login: `{ email: string, senha: string }` → `{ access_token: string, token_type: "bearer" }`
- JWT payload: `{ sub: uuid, role: role_usuario, workspace_id: uuid|null, exp: timestamp }`

## Casos de erro
- Email não encontrado → 401 "Credenciais inválidas"
- Senha incorreta → 401 "Credenciais inválidas"
- Token expirado → 401
- Role insuficiente → 403
- Recurso de outro workspace → 403 ou 404

## Critérios de aceite
- [x] Login retorna JWT válido com payload correto
- [x] `platform_admin` enxerga todos os workspaces
- [x] `company_agent` enxerga apenas o próprio workspace
- [x] Soft delete: `ativo=false` não aparece em listagens
- [x] `UNIQUE(usuario_id, company_id)` em `user_company_access`

## Open Questions
- None
