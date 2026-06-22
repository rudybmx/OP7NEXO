# Feature Specification: Criativos 2.0 — Gerador de Carrossel "Newsjacking de Negócios"

**Feature Branch**: `agent/criativos-2`

**Created**: 2026-06-23

**Status**: Draft (Fase 1)

**Input**: Nova sessão em **Estúdio AI** (`/marketing/estudio-ai/criativos-2`, oculta no menu, acesso por URL) que gera **carrosséis** editoriais na linha **Newsjacking de Negócios**: a partir de um assunto, um "diretor" de IA monta o roteiro slide-a-slide (molde, tensão, copy, direção de imagem) e o `gpt-image-2` gera cada slide com **texto/identidade integrados** (queimados pelo modelo). Reaproveita o motor de imagem, personagem e wallet já em produção.

## Princípio central — geração INTEGRADA por slide (validado em PoC)

Diferente da tela Criativo (single), Criativos 2.0 produz **N slides coerentes** contando uma história. **Validado empiricamente (PoC 2026-06-23, gpt-image-2):** o modelo **queima a tipografia newsjacking impecável** (PT correto, fonte black condensada, palavra-bomba, no estilo das referências) já em `quality:low`; mantém **personagem consistente** em multi-painel de um único prompt; e aceita **tamanhos nativos** 4:3 (2048×1536) e 9:16 (1152×2048). **Decisão travada: texto queimado pelo modelo** (sem compositor Playwright na Fase 1). Isso é consistente com o princípio já validado do `gerador-criativos` (geração integrada one-shot).

O diferencial vs. a tela atual: um **Diretor LLM newsjacking** que transforma um assunto em roteiro estruturado (molde A/B/C, curva de intensidade, copy + direção de imagem por slide, paleta semântica, 2 CTAs) **antes** de gastar imagem; um **passo de aprovação/edição do roteiro** (custo zero) antes de gerar; e orquestração de **carrossel** (N slides, regeneração por slide, preview `low`→final `high`).

> **Fora de escopo (Fase 2):** pesquisa de notícias (Origin A via Firecrawl gerenciado → 5 pautas), **modo contínuo/panorâmico**, vídeo, publicação automática. `composition_mode` já fica no schema, mas só `standard` é implementado na Fase 1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Gerar um carrossel a partir de um assunto (Priority: P1) 🎯 MVP

O usuário acessa a tela por URL, digita um **assunto** (ex.: "o fim das planilhas no marketing"), o **Diretor** devolve um roteiro de N slides (molde, tensão, copy e direção de imagem por slide). O usuário **revisa/edita** o roteiro (texto, custo zero), escolhe **nº de slides** e **formato mestre** (4:3 ou 9:16), e gera. O sistema produz cada slide via `gpt-image-2` (texto integrado) e entrega a galeria.

**Why this priority**: É o núcleo — entrega um carrossel newsjacking postável sem designer e sem queimar saldo num roteiro ruim.

**Independent Test**: Com um assunto e sem Brand Kit, gerar um carrossel de 5 slides em 9:16; conferir capa com palavra-bomba legível, miolo com 1 ideia/slide e clímax com CTA — comprova roteiro→aprovação→geração→galeria.

**Acceptance Scenarios**:
1. **Given** um assunto digitado, **When** o usuário aciona o Diretor, **Then** o sistema retorna um roteiro **validado por schema** (molde ∈ {A,B,C}, `n_slides` coerente, cada slide com copy + direção de imagem + prompt sem ambiguidade) em ≤ ~30s, **sem** gerar imagem.
2. **Given** um roteiro aprovado e saldo suficiente, **When** o usuário clica em Gerar, **Then** o sistema gera os N slides (texto integrado) e emite **progresso por-slide** (slide N/total) via SSE, debitando o saldo **só** dos slides concluídos.
3. **Given** um roteiro com copy editada pelo usuário, **When** gera, **Then** os slides respeitam a copy editada (a IA não inventa texto fora do roteiro aprovado, best-effort).

---

### User Story 2 — Aprovar/editar o roteiro antes de gastar (Priority: P1)

Entre o Diretor e a geração há um passo obrigatório de revisão: o usuário lê o roteiro, edita headline/copy/molde/intensidade por slide, e só então confirma. O pré-cheque de saldo cobre o **carrossel inteiro** (slides × formatos × quality).

**Why this priority**: Roteiro de LLM erra com frequência; sem aprovação, um carrossel ruim queima o saldo todo (sangria em franquia multi-usuário).

**Acceptance Scenarios**:
1. **Given** um roteiro gerado, **When** o usuário edita um campo de copy, **Then** a edição persiste no rascunho **sem** chamar geração de imagem.
2. **Given** saldo insuficiente para o carrossel completo, **When** o usuário tenta gerar, **Then** o sistema bloqueia **antes** de chamar a OpenAI, com mensagem do custo total vs. saldo.

---

### User Story 3 — Personagens e objetos consistentes (Priority: P2)

O usuário adiciona até **5 personagens** e **5 objetos** (foto + descrição) que devem aparecer no carrossel. A consistência cross-slide usa **multi-painel coerente** (um prompt → painéis fatiados) e/ou `images.edit` com a foto do personagem (rosto fiel — feature já em produção).

**Why this priority**: É o que liga o carrossel a uma marca/pessoa real; depende do MVP existir.

**Acceptance Scenarios**:
1. **Given** uma foto de personagem, **When** gera, **Then** o personagem aparece com identidade reconhecível ao longo dos slides (multi-painel ou `images.edit`); **sem** garantia pixel-idêntica entre chamadas independentes (limitação documentada).
2. **Given** mais slides que o limite de painéis coerentes (~8/3:1), **When** gera, **Then** o sistema divide em lotes ancorados por referência, preservando a identidade.

---

### User Story 4 — Iterar barato: regenerar slide + preview/final (Priority: P2)

O usuário regenera **só um slide** (não o carrossel) e trabalha em **preview `low`** antes do **final `high`**.

**Acceptance Scenarios**:
1. **Given** um carrossel gerado, **When** o usuário regenera o slide 3, **Then** apenas o slide 3 é gerado/debitado; os demais permanecem.
2. **Given** um carrossel em preview `low`, **When** o usuário pede o final, **Then** o sistema regenera em `high` os slides aprovados.

---

### User Story 5 — Origin B: referência de estilo (Priority: P3)

Em vez de assunto, o usuário sobe uma **imagem de referência** de estilo. Reaproveita `creative_vision.extrair_creative_spec` (Modelo Reverso) para semear o Diretor com layout/paleta/regiões.

**Acceptance Scenarios**:
1. **Given** uma imagem de referência, **When** o usuário escolhe Origin B, **Then** o Diretor produz um roteiro alinhado ao estilo extraído.

---

### Edge Cases
- Roteiro do Diretor com JSON malformado/campo faltando/molde inválido → **validação Pydantic + repair/retry**; nunca entra cru na geração.
- Slide individual falha (política/limite/timeout) → marca só aquele slide como `error` com `error_code`; carrossel continua; usuário regenera o slide.
- Usuário troca de tela durante a geração → recupera estado/galeria por `carrossel_id` (SSE reconecta).
- Texto queimado sai com erro de grafia apesar do prompt → tratado por **regenerar slide** (best-effort, não garantia).
- Nº de slides > limite de painéis coerentes → split em lotes com âncora.
- Formato mestre fora dos limites do modelo → `generation_size` resolvido para tamanho válido (×16, ratio ≤3:1, 0,65–8,3 MP).

## Requirements *(mandatory)*

### Functional Requirements

**Diretor (roteiro — LLM)**
- **FR-001**: O sistema MUST gerar o roteiro do carrossel a partir do assunto + o **system prompt newsjacking** (molde A/B/C, curva de intensidade, direção de imagem, cor semântica, 2 CTAs), armazenado em **tabela de config (DB)** e versionado (itera sem deploy). Modelo configurável (reusa `settings.openai_copy_model`; não hardcodar GPT-5.x).
- **FR-002**: O roteiro MUST ser validado por **schema Pydantic** (molde ∈ {A,B,C}, `n_slides` = pedido, cada slide com `intensidade`, `copy`, `direcao_imagem`, `image_prompt`); em falha, MUST tentar **repair/re-prompt** antes de retornar; nunca passa roteiro inválido à geração.
- **FR-003**: O Diretor MUST respeitar PT-BR impecável e **NUNCA travessão (—)** (mesmo scrub do `copy_assist`).

**Geração (carrossel — IA)**
- **FR-004**: O sistema MUST gerar cada slide via `gpt-image-2` (`images.generate`; `images.edit` quando houver personagem/objeto/referência), com **texto/identidade integrados** (queimados pelo modelo), reusando o cliente dedicado de imagem.
- **FR-005**: O sistema MUST resolver o formato mestre para `generation_size` válida (×16, ratio ≤3:1, 0,65–8,3 MP); suporta **4:3 (2048×1536)** e **9:16 (1152×2048)** nativos.
- **FR-006**: A geração de N slides MUST rodar como **job no `op7nexo-worker`** (claim atômico `FOR UPDATE SKIP LOCKED`), com **progresso por-slide** via SSE (`carrossel.slide.done` N/total) e estados `pending|running|done|error` por slide e por carrossel.
- **FR-007**: O sistema MUST suportar **regenerar um slide** isolado sem refazer o carrossel, e **preview `low` → final `high`**.
- **FR-008**: Consistência cross-slide MUST usar multi-painel coerente (um prompt → fatiar) e/ou `images.edit` com a foto do personagem; o sistema MUST documentar que identidade pixel-idêntica entre chamadas independentes não é garantida.
- **FR-009**: Multi-formato MUST ser gerado **nativamente por formato** (texto queimado não permite derivação por crop sem quebra); por padrão gera o **mestre**, demais formatos sob demanda. (⚠️ trade-off de custo vs. briefing §4.5, ver Assumptions.)
- **FR-010**: Cada geração de slide MUST registrar auditoria reusando `criativo_geracoes` (`model`, `model_snapshot`, `prompt_final`, `params_json`, `request_id`, `usage`, `error_code`/`error_message`).

**Fluxo, dados e multi-tenant**
- **FR-011**: O fluxo MUST ter passo de **aprovação/edição do roteiro** (custo zero) entre Diretor e geração.
- **FR-012**: O **pré-cheque de saldo** MUST cobrir o carrossel inteiro (slides × formatos × quality) antes de qualquer chamada paga; débito **só** nos slides concluídos (reusa `estudio_wallet`).
- **FR-013**: Todas as entidades MUST ser multi-tenant por `workspace_id` (+ `verificar_acesso_workspace`); o front MUST NOT acessar o MinIO direto.
- **FR-014**: A rota `/marketing/estudio-ai/criativos-2` MUST renderizar por URL direta; o item de menu MUST ficar **desativado/oculto** (sem `rota`) até liberação.
- **FR-015**: O sistema MUST recuperar estado/galeria de um carrossel por `carrossel_id` (reconexão pós troca de tela).

### Key Entities
- **Carrossel**: `workspace_id`, `user_id`, `origem` (manual|noticia|referencia), `tema`, `molde`, `composition_mode` (standard|panoramic), `n_slides`, `master_format`, `director_json` (roteiro), `status`, auditoria.
- **Slide**: `carrossel_id`, `slide_index`, `intensidade`, `copy_json`, `image_prompt`, `geracao_id` (→ `criativo_geracoes`), `base_image_url`, `formatos_json` (url por formato), `status`.
- **Roteiro (director_json)**: molde, tensão, payload, gatilhos, por-slide {intensidade, copy, direção de imagem, image_prompt}, paleta semântica, 2 CTAs.
- **Config do Diretor**: system prompt newsjacking versionado em DB.
- **Personagem/Objeto**: foto + descrição (reusa a feature de personagem em produção).

## Success Criteria *(mandatory)*
- **SC-001**: Um usuário leigo produz um carrossel newsjacking de N slides em **< 5 min**, sem escrever prompt de imagem.
- **SC-002**: 100% das gerações são precedidas de **aprovação de roteiro** e **pré-cheque de saldo do carrossel inteiro** (0 carrosséis gerados sem aprovação).
- **SC-003**: Regenerar um slide afeta **apenas** aquele slide (débito e arte) em 100% dos casos.
- **SC-004**: Em ≥ **90%** dos slides, a tipografia queimada está **legível e com grafia PT correta** (revisão amostral contra as referências).
- **SC-005**: Toda falha de slide tem `error_code` específico e ação no front (0 telas de erro genérico); um slide com falha não derruba o carrossel.
- **SC-006**: 0 acesso direto do front ao storage.

## Assumptions
- **Credencial de imagem dedicada** (`openai_image_api_key`/`openai_image_base_url=https://api.openai.com/v1`/`openai_image_model=gpt-image-2`) — reusa a integração existente. ✅ Validado no PoC (acesso OK, ~13–19s/imagem `low`).
- **PoC (2026-06-23)** validou: texto queimado newsjacking impecável no `low`; multi-painel coerente com personagem; tamanhos 4:3/9:16 nativos exatos; `usage` por imagem `low` ~150–250 image_tokens (custo de centavos). Billing reusa `estudio_wallet` (spec `estudio-tokens`).
- **⚠️ Trade-off de custo (briefing §4.5):** texto queimado **impede** derivar formatos por crop barato; multi-formato = geração nativa por formato. Mitigação: gerar o mestre por padrão, demais sob demanda, e preview `low`→final `high`. (Caminho "base limpa + Playwright" daria derivação barata mas não replica o look integrado das referências e foi descartado no PoC.)
- **`op7nexo-worker`** é a infra de job (precisa `deploy.sh worker` no release).
- **Multiformato + personagem já em produção** (`api/production`/`production`) — base de reuso; **não** usar os worktrees stale.
- **Migration**: numerar no merge (main em 074; colisão 075–081 do CRM-port).
