# Spec — F5: Galeria de Modelos Curados + Meus Modelos

**Feature**: aba "Modelos" no Estúdio de Criativos (`/marketing/demandas/design`)
**Criado**: 2026-06-11 · **Status**: F5.1 implementado e validado

## Contexto e princípio

Substitui o antigo seletor "Estilo" (removido por ter efeito fraco no prompt) por uma **aba "Modelos"** com duas fontes:
- **Curados** (globais, `workspace_id NULL`, `fonte='curado'`): trazem a **estrutura lógica vencedora** (`estrutura_json`) + um **"porquê" da IA** (`ai_porque`). Botão **"Usar estrutura"** pré-preenche o gerador (objetivo/densidade/headline/subtítulo/CTA/bullets) — **lógica, não o texto/imagem exato** de concorrente (seguro p/ direito autoral).
- **Meus modelos** (`workspace_id` preenchido, `fonte='manual'`): o usuário **carrega e salva** uma referência sua pra reusar. Botão **"Usar modelo"** joga a imagem como Modelo de exemplo no Gerar (estilo/composição/réplica/Modelo Reverso).

**Reality-check (orienta o futuro):** a **API oficial da Meta Ad Library não é fonte viável** — acesso travado por verificação de identidade (semanas, código pelos Correios) e, em 2026, **escopo limitado para anúncios comerciais no Brasil**. O caminho compliant/prático é **raspar a Ad Library pública** e cachear no nosso banco (F5.2). Não usar a API oficial como primária.

## Comportamento (F5.1)

1. A tela Design tem 2 abas: **Gerar** (gerador atual) e **Modelos**. As duas ficam montadas (estado do gerador preservado ao alternar).
2. **Modelos** lista Curados (filtráveis por objetivo) + Meus modelos; cards mostram thumb (ou placeholder), badge "Vencedor" (curados), nicho/nível e o "porquê" da IA.
3. **Usar estrutura** (curado) → aplica `estrutura_json` no gerador e volta pra aba Gerar.
4. **Carregar modelo** → salva a imagem como Meu modelo (`POST`), aparece em "Meus modelos".
5. **Usar modelo** (meu) → carrega a imagem como referência no Gerar.
6. **Excluir** (meu) → soft delete. Curados são read-only.

## Requisitos

- **FR-1**: `criativo_modelos` é multi-tenant; `workspace_id NULL` = curado global, preenchido = do workspace. Soft delete (`ativo`).
- **FR-2**: `GET /design/modelos` devolve curados + do workspace, com filtros `nicho`/`objetivo`/`creative_format`; curados primeiro.
- **FR-3**: `POST /design/modelos` valida/normaliza a imagem (magic bytes), salva em `workspaces/{ws}/criativos/modelos/{id}.png` (servido pela API) e cria a linha `fonte='manual'`.
- **FR-4**: `DELETE /design/modelos/{id}` só do próprio workspace (curado global → 403; outro workspace → 403).
- **FR-5**: `estrutura_json` casa com os campos do gerador (`objetivo` igual aos ids do front; `densidade` simples|rico; headline/subheadline/cta/bullets[]). "Usar estrutura" nunca copia imagem do concorrente.
- **FR-6**: o front nunca acessa o MinIO direto; imagem de Meu modelo é lida via proxy (evita CORS) para virar referência.

## Contracts — `/design/modelos`

```
GET /design/modelos?workspace_id=&nicho?=&objetivo?=&creative_format?=
→ 200 [{ id, escopo: "curado"|"meu", nome, nicho, objetivo, nivel_consciencia,
         gancho, creative_format, badge, thumb_url, ai_porque, estrutura }]

POST /design/modelos        { workspace_id, nome, image_base64, nicho?, objetivo?, creative_format? }
→ 201 { id, escopo:"meu", nome, thumb_url, ... }    (imagem inválida → 422)

DELETE /design/modelos/{id}?workspace_id=
→ 200 { ok: true }    (curado → 403; outro workspace → 403; inexistente → 404)
```

## Refinamentos do Estúdio (2026-06-11)

- **Esquemas de cores salvos** (`criativo_paletas`, migration 066, workspace NOT NULL, máx. 10): salvar/carregar a regra 60/30/10. Ícones Salvar/Carregar no cabeçalho "Cores da marca"; dropdown com as 3 cores por linha + excluir.
  - `GET /design/paletas?workspace_id=` → até 10 `{id,cor_60,cor_30,cor_10}`.
  - `POST /design/paletas` {workspace_id,cor_60/30/10} → 201; **409/400 ao atingir 10** ("Exclua um para salvar").
  - `DELETE /design/paletas/{id}?workspace_id=` → 200 (outro workspace → 403).
- **Histórico** (`GET /design/historico?workspace_id=&desde?=`): gerações `done` do workspace `{id,imagem_url,creative_format,criado_em,estrutura}` (estrutura extraída de `params_json`). 3ª aba "Histórico" (cards 9:16 `object-contain` + "Usar estrutura"/"Usar imagem"); box lateral "Gerados hoje" usa `?desde=<hoje>`.
- **UI:** upload "Modelo de exemplo & Marca" 280px (vê o modelo inteiro); botão "Limpar campos" (reset total); cards de modelo/histórico em box **9:16 object-contain** (imagem inteira, sem corte).
- **Multi-tenant (garantia):** `paletas`/`historico`/`modelos` exigem `workspace_id` + `verificar_acesso_workspace` + filtram queries por `workspace_id`. Validado com 2 workspaces: dado de A não aparece em B; DELETE cross-workspace → 403.

## Roadmap (desenhado, adiado)

- **F5.2 — Ingestão Ad Library:** raspar a biblioteca **pública** (Apify Facebook Ads Scraper ~$3,40/1k, ou Firecrawl/ScrapegraphAI) por nicho/`page_ids` → filtrar por **longevidade (30+ dias)** + escala → IA gera o "Modelo Mestre" → entra como `fonte='ad_library'`, pendente de aprovação. Campos já previstos: `ad_snapshot_url`, `longevidade_dias`, `fonte`.
- **F5.3 — Mira por cliente:** dropdown das contas de anúncio do workspace p/ achar concorrentes do nicho.
- **Extrair estrutura de Meu modelo:** botão que roda Modelo Reverso (`/design/analisar-modelo`) sobre um modelo salvo e grava `estrutura_json`.

## Fora de escopo

Billing/cobrança por token (1 img=1 token=R$1, alta=2, reverso=3 — tela de custos é outra fase); ingestão Ad Library; extração automática de estrutura no upload.
