# Tarefas — Criativos 2.0 (Fase 1)

> Ordem por dependência. `[P]` = paralelizável. Worktrees: API `/root/wt/api-criativos-2` · Front `/root/wt/front-criativos-2`. Commit granular + push em `agent/criativos-2`.

## T0 — PoC (CONCLUÍDO ✅)
- [x] Validar gpt-image-2: texto queimado, multi-painel, tamanhos 4:3/9:16, custo. Estratégia travada: **texto queimado pelo modelo**.

## T1 — Spec-kit (CONCLUÍDO ✅)
- [x] `docs/specs/criativos-2/{spec,plan,tasks}.md`.

## T2 — Dados (API) — base de tudo
- [ ] `app/models/criativo/carrossel.py`: `CriativoCarrossel`, `CriativoCarrosselSlide` (+ export no `__init__`).
- [ ] Tabela de config do system prompt do Diretor (modelo + seed do prompt newsjacking da Parte 1).
- [ ] `alembic/versions/NNN_criativos_2_carrossel.py` (número no merge). `alembic upgrade head` num DB scratch.

## T3 — Diretor LLM (API) — depende de T2
- [ ] `app/services/carrossel_director.py`: schema Pydantic `RoteiroCarrossel`; `gerar_roteiro(tema, n_slides, master_format, origem)` (reusa modelo de copy + `_sem_travessao`); **validação + repair/retry**.
- [ ] `[P]` Seed/edição do system prompt newsjacking na tabela de config.
- [ ] Teste: assunto → roteiro válido (molde/curva/slides), sem gerar imagem.

## T4 — Orquestração de geração (API) — depende de T2, T3
- [ ] `app/services/carrossel_gen.py`: monta prompt integrado por slide (reusa `montar_prompt_integrado`), chama `image_gen`, consistência (`images.edit` personagem / multi-painel fatiado), grava slides, regenerar-slide, multi-formato sob demanda.
- [ ] Token model + pré-cheque do carrossel inteiro (reusa `estudio_wallet`/`custo_tokens`).
- [ ] `app/worker.py`: job `carrossel_gen` (claim atômico, progresso por-slide via Redis/SSE).

## T5 — Endpoints (API) — depende de T3, T4
- [ ] `app/api/criativos_carrossel.py`: `POST /diretor`, `PUT /{id}/roteiro`, `POST /{id}/gerar` (SSE), `POST /{id}/slides/{i}/regenerar`, `GET /{id}`. Registrar router. `verificar_acesso_workspace` em todos.
- [ ] Teste curl E2E (ws Doutor Feridas): diretor → gerar → SSE → MinIO.

## T6 — Front — depende de T5 (contrato), `[P]` com T4/T5 após contrato
- [ ] Rota `criativos-2/page.tsx` + `<Criativos2/>`.
- [ ] `[P]` `OrigemPicker`, `RoteiroReview` (editar), `PersonagensObjetos` (reusa uploader), `ConfigCarrossel`, `GaleriaCarrossel` (regenerar slide, low→high).
- [ ] `contexto-layout.tsx`: item `Criativos 2.0` sem `rota` (desativado).
- [ ] `useRascunho`/`usePersistedState` + SSE; Nielsen #1/#3/#5/#6/#9.

## T7 — Verificação + release — depende de T5, T6
- [ ] E2E + QA visual contra as 10 referências; typecheck front; boot API + migration.
- [ ] `graphify update`; atualizar `CONTEXT.md`.
- [ ] Merge `agent/criativos-2` → prod (`api/production` / `production`) + `lock-deploy bash /root/deploy.sh both` **e** `worker`. Migration number resolvido no merge.

## Evoluções (pós-MVP)
- [x] **Origin B — referência de estilo** (User Story 5): `/diretor` aceita `referencia_base64` → `creative_vision.extrair_creative_spec` extrai estilo (descrição+paleta) → alimenta o diretor; aba "Referência de estilo" + uploader no front.
- [ ] **Personagens & objetos (5+5)** (User Story 3): storage de fotos por carrossel + uploader + `images.edit` (rosto fiel).
- [ ] **Buscador de notícias (Origin A)**: Firecrawl gerenciado → 5 pautas.

## Fora de escopo (Fase 2)
- [ ] Origin A (Firecrawl gerenciado → 5 pautas). [ ] Modo contínuo/panorâmico (constraint ≤3:1). [ ] 4:3 mestre extra/derivação por outpaint (se necessário).
