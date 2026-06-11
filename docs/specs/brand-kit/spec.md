# Spec — Brand Kit por workspace (Estúdio AI)

## Objetivo
Configurar a identidade de marca **uma vez por workspace** (logo, cores, fonte, tom de voz, regras) e aplicá-la **automaticamente em toda geração** de criativo — sem reenviar logo/cores a cada criativo. Base para escala multi-franquia.

## Modelo de dados (já existia — sem migration)
- `criativo_brand_kits` (1 ativo por workspace): `logo_id` (FK→criativo_logos), `primary_color`, `secondary_color`, `font_family`, `tone_of_voice`, `visual_rules` (texto "sempre faça"), `forbidden_rules` (texto "nunca faça"), `ativo`.
- `criativo_logos`: asset da logo (`arquivo_url`, dims, mime); objeto no MinIO em `workspaces/{ws}/criativos/logos/{logo_id}.png` (preserva transparência via `validar_e_normalizar_imagem`).

## Endpoints (`/design/brand-kit`, multi-tenant — `verificar_acesso_workspace`)
```
GET    /design/brand-kit?workspace_id=        → { primary_color, secondary_color, font_family,
                                                  tone_of_voice, visual_rules, forbidden_rules, logo_url }
PUT    /design/brand-kit                       { workspace_id, ...campos } → upsert (1 por workspace) → kit
POST   /design/brand-kit/logo                  { workspace_id, image_base64, nome? } → { logo_url }  (substitui a anterior)
DELETE /design/brand-kit/logo?workspace_id=    → { ok }  (desvincula + soft-delete do asset)
```

## Aplicação na geração (`/design/gerar`)
- `brand_kit.carregar(db, ws)` → `aplicar_no_spec(spec, bk)`: preenche `primary_color/secondary_color/cor_60/cor_30/tone/visual_rules/forbidden_rules` **só onde o usuário não setou** (override do usuário sempre vence).
- Logo: se **não** veio `logo_base64` no request e o kit tem logo → usa a logo salva (`brand_kit.logo_bytes`) na composição.
- `montar_prompt_integrado` injeta `visual_rules` ("sempre siga") e `forbidden_rules` ("nunca faça") no prompt.
- Gating/débito de token **inalterados**.

## Critérios de aceite (validados por curl, sem gastar token)
- GET vazio → todos `null`. PUT salva e GET persiste. POST logo → `logo_url` + objeto no MinIO; `logo_bytes()` relê (PNG, alpha preservado). DELETE desvincula.
- Aplicado num spec sem cores/regras do usuário, o `prompt_final` contém a cor da marca + as regras "sempre/nunca".
- E2E (1 geração real): workspace com saldo + kit salvo, **sem** subir logo → criativo sai com a logo do kit composta e cores/regras aplicadas.

## Front
Tela **Marketing › Estúdio AI › Brand Kit** (`/marketing/estudio-ai/brand-kit`, `components/estudio-ai/BrandKit.tsx`): upload/preview/remover logo, cores (color picker), fonte, tom, "Sempre faça"/"Nunca faça"; Salvar → PUT. Upload no Gerador continua **sobrepondo** o kit naquela geração.

## Fora de escopo
Múltiplas variantes de logo (`logo_variants`), upload de fontes custom, galeria de modelos curados.
