# Spec — CRM Atendimento: filtros server-side + fix de paginação + barra V2

> Status: em implementação (agente `crm-filtros-v2`). Plano-mestre: `/root/.claude/plans/anliase-o-plano-abaixo-reflective-lynx.md` (Fase 1).
> Adaptação da "fatia mínima" do plano CRM Inteligente (origem: QOZT) para op7nexo.

## Problema

A lista de conversas (`/crm/atendimento/conversas`) filtra de duas formas hoje:
1. `GET /conversas` (FastAPI) só aceita `status/equipe_id/responsavel_id/busca` — falta filtrar por **canal**, **escopo** (novas/minhas/equipe), **acompanhamento** (em atendimento / sem resposta), **tipo** (grupos/diretas), **arquivadas** e **não-lidas**.
2. O proxy Next (`conversations/route.ts`) busca com `limit` e depois **filtra em memória** (canal/grupos/equipe/resolvidas) **DEPOIS do corte da página** → paginação inconsistente. Além disso `canal_id` **nunca** é enviado ao backend.

Com **2.679 conversas** em produção, o bug de paginação é severo (páginas "encolhem" ao filtrar).

## Objetivo

Mover toda a filtragem para o `GET /conversas` (SQL, **antes** de `limit/offset`) e consumir no front por uma barra V2 (atrás de flag), corrigindo a paginação. **Sem migration** (só lê colunas existentes). Sem regressão para o front atual.

## Comportamento esperado

### Backend — `GET /conversas` ganha query params OPCIONAIS
Todos opcionais ⇒ chamadas atuais seguem idênticas. Todos aplicados como cláusulas SQL antes de `offset/limit`.

| Param | Valores | Semântica |
|---|---|---|
| `canal_id` | UUID | `canal_id == X` |
| `escopo` | `todas`(def)/`novas`/`minhas`/`equipe` | `novas`= sem responsável **e** status `nova`; `minhas`= responsável == eu; `equipe`= responsável != null **e** != eu (semântica "não é minha"; gate de supervisão real fica p/ RBAC futuro) |
| `acompanhamento` | `em_atendimento`/`sem_resposta` | `em_atendimento`= status `em_atendimento`; `sem_resposta`= espelha o job `leads_sem_resposta` (`ultima_direcao='saida'` ∧ `last_outbound_at < now()-2h` ∧ `last_outbound_at >= ATIVACAO_LEADS_SEM_RESPOSTA` ∧ status≠`resolvido`) |
| `tipo` | `todos`/`grupos`/`diretas` | `is_group` true/false |
| `arquivadas` | bool (tri-state) | `None`=legado (sem filtro de status); `true`=só `resolvido`; `false`=exclui `resolvido` |
| `nao_lidas` | bool | `nao_lidas > 0` (contador **global**; read-state por usuário é Fase 2 — débito declarado) |

**Precedência na dimensão STATUS (evita combinação contraditória retornar vazio em silêncio):**
1. `status` explícito (legado) vence tudo na dimensão status.
2. senão `arquivadas=true` ⇒ só `resolvido` (e ignora `acompanhamento`/`escopo=novas` na dimensão status).
3. senão `arquivadas=false` ⇒ exclui `resolvido`.
4. `acompanhamento` e `escopo=novas` só aplicam restrição de status quando **não** há `status` explícito nem view arquivada.
Dimensão RESPONSÁVEL (`escopo` minhas/equipe e `responsavel_id` legado) é ortogonal e sempre aplicável.
> O front V2 garante UX coerente: ao ligar ARQUIVADAS, reseta `escopo` para `todas`. O backend aplica a precedência como rede de segurança.

### Front
- `conversations/route.ts`: enviar `canal_id` + passthrough dos novos params ao backend; sob `FILTROS_V2`, **pular** o bloco de filtro-em-memória (backend já filtra). Flag off ⇒ caminho legado intacto.
- Barra V2 (atrás de `const FILTROS_V2`, default `false`) no estilo `--ws-*`: dropdowns Canal / Responsável (só humanos) / Acompanhamento + linha escopo (TODAS|NOVAS|MINHAS|EQUIPE) + linha tipo/estado (TODOS|GRUPOS|DIRETAS|NÃO LIDAS|ARQUIVADAS). Persistência via `usePersistedState`.

## Critérios de aceite
- [ ] `GET /conversas` aceita os 6 params novos; ausência deles ⇒ resposta idêntica à atual.
- [ ] Com `limit` baixo + filtro, o filtro ocorre **antes** do corte (contagens corretas, sem "encolher").
- [ ] `arquivadas=true` retorna só resolvidas; `arquivadas=false` nunca retorna resolvidas; combinação contraditória segue a precedência (não erro 500).
- [ ] `acompanhamento=sem_resposta` retorna o mesmo conjunto-base do job `leads_sem_resposta` (mesmos critérios de tempo/direção/piso).
- [ ] `FILTROS_V2=false` ⇒ tela idêntica à de hoje (regressão zero).
- [ ] `FILTROS_V2=true` ⇒ cada controle filtra; seleção persiste em reload; paginação/loadMore correta com filtros.
- [ ] Multi-tenant preservado (toda query mantém `workspace_id` + `verificar_acesso_workspace`).

## Fora de escopo (Fase 1)
Read-state por usuário (`crm_conversa_leituras`), handoff/`ai_*`, threshold por workspace, resgate endpoint, RBAC. Remoção destrutiva do filtro-em-memória legado (só após flip do flag).
