---
description: "Tasks — Modelo Reverso (visão→JSON)"
---

# Tasks: Modelo Reverso

## Fase 1 — Extração (começar aqui; testável por curl)
- [ ] T001 `app/core/config.py`: `openai_vision_model = "gpt-4.1"`.
- [ ] T002 `app/services/creative_vision.py`: `extrair_creative_spec(image_bytes) -> dict` (gpt-4.1, json_object, image_url base64) + validação/normalização do schema + `_map_error`.
- [ ] T003 `app/api/criativos_design.py`: `POST /design/analisar-modelo` (recebe `referencia_base64`, valida via `validar_e_normalizar_imagem`, retorna `creative_spec` + `usage`).
- [ ] T004 Deploy + teste curl: referência → JSON completo.

## Fase 2 — Geração reverso
- [ ] T005 `image_gen.montar_prompt_integrado`: ramo `modelo_reverso` que monta o prompt a partir do `creative_spec` (posições/paleta/elementos) + `densidade_ajuste` (fiel|equilibrado|livre).
- [ ] T006 `GerarIn`: campos `creative_spec` (dict) e `densidade_ajuste`; `reference_usage="modelo_reverso"`.

## Fase 3 — Logo por região
- [ ] T007 `criativo_render.aplicar_logo`: aceitar posição/size derivados de `regions.logo` (mapear termos → coords/âncoras) com área segura.
- [ ] T008 No fluxo reverso, compor a logo real na região do JSON quando `regions.logo.present`.

## Fase 4 — Front
- [ ] T009 Modo "Modelo Reverso" no `REF_USOS`; ao selecionar com referência, chamar `/design/analisar-modelo`.
- [ ] T010 Painel de pontos editáveis (mapeia o JSON em campos: headline/sub/bullets/CTA/footer/paleta/região da logo) + seletor "densidade de ajuste".
- [ ] T011 Gerar enviando o `creative_spec` editado.

## Fase 5 — Galeria de modelos curados
- [ ] T012 Seed de modelos curados (imagens) em `criativo_estilos`/`criativo_templates` com `thumb_url`.
- [ ] T013 Front: substituir seletor "Estilo" (palavra) pela galeria de modelos curados (thumbnails).
