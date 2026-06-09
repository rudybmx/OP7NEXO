# Contratos — API `/design/*` (Estúdio de Criativos, Fase 1)

Base: montada no `app/api/criativos_design.py`, prefixo a confirmar no padrão do repo (ex.: `/design`). **Toda** rota exige auth + `workspace_id` do contexto e filtra por ele. Mídia sempre servida/assinada pela API (front nunca acessa MinIO).

Convenção de erro (todas as rotas):
```json
{ "error_code": "invalid_mask", "error_message": "A máscara precisa ter o mesmo tamanho da imagem e canal alpha." }
```
`error_code` ∈ `blocked_by_policy | rate_limited | provider_error | invalid_prompt | invalid_reference | invalid_mask | timeout | validation_error | not_found`.

---

## Estilos & Templates

### `GET /design/estilos`
→ `200` `[{ id, nome, thumb_url, escopo: "global"|"workspace", tom_default, formato_default }]` (globais + do workspace).

### `POST /design/estilos` · `PUT /design/estilos/{id}` · `DELETE /design/estilos/{id}`
Body: `{ nome, prompt_template, thumb_url?, tom_default?, formato_default? }`. Globais são read-only (403 ao editar). `DELETE` = soft delete.

### `GET /design/templates`
→ `200` `[{ id, nome, creative_format, layout_json, escopo }]`. `layout_json` define áreas seguras (logo/headline/subtitulo/cta/imagem), margens, proporção.

---

## Brand Kit & Logos

### `GET /design/brand-kit` → `PUT /design/brand-kit`
Body PUT:
```json
{ "logo_id": "uuid|null", "logo_variants": {"horizontal":"url","icone":"url"},
  "primary_color":"#0E142A", "secondary_color":"#C9A84C",
  "font_family":"Inter", "tone_of_voice":"Sofisticado",
  "visual_rules":"...", "forbidden_rules":"..." }
```

### `POST /design/logos`  *(multipart)*
`file` (imagem). Backend valida MIME real, tamanho, EXIF, normaliza. → `201 { id, nome, arquivo_url, variant, width, height, mime_type }`. Erro → `invalid_reference`/`validation_error`.

### `GET /design/logos`
→ `200 [{ id, nome, arquivo_url, variant, width, height }]` (do workspace).

---

## Geração da base (IA)

### `POST /design/gerar-base`  *(SSE)*
Body:
```json
{ "estilo_id":"uuid", "briefing":"texto", "creative_format":"feed_1x1",
  "template_id":"uuid", "referencias": ["uuid|url", ...], "preservar_referencia": false }
```
Resposta: `text/event-stream` com 4 eventos:
```
event: generation.created
data: { "generation_id":"uuid", "status":"pending" }

event: generation.partial
data: { "generation_id":"uuid", "index":0, "preview_url":"..." }   # descartável

event: generation.completed
data: { "generation_id":"uuid", "base_image_url":"...", "usage": { "input_tokens":..., "output_tokens":..., "total_tokens":... } }

event: generation.failed
data: { "generation_id":"uuid", "error_code":"rate_limited", "error_message":"..." }
```
Backend resolve `generation_size` via `resolve_generation_size`. Não expõe `input_fidelity`. Não promete transparência.

### `GET /design/gerar-base/{id}`
Recuperação/reconexão → `200 { generation_id, status, base_image_url?, error_code?, error_message?, usage? }`.

### `POST /design/editar-base`  *(SSE, mesmos eventos)*
Body: `{ generation_id|base_image_url, instrucao, referencias?[], mask? (multipart ou url) }`. Edição **aproximada**. Máscara validada (mesmo tamanho + alpha) → senão `invalid_mask`.

---

## Montagem & exportação (sem IA)

### `POST /design/renderizar-criativo`
Cria/atualiza projeto:
```json
{ "projeto_id?":"uuid", "base_image_url":"...", "template_id":"uuid",
  "brand_kit_id?":"uuid", "logo_id?":"uuid",
  "text_layers": { "headline":"...", "subtitulo":"...", "cta":"...", "preco":"..." },
  "layout_overrides?": { "logo": {"x":..,"y":..,"scale":..} } }
```
→ `200 { projeto_id, preview_url }`. **Sem** chamada OpenAI.

### `POST /design/exportar`
Body: `{ projeto_id, export_size: "1080x1080", output_format: "png"|"jpeg"|"webp" }`.
→ `202 { job_id, status: "pending" }` (enfileira `criativo_export_jobs`; render Playwright no worker).

### `GET /design/exportar/{job_id}`
→ `200 { job_id, status: "pending|running|done|error", export_url?, error_code? }`.

---

## Histórico & projetos

### `GET /design/historico`
→ `200 [{ projeto_id, thumb_url, creative_format, status, updated_at }]`.

### `GET /design/projetos/{id}`
→ `200` projeto completo editável (base, template, logo, text_layers, snapshots, export_urls).

---

## Modelo de dados (migration `063_criativos_design.py`)

Todas: `id uuid pk`, `workspace_id uuid` (FK), `created_at/updated_at`, `ativo bool default true`.

| Tabela | Colunas principais |
|---|---|
| `criativo_brand_kits` | `logo_id?`, `logo_variants jsonb`, `primary_color`, `secondary_color`, `font_family`, `tone_of_voice`, `visual_rules text`, `forbidden_rules text` |
| `criativo_logos` | `nome`, `arquivo_url`, `variant`, `width`, `height`, `mime_type` |
| `criativo_templates` | `nome`, `creative_format`, `layout_json jsonb`, `escopo` (`global`/`workspace`) |
| `criativo_estilos` | `workspace_id NULL=global`, `nome`, `prompt_template text`, `thumb_url`, `tom_default`, `formato_default` |
| `criativo_geracoes` | `estilo_id`, `referencias_json jsonb`, `mask_url?`, `generation_size`, `imagem_base_url`, `model`, `model_snapshot`, `prompt_final text`, `params_json jsonb`, `request_id`, `provider_response_id`, `usage jsonb`, `status`, `error_code`, `error_message` |
| `criativo_projetos` | `user_id`, `base_image_url`, `template_id`, `brand_kit_id?`, `logo_id?`, `layout_json jsonb`, `text_layers_json jsonb`, `export_urls_json jsonb`, `brand_kit_snapshot jsonb`, `logo_snapshot jsonb`, `template_snapshot jsonb`, `status` |
| `criativo_export_jobs` | `projeto_id`, `export_size`, `output_format`, `status` (`pending/running/done/error`), `export_url?`, `error_code?`, `progresso` |

Índices: `(workspace_id, ativo)` em todas; `(workspace_id, status)` em `criativo_geracoes` e `criativo_export_jobs`.
