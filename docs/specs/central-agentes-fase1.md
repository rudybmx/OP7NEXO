# Spec — Central de Agentes · FASE 1 (Fundação)

> **Esta spec NÃO reescreve o plano.** Comportamento, schema completo, rationale dos desvios e
> decisões fechadas estão em [`PLANO_CENTRAL_AGENTES.md`](../../PLANO_CENTRAL_AGENTES.md) §"FASE 1".
> Aqui ficam: (a) a **correção de numeração** descoberta no gate, (b) o **manifesto exato de
> arquivos afetados** (API + Front), (c) critérios de aceite/gates desta fase.

- **Branch (API):** `agent/central-agentes` · worktree `/root/wt/api-central-agentes` (base `origin/api/production`).
- **Branch (Front):** criar worktree próprio — `bash /root/agent-worktree.sh front central-agentes` (base `origin/production`).
- **Status:** aguardando aprovação da spec antes de escrever qualquer código.

---

## 0. CORREÇÃO CRÍTICA DE NUMERAÇÃO (gate executado)

O gate de numeração rodado no **tree compartilhado** retornou `074` — **valor defasado**. O worktree
construído de `origin/api/production` (a verdade de produção que o `deploy.sh` builda) tem a cabeça em **083**:

```
origin/api/production:  … 074 → 082 → 083   (revision "083", down_revision "082")
```
(Os números 075–081 **não estão em produção** — vivem na branch de port CRM não-mergeada, uma linhagem
Alembic divergente.)

➡️ **As migrations desta fase são `084` e `085`** (não 075/076 como rascunhado no PLANO). A primeira
encadeia em `down_revision = "083"`.

| PLANO (lógico) | Real nesta branch |
|---|---|
| `075_llm_providers.py` | **`084_llm_providers.py`** (`revision="084"`, `down_revision="083"`) |
| `076_central_agentes_core.py` | **`085_central_agentes_core.py`** (`revision="085"`, `down_revision="084"`) |

> ⚠️ **Risco de múltiplos heads (registrar):** se a branch de port (075–081, `down_revision` encadeado em 074)
> for mergeada depois, o Alembic terá heads divergentes (074→082→… e 074→075→…). Não é problema desta fase,
> mas o merge futuro exigirá um `merge revision`. Documentado, não resolvido aqui.

---

## 1. Escopo da FASE 1

**Inclui:** schema de providers de LLM + schema core de agente; CRUD de agente; CRUD de providers/modelos
+ token cifrado (Fernet); tela admin com 3 abas (Agentes / Uso&Consumo placeholder / Providers&Modelos);
seletor de workspace; regra "1 agente ativo por canal" (409).

**NÃO inclui (fases posteriores):** worker/`AgentService`/debounce/handoff (Fase 2), sandbox `/testar`
(Fase 2), RAG/pgvector/base de conhecimento (Fase 3), dashboard de uso real + versionamento de prompt +
feedback + few-shot (Fase 4). As seções RAG/Sandbox/Exemplos do formulário entram **desabilitadas** ("em breve").

**Decisões já fechadas** (ver PLANO §"Decisões Abertas — Antes da Fase 1"): Fernet p/ token; DB sobrepõe `.env`;
seletor lista todos os workspaces ativos; `cryptography` pinado; `LLM_TOKEN_ENC_KEY` provisionada.

---

## 2. Manifesto de arquivos — API (worktree `/root/wt/api-central-agentes`)

### 2.1 Migrations (`alembic/versions/`)
- **NEW** `alembic/versions/084_llm_providers.py` — `revision="084"`, `down_revision="083"`. Cria `llm_providers`, `llm_provider_tokens`, `llm_provider_modelos` + **seed** (OpenAI/OpenRouter/DeepSeek e modelos). DDL e seeds: PLANO §"Migration 075_llm_providers.py".
- **NEW** `alembic/versions/085_central_agentes_core.py` — `revision="085"`, `down_revision="084"`. Cria `agentes` (com `provider_id` FK→`llm_providers`, `modelo`, `debounce_segundos default 40`), `agente_canais` (+ `CREATE UNIQUE INDEX uq_agente_canal_ativo ON agente_canais (canal_id) WHERE ativo=true`), `agente_prompts`, `agente_horarios`, `agente_habilidades`. DDL: PLANO §"Migration 076_central_agentes_core.py".
  - Padrão Alembic do repo: cabeçalho com `revision`/`down_revision` (ver `alembic/versions/083_*.py`); usar `op.create_table`, `postgresql.UUID`, `server_default=sa.text("gen_random_uuid()")`, índice parcial via `op.create_index(..., postgresql_where=sa.text("ativo = true"))`.

### 2.2 Models — **NEW** pacote `app/models/agente/` (espelha `app/models/crm/`)
- `app/models/agente/__init__.py` — reexporta as classes.
- `app/models/agente/agente.py` — `Agente` (tabela `agentes`).
- `app/models/agente/agente_canal.py` — `AgenteCanal` (`agente_canais`).
- `app/models/agente/agente_prompt.py` — `AgentePrompt` (`agente_prompts`).
- `app/models/agente/agente_horario.py` — `AgenteHorario` (`agente_horarios`).
- `app/models/agente/agente_habilidade.py` — `AgenteHabilidade` (`agente_habilidades`).
- `app/models/agente/llm_provider.py` — `LlmProvider` (`llm_providers`).
- `app/models/agente/llm_provider_token.py` — `LlmProviderToken` (`llm_provider_tokens`).
- `app/models/agente/llm_provider_modelo.py` — `LlmProviderModelo` (`llm_provider_modelos`).
- Usar `Base`/`TimestampMixin` de `app/models/base.py` (já existe; `TimestampMixin` dá `criado_em`/`atualizado_em`).
- **MODIFIED** `app/models/__init__.py` — adicionar bloco `from app.models.agente import (Agente, AgenteCanal, AgentePrompt, AgenteHorario, AgenteHabilidade, LlmProvider, LlmProviderToken, LlmProviderModelo)` (mesmo padrão do bloco `from app.models.crm import (...)`).

### 2.3 Schemas — **NEW**
- `app/schemas/agente.py` — Pydantic `AgenteIn/Out/Update`, `HorarioIn`, `HabilidadeIn`, `AgenteListItemOut` (com canais + última atividade).
- `app/schemas/llm_provider.py` — `ProviderIn/Out/Update`, `ProviderTokenIn`, `ProviderTokenMaskedOut`, `ModeloIn/Out`.

### 2.4 Cripto + config — **NEW/MODIFIED**
- **NEW** `app/core/llm_crypto.py` — helper Fernet: `encrypt(token) -> str`, `decrypt(cipher) -> str`, `mask(token) -> str` (reusar regra de `app/api/ai_settings.py::_mask`: 6 primeiros + 4 últimos). Lê a chave de `settings.LLM_TOKEN_ENC_KEY`; erro claro se ausente.
- **MODIFIED** `app/core/config.py` — adicionar `LLM_TOKEN_ENC_KEY: str | None = None` (pydantic-settings; mesmo padrão das demais chaves).

### 2.5 Routers — **NEW** + registro
- **NEW** `app/api/agentes.py` — `APIRouter()` (sem prefixo de versão), auth `Depends(exigir_platform_admin)` em todas as rotas; helper `_get_workspace_or_404` (padrão `app/api/canais.py`). Endpoints (PLANO §"Router app/api/agentes.py"):
  - `GET/POST /workspaces/{workspace_id}/agentes`
  - `GET/PUT/DELETE /workspaces/{workspace_id}/agentes/{agente_id}`
  - `POST /workspaces/{workspace_id}/agentes/{agente_id}/toggle` (valida "1 ativo por canal" → **409**)
- **NEW** `app/api/llm_providers.py` — `APIRouter()`, auth `exigir_platform_admin`:
  - `GET/POST /llm-providers` · `PUT /llm-providers/{provider_id}`
  - `POST/GET /llm-providers/{provider_id}/token` (POST cifra com `llm_crypto.encrypt`; GET devolve só `llm_crypto.mask`)
  - `POST /llm-providers/{provider_id}/modelos` · `DELETE /llm-providers/{provider_id}/modelos/{modelo_id}`
- **MODIFIED** `app/main.py`:
  - imports após a linha 40 (bloco `from app.api.* import router as *_router`): `from app.api.agentes import router as agentes_router` e `from app.api.llm_providers import router as llm_providers_router`.
  - includes no bloco `app.include_router(...)` (após `estudio_stripe_router`, ~linha 147): `app.include_router(agentes_router)` e `app.include_router(llm_providers_router)`.

### 2.6 Dependências e ambiente — **MODIFIED**
- `requirements.txt` — adicionar `cryptography==49.0.0` (pin explícito; hoje só vem transitivo via `python-jose[cryptography]==3.3.0`).
- `.env.example` — adicionar `LLM_TOKEN_ENC_KEY=` (com comentário: gerar via `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`). **Não** commitar o valor real; provisionar no `.env` do VPS.

> `app/services/llm_client_service.py` **não** entra na Fase 1 (é Fase 2 — instancia o client e chama o LLM). A Fase 1 só precisa de cifra/decifra/máscara de token (`app/core/llm_crypto.py`).

---

## 3. Manifesto de arquivos — FRONT (worktree próprio `front central-agentes`)

> Repo separado (`op7nexo-front`, branch de prod `production`). Estado remoto = **SWR** (não TanStack). HeroUI v3.

- **NEW** `src/app/(plataforma)/admin/central-agentes/page.tsx` — `Tabs` HeroUI (`Agentes` | `Uso & Consumo` placeholder | `Providers & Modelos`) + seletor de workspace no topo.
- **NEW** `src/components/admin/central-agentes/`:
  - `AgentList.tsx`, `AgentCard.tsx` (toggle inline otimista via `mutate`).
  - `AgentFormModal.tsx` — drawer `Sheet`/`SheetContent` (`@/components/ui/sheet`) estilizado por `ws-sheet.ts`; seções (Identidade, Canais, Modelo cascata provider→modelo, Prompt, Horários, Habilidades, Handoff c/ "Tempo de debounce (s)" default 40, Limites). RAG/Sandbox/Exemplos desabilitadas. *(Accordion HeroUI v3: confirmar export em `@heroui/react`; se ausente, usar seções colapsáveis simples.)*
  - `HorariosFuncionamento.tsx` (grid 7 dias), `PromptEditor.tsx` (Fase 1: textarea + Salvar), `LLMProviderManager.tsx` (lista de providers + editar token mascarado + modelos por provider + seed rápido OpenAI/OpenRouter/DeepSeek).
- **NEW** `src/hooks/use-agentes.ts`, `src/hooks/use-llm-providers.ts` — SWR (espelhar `src/hooks/use-meta-tokens.ts`); chamadas via `src/lib/api-client.ts`.
- **MODIFIED** `src/lib/contexto-layout.tsx` — adicionar `{ nome: "Central de Agentes", rota: "/admin/central-agentes" }` no grupo administrativo (perto da linha ~170, ao lado de "Canais").
- **MODIFIED** `src/components/layout/barra-lateral.tsx` — mapear ícone `Bot` (lucide-react) para a nova rota, se o componente faz match rota→ícone.

---

## 4. Gates / Critério de done (Fase 1)

Da PLANO §"Gates (Fase 1)" + a correção de numeração:
- **Numeração:** migrations criadas como `084`/`085`, `down_revision` encadeado a partir de `"083"`; `alembic upgrade head` aplica limpo num DB scratch (sem múltiplos heads).
- **API import:** `python -c "import app.main"` OK (routers e models registrados).
- **Deps/env:** `cryptography==49.0.0` no `requirements.txt`; `LLM_TOKEN_ENC_KEY` no `.env`/`.env.example`.
- **Front:** `cd op7nexo-front && npx tsc --noEmit` sem regressão.
- **Smoke httpx** (padrão `/root/op7nexo-smoke.mjs`): criar provider + salvar token → `GET /llm-providers/{id}/token` retorna **só máscara, nunca o token completo** → criar agente (provider/modelo/debounce) → listar → ativar (`toggle`) → 2º agente ativo no mesmo canal retorna **409** → DELETE.

**Done quando:** CRUD de agente e de providers/modelos funcionam; token só mascarado na API e cifrado no banco; regra "1 ativo por canal" validada (409); `tsc --noEmit` limpo; smoke verde; migrations aplicam sem head duplicado.

---

## 5. Ordem de implementação (tasks; `[P]` = paralelizável)

**API (este worktree):**
1. `app/core/config.py` (LLM_TOKEN_ENC_KEY) + `app/core/llm_crypto.py` + `requirements.txt` + `.env.example`.
2. Migration `084_llm_providers.py` (+ seed).
3. Migration `085_central_agentes_core.py` (+ índice parcial).
4. Models `app/models/agente/*` + registro em `app/models/__init__.py`.
5. Schemas `app/schemas/{agente,llm_provider}.py`. `[P]` com (6) parcial.
6. Routers `app/api/{llm_providers,agentes}.py` + registro em `app/main.py`.
7. Smoke httpx + `alembic upgrade head` em DB scratch.

**Front (worktree `front central-agentes`, após a API expor os endpoints):**
8. Hooks SWR `[P]` → 9. Página + Tabs + seletor workspace → 10. `LLMProviderManager` `[P]` `AgentList`/`AgentCard` → 11. `AgentFormModal` + subcomponentes → 12. Menu (`contexto-layout.tsx`/`barra-lateral.tsx`) → 13. `tsc --noEmit`.

> Deploy só ao fim, sob `lock-deploy` (API: `deploy.sh api`; Front: `deploy.sh front`), após push nas branches de produção. **Worker não muda nesta fase.**

---

## 6. Pendências de verificação na implementação (não bloqueiam a spec)
- Export de `Accordion` em `@heroui/react` v3 (fallback: colapsável simples).
- Como `barra-lateral.tsx` resolve ícone por rota (mapa explícito vs. campo no item de menu).
- `app/api/canais.py::_get_workspace_or_404` reusável vs. duplicar helper local em `agentes.py`.
