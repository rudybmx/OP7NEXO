# Implementation Plan: Estúdio de Criativos (Fase 1: imagem)

**Branch**: `gerador-criativos` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `docs/specs/gerador-criativos/spec.md`

## Summary

Transformar a tela `/marketing/demandas/design` (hoje mockup) num estúdio real onde o `gpt-image-2` gera apenas a **base visual** e o OP7NEXO **monta o criativo final** (template + logo real + camadas de texto + Brand Kit) e exporta no tamanho do canal. Arquitetura em 3 camadas: IA (gerar/editar base, streaming SSE) → montagem (render WYSIWYG, sem IA) → exportação (job no worker). Multi-tenant por `workspace_id`, todo storage atrás da API.

## Technical Context

**Language/Version**: Python 3.11 (API), TypeScript / Next 16 + React 19 (front)

**Primary Dependencies**: FastAPI, SQLAlchemy + Alembic, `openai` (Image API), MinIO (`app/services/object_storage.py`), Playwright (novo, no worker), APScheduler (`app/worker.py`). Front: Radix + Tailwind, `swr`, `framer-motion` (já no projeto).

**Storage**: PostgreSQL (6 tabelas novas, migration `063`), MinIO bucket de criativos (bases, logos, máscaras, exports).

**Testing**: pytest (API). Validação manual end-to-end via `deploy.sh` + curl/UI.

**Target Platform**: Linux (containers `op7nexo-api`, `op7nexo-worker`) atrás de Traefik.

**Project Type**: Web (backend FastAPI + frontend Next).

**Performance Goals**: geração de base ≤ ~60s (limite do modelo); montagem/preview no front instantâneos (DOM); export como job assíncrono.

**Constraints**: front sem credencial de storage (FR-019); render Chromium fora do request síncrono (FR-015); `generation_size` sempre válida no modelo (FR-005); guardrail anti-texto best-effort (FR-002).

**Scale/Scope**: 1 tela reescrita, 6 tabelas, ~10 endpoints, 2 services novos (`image_gen`, `criativo_render`), 1 worker job novo (export), seed de estilos/templates.

## Constitution Check

*GATE: spec-first cumprido (este conjunto spec/plan/tasks). Sem alteração de schema com dados em produção (tabelas novas). Multi-tenancy: todas as queries filtram `workspace_id` (constituição). Deploy só via `deploy.sh`. Sem mexer em WhatsApp/Helena/Meta sync.*

## Project Structure

### Documentation (this feature)

```text
docs/specs/gerador-criativos/
├── spec.md
├── plan.md            # este arquivo
├── tasks.md
└── contracts/
    └── design-api.md  # contratos dos endpoints /design/*
```

### Source Code

```text
op7nexo-api/
├── alembic/versions/063_criativos_design.py     # 6 tabelas
├── app/models/criativo/                          # brand_kit, logo, template, estilo, geracao, projeto
├── app/schemas/criativo_design.py                # pydantic in/out
├── app/services/
│   ├── image_gen.py                              # gpt-image-2 generate/edit + prompt builder + guardrails
│   ├── criativo_render.py                        # montagem/export via Playwright (chamado pelo worker)
│   └── upload_validation.py                      # MIME real, EXIF, normalização, máscara
├── app/api/criativos_design.py                   # rotas /design/*
└── app/worker.py                                 # + polling de export_jobs (render)

op7nexo-front/
└── src/components/demandas/design/
    ├── GeradorCriativos.tsx                      # reescrita (remove mock)
    ├── BrandKitPanel.tsx / LogoPicker.tsx
    ├── TemplateCanvas.tsx                        # preview/edição WYSIWYG (DOM)
    └── useDesignStudio.ts                        # hooks SWR + SSE
```

**Structure Decision**: Web app (Option 2). Backend e frontend em repos separados (`op7nexo-api` Python, `op7nexo-front` Next), seguindo padrões do `AGENTS.md` (models em `app/models/`, rotas em `app/api/[modulo].py`, migrations sequenciais).

## Decisões técnicas (research)

- **Modelo & API**: `gpt-image-2` via `client.images.generate` / `client.images.edit` (sem Responses API). Cliente OpenAI montado como em `app/services/ia_insights.py::_chamar_openai` (`settings.openai_api_key/base_url`). Registrar `model_snapshot` (id exato), `request_id`/`response_id` e `usage`.
- **Streaming**: SSE no `POST /design/gerar-base` com 4 eventos (`generation.created/partial/completed/failed`). Partials são preview descartável; estado recuperável por ID (`GET /design/gerar-base/{id}`).
- **Render / export** — preview no front em DOM (edição instantânea, container-query `cqw`). **Export final: Pillow síncrono no request** (`criativo_render.montar_criativo`, ~300ms, fontes DejaVu no Dockerfile da API) — decisão MVP que evita Chromium (worker tem limite de 1 GB). Trade-off: fidelidade aproximada vs o preview. Upgrade para Playwright/WYSIWYG (job no worker via `criativo_export_jobs`) fica como evolução se necessário.
- **Tamanhos**: `resolve_generation_size(creative_format, template)` mapeia para tamanho válido (múltiplos de 16, ratio ≤ 3:1, 0,65–8,3 MP). `export_size`/`output_format` aplicados na montagem.
- **Storage**: todas as mídias via API (`object_storage.put_bytes`/`public_url` ou URL assinada servida pela API). Nenhum acesso direto do front (FR-019).
- **Uploads**: `upload_validation.py` — magic bytes (`python-magic`/Pillow), limite de tamanho/dimensão, `ImageOps.exif_transpose`, strip de metadados, normalização; máscara exige mesmo tamanho + alpha.
- **Brand consistency**: Brand Kit enriquece o prompt (cores/tom/regras) e a montagem (logo/cores/fonte). Logo entra como camada real, não no prompt. Projeto salva `*_snapshot` para imutabilidade visual.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Playwright/Chromium no worker | Export WYSIWYG idêntico ao preview do front | Render por Pillow não reproduz tipografia/CSS do preview; canvas client-side é inconsistente entre navegadores/fontes |
| 6 tabelas novas | Separar IA (geração) de projeto editável + marca + snapshots | Tabela única misturaria auditoria de IA com estado editável e quebraria a imutabilidade por snapshot |
