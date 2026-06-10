---
description: "Task list — Estúdio de Criativos (Fase 1: imagem)"
---

# Tasks: Estúdio de Criativos (Fase 1: imagem)

**Input**: `docs/specs/gerador-criativos/` (spec.md, plan.md, contracts/design-api.md)

**Tests**: incluídos apenas nos pontos críticos (validação de upload/máscara, `resolve_generation_size`, multi-tenant). Demais via verificação manual end-to-end.

## Progresso (2026-06-10)

**Feito e validado:** T001 (migration 063), T002 (models), T003 (config `OPENAI_IMAGE_*`), T005 (`upload_validation.py`), T007 (`image_gen.py` + `resolve_generation_size` + guardrail), T016 (parcial — `POST /design/gerar-base` SSE `created→completed|failed`; **partials progressivos pendentes**), T017 (`GET /design/gerar-base/{id}`), T015 (parcial — `GET /design/estilos`; falta `/templates`). Validado end-to-end com gpt-image-2 real via curl. Commits locais (sem push). **Descoberta:** chave de imagem é dedicada (não o gateway de texto zen); `base_url` explícito.

**Próximo:** partials; `criativo_render` (Playwright no worker) + `/renderizar-criativo`/`/exportar`; brand-kit/logos; front.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência).
- **[Story]**: US1..US5 conforme spec.md. Caminhos exatos incluídos.

---

## Phase 1: Setup (infra compartilhada)

- [ ] T001 Criar migration `alembic/versions/063_criativos_design.py` com as 6 tabelas (`criativo_brand_kits`, `criativo_logos`, `criativo_templates`, `criativo_estilos`, `criativo_geracoes`, `criativo_projetos`) + `criativo_export_jobs`; todas com `workspace_id` e `ativo` (soft delete). Ver `contracts/design-api.md` §Modelo de dados.
- [ ] T002 [P] Criar models em `app/models/criativo/` (um arquivo por entidade) e exportar em `app/models/__init__.py`.
- [ ] T003 [P] Adicionar settings em `app/core/config.py`: `MINIO_BUCKET_CRIATIVOS` (já existe), limites de upload (`CRIATIVO_MAX_UPLOAD_MB`, dimensões), `OPENAI_IMAGE_MODEL="gpt-image-2"`.
- [ ] T004 Adicionar `playwright` + browsers (Chromium) e `python-magic`/`Pillow` ao `requirements.txt` e ao Dockerfile do worker (`op7nexo-worker`); provisionar fontes de marca no container.

---

## Phase 2: Foundational (bloqueia todas as stories)

**⚠️ Nenhuma user story começa antes desta fase.**

- [ ] T005 Criar `app/services/upload_validation.py`: validar MIME real (magic bytes), tamanho/dimensão máx, `ImageOps.exif_transpose`, strip de metadados, normalização; função `validar_mascara(base, mask)` (mesmo tamanho + alpha + formato). (FR-004)
- [ ] T006 [P] Test `tests/test_upload_validation.py`: rejeita extensão mentindo conteúdo, corrige EXIF, máscara sem alpha → erro. 
- [ ] T007 Criar `app/services/image_gen.py`: cliente OpenAI (padrão `ia_insights._chamar_openai`), builder de prompt (estilo + briefing + Brand Kit + áreas livres + guardrails anti-texto/logo — FR-002), `resolve_generation_size(creative_format, template)` (FR-005), chamada `images.generate`/`images.edit`, persistência em `criativo_geracoes` com auditoria (`model_snapshot`, `prompt_final`, `params_json`, `request_id`, `usage`, `error_code`) (FR-012).
- [ ] T008 [P] Test `tests/test_resolve_generation_size.py`: todos os `creative_format` mapeiam para tamanho válido (múltiplos de 16, ratio ≤ 3:1, 0,65–8,3 MP).
- [ ] T009 Criar `app/services/criativo_render.py`: monta template+logo+textos via Playwright headless → bytes export; sem OpenAI. Função pura chamável pelo worker. (FR-013, FR-017)
- [ ] T010 Adicionar ao `app/worker.py` o polling de `criativo_export_jobs` (status `pending`) executando `criativo_render` e gravando `export_urls_json` no projeto; estados de job + graceful shutdown como `sync_jobs`. (FR-015)
- [ ] T011 [P] Criar `app/schemas/criativo_design.py` (pydantic in/out de todos os endpoints, conforme `contracts/design-api.md`).
- [ ] T012 Criar `app/api/criativos_design.py` (router) + registrar em `app/api/__init__.py`; dependência de auth/workspace e gate do módulo `marketing`; todas as queries filtram `workspace_id` (FR-018). Helper de URL de mídia servida pela API (FR-019).
- [ ] T013 [P] Test `tests/test_criativos_design_tenant.py`: workspace B não vê estilos/projetos/logos do workspace A (FR-024).
- [ ] T014 Seed de estilos globais e templates (feed/story/reels/banner) — script em `scripts/seed_criativos.py`.

**Checkpoint**: base pronta — stories podem começar.

---

## Phase 3: US1 — Gerar e exportar um criativo (P1) 🎯 MVP

**Goal**: ciclo gerar base → montar → exportar, sem Brand Kit obrigatório.

- [ ] T015 `GET /design/estilos` e `GET /design/templates` (lista global + workspace). (US1)
- [ ] T016 `POST /design/gerar-base` com **SSE** (`generation.created/partial/completed/failed`), partials descartáveis; salva base no MinIO via API; estados `pending|streaming|done|error` + `error_code`. (FR-008..FR-010)
- [ ] T017 `GET /design/gerar-base/{id}` — recuperar estado/resultado (reconexão). (FR-011)
- [ ] T018 `POST /design/renderizar-criativo` — cria/atualiza `criativo_projetos` (base + template + text_layers) e dispara/retorna preview server-side opcional; sem OpenAI. (FR-013)
- [ ] T019 `POST /design/exportar` — enfileira `criativo_export_jobs`; `GET` de status do job; retorna `export_urls`. (FR-015, FR-016)
- [ ] T020 [P] Front: reescrever `src/components/demandas/design/GeradorCriativos.tsx` removendo mock (linha ~39) e hardcodes `STYLES/COM_TONES/FORMATS`; consumir estilos/templates da API.
- [ ] T021 [P] Front: `TemplateCanvas.tsx` — preview/edição WYSIWYG em DOM (headline/CTA como campos), áreas seguras do template.
- [ ] T022 [P] Front: `useDesignStudio.ts` — SSE de geração (com reconexão por ID) + SWR de histórico; chips de briefing; campos separados headline/subtítulo/CTA/preço.
- [ ] T023 Front: ação Exportar (acompanha job) + botão Baixar; atalhos "WhatsApp"/"Meta" (apenas abrir destino, sem automação).

**Checkpoint**: MVP demonstrável (gerar→montar→exportar).

---

## Phase 4: US2 — Brand Kit + logo real (P2)

- [ ] T024 `GET /design/brand-kit` e `PUT /design/brand-kit`. (FR-021)
- [ ] T025 `POST /design/logos` (upload, via `upload_validation`) e `GET /design/logos` (listar do workspace). (FR-020)
- [ ] T026 Integrar Brand Kit ao builder de prompt (cores/tom/regras) e à montagem (logo como camada, cores/fonte nos textos). (FR-021)
- [ ] T027 [P] Front: `BrandKitPanel.tsx` + `LogoPicker.tsx` (subir/escolher logo, editar cores/fonte/tom).

---

## Phase 5: US3 — Reabrir e editar sem nova geração (P2)

- [ ] T028 Persistir snapshots em `criativo_projetos` (`brand_kit_snapshot`, `logo_snapshot`, `template_snapshot`) na criação. (FR-022)
- [ ] T029 `GET /design/historico` e `GET /design/projetos/{id}` (reabrir editável). (FR-023)
- [ ] T030 Re-render/re-export a partir de edição de texto/logo/formato **sem** chamar OpenAI; validar 0 chamadas de geração. (FR-014, SC-003)
- [ ] T031 [P] Front: tela de histórico + reabrir projeto com edição inline.

---

## Phase 6: US4 — Editar/variar a base (P3)

- [ ] T032 `POST /design/editar-base` — `images.edit` com `referencias_json` (múltiplas) e máscara validada (`upload_validation.validar_mascara`); erros `invalid_reference`/`invalid_mask`. (FR-003, FR-004)
- [ ] T033 [P] Front: subir referência(s), "gerar variação", editor simples de máscara/área aproximada (linguagem aproximada, sem promessa pixel-perfect).

---

## Phase 7: US5 — Estilos próprios do workspace (P3)

- [ ] T034 `POST|PUT|DELETE /design/estilos` (CRUD de estilos do workspace; globais read-only). (FR-024)
- [ ] T035 [P] Front: gestão de estilos do workspace.

---

## Phase 8: Polish & validação

- [ ] T036 [P] Mapear todos os `error_code` para mensagens/ações amigáveis no front (0 erro genérico). (SC-005)
- [ ] T037 Verificação end-to-end (ver spec §Verificação): `deploy.sh api`+`front`, fluxo 1→10, máscara inválida, export 1080×1080 e 1080×1920 consistentes com preview.
- [ ] T038 Ritual de fim: `graphify update .` nos dois repos, atualizar `CONTEXT.md` (api e front), commit conventional + push.

---

## Dependências
- Phase 2 bloqueia tudo. US1 (Phase 3) é o MVP e não depende de US2–US5.
- US2/US3/US4/US5 dependem de Phase 2 + endpoints de US1, mas são independentes entre si (podem ir em paralelo após o MVP).
- `[P]` = arquivos distintos; T020–T022 (front) paralelos a T015–T019 (back) após contratos fechados.
