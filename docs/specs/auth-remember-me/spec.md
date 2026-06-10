# Auth — Sessão persistente ("Manter logado") + correção do logout em 24h

## Objetivo
Corrigir a sessão que expira em 24h sem aviso (causa do bounce para /login nas páginas admin) e tornar o checkbox "Manter logado" funcional, com cookie endurecido (boas práticas de navegador).

## Estado atual (causa raiz)
- JWT expira em **24h** (`JWT_EXPIRE_MINUTES=1440`), **sem refresh** (`refreshToken` removido).
- `op7nexo_token` no localStorage **não expira** → após 24h vira bearer morto.
- Páginas admin usam `api-client` (Bearer `op7nexo_token`) → `/api/proxy/auth/me` responde **401** → `redirectToLogin()` → `/login`. (Páginas com cookie sobrevivem mais.)
- Cookie `ws-session`: `max-age=86400`, `SameSite=Lax`, **sem `Secure`**; checkbox "Manter logado" coletado mas **ignorado**.

## Escopo
- In: `remember` no `/auth/login` (token 30d marcado / 24h+sessão desmarcado); wiring do checkbox; cookie com `Secure` + duração por remember; storage session vs persistente.
- Out: refresh tokens; cookie `HttpOnly` server-side (decisão do usuário: endurecimento mínimo); migração do bearer→cookie-only.

## Regras de comportamento
### Backend (`/auth/login`)
- Aceita `remember: bool = False` (compatível — default mantém comportamento).
- `remember=true` → token exp **30 dias**; `remember=false` → exp **24h** (atual).
- Resposta inclui `expires_in` (segundos) para o front alinhar o cookie.

### Frontend
- "Manter logado" **marcado** → token em `localStorage` (persistente) + cookie `ws-session` com `max-age` = `expires_in` (30d).
- **Desmarcado** → token em `sessionStorage` + cookie **de sessão** (sem `max-age`, some ao fechar o navegador).
- Cookie sempre: `path=/; SameSite=Lax; Secure` (Secure só em https).
- `getToken()` lê `localStorage || sessionStorage`; `clearToken()` limpa ambos + cookie.

## Critérios de aceite
- [ ] Login com "Manter logado" → cookie persistente 30d; reabrir navegador mantém sessão; páginas admin abrem sem bounce.
- [ ] Login sem "Manter logado" → cookie de sessão; fechar o navegador desloga.
- [ ] Não há mais logout aos 24h para quem marcou "Manter logado".
- [ ] Cookie tem `Secure` em produção (https).
- [ ] `/auth/login` sem `remember` continua funcionando (retrocompatível).

## Test plan
- Headless (Playwright) na prod: login com/sem remember → inspecionar cookie (`max-age`/session, `Secure`) e storage; navegar nas 3 páginas admin (Clientes/Canais/Contas Ads) sem bounce.
- curl `/auth/login` com e sem `remember` → conferir `expires_in` (2592000 vs 86400).

## Open Questions
- Nenhuma (mecanismo = token longo no remember; cookie = endurecimento mínimo — confirmados).
