# Implementation Plan: Modelo Reverso (visão→JSON)

**Branch**: `gerador-criativos-reverso` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

## Summary
Adicionar a etapa de visão (`gpt-4.1`) que extrai um `creative_spec` JSON de uma referência, expõe os pontos editáveis no front, e gera um criativo fiel compondo a logo real na região do JSON. Reusa toda a infra do estúdio integrado (cliente OpenAI dedicado, SSE, `criativo_render` Pillow, `images.edit`).

## Technical Context
- **API** Python/FastAPI; **Front** Next 16.
- Visão: `chat.completions` com `response_format={"type":"json_object"}` + `image_url` base64 (validado com `gpt-4.1`).
- Geração: reusa `image_gen` (`images.edit` com a referência) + prompt montado do spec.
- Logo por região: `criativo_render` (Pillow) usando coordenadas de `regions.logo`.

## Decisões
- **Config**: `openai_vision_model = "gpt-4.1"` em `app/core/config.py` (mesma chave/base_url de imagem).
- **Schema `creative_spec`** (validado): `{format, mood, style, palette[], background, subjects[], regions:{logo{present,position,size}, headline{text,position,style}, subheadline{text,position}, bullets[]{text,icon}, cta{text,position,shape,color}, footer{text,position}}, density}`.
- **Modo**: `reference_usage="modelo_reverso"`. No `montar_prompt_integrado`, quando o spec extraído está presente, montar prompt detalhado a partir dele (posições/paleta/elementos) + densidade de ajuste.
- **Logo região**: estender `criativo_render.aplicar_logo` para aceitar `posicao` derivada de `regions.logo.position` (mapear "topo-esquerda"/"topo-centro"/"rodapé-esquerda" → coords) e `size`.
- **Galeria de modelos curados**: reusar `criativo_estilos`/`criativo_templates` com imagem (`thumb_url`); seed de modelos globais. Substitui o seletor "Estilo" (palavra).

## Estrutura
```
op7nexo-api/
├── app/services/creative_vision.py     # extrair_creative_spec(image_bytes) -> dict (gpt-4.1)
├── app/services/criativo_render.py     # + posicionamento de logo por região
├── app/services/image_gen.py           # prompt do modo modelo_reverso a partir do spec
├── app/api/criativos_design.py         # POST /design/analisar-modelo; /gerar aceita creative_spec
└── app/core/config.py                  # openai_vision_model

op7nexo-front/.../GeradorCriativos.tsx  # modo "Modelo Reverso" + painel de pontos editáveis + densidade de ajuste
```

## Fases de entrega (incremental)
1. **Extração** (este passo): `creative_vision.py` + `POST /design/analisar-modelo` + config. Testar por curl (retorna o JSON). ← começar aqui
2. **Geração reverso**: `/gerar` aceita `creative_spec` + `reference_usage="modelo_reverso"`; prompt do spec; densidade de ajuste.
3. **Logo por região**: compor logo real nas coords de `regions.logo`.
4. **Front**: modo Modelo Reverso + painel editável (mapeia o JSON em campos) + seletor de densidade de ajuste.
5. **Galeria de modelos curados** (substitui "Estilo").

## Verificação
- `POST /design/analisar-modelo` com uma referência → JSON completo (headline/CTA/paleta/região da logo).
- Modo reverso: editar um campo e gerar → criativo fiel ao layout, logo real na região.
- Comparar com "estilo+composição" (deve ser mais fiel).
- Ritual de fim: graphify, CONTEXT, commit escopo.
