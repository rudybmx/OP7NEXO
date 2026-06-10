# Feature Specification: Modelo Reverso (prompt-reverso visão→JSON)

**Feature Branch**: `gerador-criativos-reverso`
**Created**: 2026-06-10
**Status**: Draft
**Relacionado**: `docs/specs/gerador-criativos/` (estúdio integrado — F1/F2)

**Input**: "Quero subir uma referência (modelo de exemplo), o sistema extrair um JSON completo com tudo da imagem (layout, posições, paleta, textos, áreas de logo/CTA), me mostrar os pontos importantes pra editar (textos, cores, marca), e gerar um criativo fiel — compondo a logo real na região certa. Novo modo 'Modelo Reverso' ao lado de estilo/composição/réplica."

## Princípio

Hoje a referência vai **direto** ao `gpt-image-2` como imagem ("inspiração solta") — sem entender o que tem nela. O **Modelo Reverso** adiciona uma etapa de **visão**: um modelo multimodal (`gpt-4.1`) lê a referência e produz um **`creative_spec` JSON estruturado**. Esse JSON vira (a) **dado editável** que o front expõe como "pontos importantes", e (b) base de um **prompt detalhado** para gerar. A **região da logo** do JSON permite compor a logo real exatamente no lugar (resolve o problema de logo que some/torta). Validado empiricamente: a extração com `gpt-4.1` é completa e precisa.

> **Fora do escopo:** billing (já registra `usage`), vídeo. Mantém os modos existentes (`style`/`composition`/`style_and_composition`/`replica`) intactos — Modelo Reverso é um modo a mais.

## User Scenarios

### US1 — Analisar a referência e ver os pontos editáveis (P1) 🎯
Usuário sobe um modelo de exemplo, escolhe **"Modelo Reverso"** → o sistema analisa e mostra um **painel com os pontos importantes** extraídos (headline, subtítulo, bullets, CTA, footer, paleta, área/posição da logo, sujeitos, densidade), já preenchidos com o que havia na referência.

**Acceptance:**
1. **Given** uma referência, **When** seleciona Modelo Reverso, **Then** em ≤ ~15s aparece o `creative_spec` mapeado em campos editáveis preenchidos.
2. **Given** a análise falhou (visão), **Then** erro amigável com `error_code` e o fluxo cai para o modo "estilo+composição".

### US2 — Editar os pontos e gerar fiel (P1)
Usuário troca textos/cores/marca nos campos extraídos e gera. O resultado segue o layout/composição da referência com o conteúdo novo; a **logo real** é composta na região indicada pelo JSON.

**Acceptance:**
1. **Given** o spec editado, **When** gera, **Then** o criativo mantém composição/posições da referência trocando o conteúdo editado.
2. **Given** há logo enviada e o JSON tem `regions.logo`, **Then** a logo real é composta naquela região (fidelidade garantida), não só "tentada" pelo modelo.
3. **Given** o seletor **densidade de ajuste** = "fiel", **Then** desvia minimamente do spec; = "livre", **Then** o modelo tem mais liberdade criativa.

### US3 — Galeria de modelos curados (P2)
O seletor "Estilo" (palavra fraca) é substituído por uma **galeria de modelos curados** (imagens de referência reais que convertem). Escolher um modelo curado = usar aquela imagem como referência (e pode acoplar ao Modelo Reverso).

**Acceptance:**
1. **Given** a galeria, **When** escolhe um modelo curado, **Then** ele vira a referência da geração.

### Edge Cases
- Referência sem logo → `regions.logo.present=false`; não compõe logo.
- JSON inválido/incompleto do modelo de visão → validar/normalizar; campos faltantes ficam vazios e editáveis.
- Logo composta cobrindo conteúdo → respeitar `safe area` da região; se a região for inválida, cair para "modelo tenta a logo".

## Requirements

- **FR-001**: `POST /design/analisar-modelo` recebe `referencia_base64` (+ workspace) e retorna um `creative_spec` JSON. Usa `gpt-4.1` (`settings.openai_vision_model`) via chat.completions com `response_format=json_object` e a imagem em `image_url` base64.
- **FR-002**: O `creative_spec` (schema CIRÚRGICO) MUST conter: `formato`, `descricao` (prosa rica = espinha da geração), `objetivo_do_criativo`, `estilo`, `tom`, `estilo_visual`, `paleta_de_cores[]`, `personagem`, `composicao_visual`, `conteudo_textual{headline,subheadline,bullets[],cta,footer}`, `logo{present,posicao,tamanho,observacao}`. Backend **valida/normaliza** (campos faltantes → default; aceita schema legado `regions`/`palette`). Densidade de ajuste: **`fiel`|`livre`** (2). Painel front expõe todos editáveis + paleta clicável + posição da logo. Modo é premium (avisar ~3 créditos).
- **FR-003**: A geração em modo Modelo Reverso MUST montar o prompt a partir do `creative_spec` editado (composição/posições/paleta + textos novos), com a referência ainda passada como imagem ao `images.edit`.
- **FR-004**: Quando há logo e `regions.logo.present`, o sistema MUST **compor a logo real na região do JSON** (posição/tamanho/área segura) via `criativo_render` — em vez do overlay cru antigo.
- **FR-005**: Seletor **densidade de ajuste** (`fiel`|`equilibrado`|`livre`) MUST modular quanta liberdade o prompt dá sobre o spec.
- **FR-006**: Novo `reference_usage = "modelo_reverso"` (ou flag equivalente) MUST coexistir com os modos atuais sem quebrá-los.
- **FR-007**: O `creative_spec` (extraído e editado) MUST ser persistido em `criativo_geracoes.params_json` para auditoria/reuso.
- **FR-008**: "Estilo" vira galeria de **modelos curados** (imagens de referência globais/curadas) — reusa `criativo_estilos`/`criativo_templates` com `thumb_url`/imagem.
- **FR-009**: Multi-tenant por `workspace_id`; mídia via API; storage sob `workspaces/`.

## Success Criteria
- **SC-001**: Em ≥ 80% das referências testadas, o painel vem com headline/CTA/paleta/área-de-logo corretos extraídos.
- **SC-002**: Com logo + `regions.logo`, a logo real aparece nítida na posição certa em 100% dos casos (composição determinística).
- **SC-003**: Modelo Reverso fica mais fiel à referência que "estilo+composição" em comparação visual amostral.
- **SC-004**: Editar textos/cores e regerar não exige re-análise (o spec já está em mãos).

## Assumptions
- `gpt-4.1` (visão) disponível na mesma chave dedicada (`openai_image_api_key`/`base_url`). Validado.
- Custo da análise (visão) é baixo (1 imagem + ~1.5k tokens) — registrar `usage` para a doc de billing.
- Composição de logo reusa `app/services/criativo_render.py` (Pillow) com coordenadas da região.
