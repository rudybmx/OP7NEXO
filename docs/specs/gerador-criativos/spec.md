# Feature Specification: Estúdio de Criativos (Gerador de Criativos — Fase 1: imagem)

**Feature Branch**: `gerador-criativos`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Estúdio de geração de criativos na tela `/marketing/demandas/design`. Usuário escolhe estilo/tom/formato, dá um briefing, e a IA gera a base visual; o OP7NEXO monta o criativo final com template, logo real do cliente, textos editáveis (headline/subtítulo/CTA/preço) e marca, exportando no tamanho final. Modelo de imagem: OpenAI `gpt-image-2`. Suporte a referência e edição aproximada. Histórico e projetos editáveis."

## Princípio central

A OpenAI **não** é o editor final. O `gpt-image-2` gera/edita apenas a **base visual** (fundo, cena, produto, ambiente, composição — sem texto, sem logo, sem marca dentro do pixel). O **OP7NEXO monta o criativo final** aplicando template/layout, logo real do cliente, headline/subtítulo/CTA/preço como **camadas editáveis**, cores/regras da marca (Brand Kit) e exportação no tamanho final do canal.

> **Fora do escopo desta Fase 1:** cobrança/créditos/custo por token (spec separado — esta feature apenas **registra** o `usage` retornado pela OpenAI), editor de vídeo (fase posterior), remoção de fundo/transparência, integração de publicação automática no Meta/WhatsApp (apenas atalhos de saída no front, sem automação).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Gerar e exportar um criativo (Priority: P1) 🎯 MVP

Um usuário do workspace abre a tela, escolhe um **estilo** pré-pronto, um **formato/canal** (ex.: feed 1:1) e um **template**, escreve um **briefing curto** e preenche **headline/CTA** em campos separados. A IA gera a **base visual**; o OP7NEXO monta o criativo (template + textos sobre a base) e o usuário **exporta** a peça no tamanho final.

**Why this priority**: É o núcleo do produto — entrega uma arte postável sem designer. Sem isso, nada mais importa.

**Independent Test**: Com estilos/templates seed e sem Brand Kit configurado, gerar a partir de um briefing e exportar um arquivo (ex.: 1080×1080) com a headline legível sobre a base — comprova o ciclo gerar→montar→exportar.

**Acceptance Scenarios**:

1. **Given** estilos e templates disponíveis e saldo/permissão de acesso ao módulo, **When** o usuário escolhe estilo+formato+template, escreve briefing e headline e clica em Gerar, **Then** o sistema retorna uma base visual em ≤ ~60s e exibe o criativo montado com a headline na área segura do template.
2. **Given** uma base gerada, **When** o usuário clica em Exportar, **Then** o sistema produz o arquivo no `export_size` do canal e `output_format` escolhido, com a tipografia idêntica ao preview.
3. **Given** o briefing pede "promoção com 50% OFF", **When** a base é gerada, **Then** o preço/oferta **não** é desenhado dentro da imagem pela IA — ele aparece apenas como camada de texto do OP7NEXO (guardrail best-effort + revisão visual).

---

### User Story 2 — Marca consistente: Brand Kit + logo real (Priority: P2)

O usuário configura (uma vez) o **Brand Kit** do workspace — logo(s), cores, fonte, tom de voz, regras visuais/proibições — e/ou sobe uma **logo**. Ao montar o criativo, a logo real entra como **camada** na área segura do template e as cores da marca guiam textos e o prompt da base.

**Why this priority**: É o que separa "imagem genérica" de "anúncio da marca do cliente". Depende do MVP existir.

**Independent Test**: Com um Brand Kit configurado (logo + cores), gerar um criativo e conferir que a logo aparece nítida na posição do template (não redesenhada pela IA) e que as cores da marca foram aplicadas aos textos.

**Acceptance Scenarios**:

1. **Given** um workspace sem Brand Kit, **When** o usuário sobe uma logo válida, **Then** o sistema valida/normaliza o arquivo e a disponibiliza para uso e reuso.
2. **Given** um Brand Kit com logo e cores, **When** o usuário gera um criativo, **Then** a logo entra como camada real (nítida, não deformada) na área segura e as cores da marca são aplicadas aos textos.
3. **Given** uma logo inválida (formato/*MIME* incorreto, oversize), **When** o upload é tentado, **Then** o sistema rejeita com mensagem amigável e não persiste o arquivo.

---

### User Story 3 — Reabrir e editar criativo sem nova geração (Priority: P2)

O usuário reabre um criativo do **histórico**, altera headline/CTA/preço, troca a logo ou muda o formato — tudo **sem** chamar a IA de novo — e re-exporta.

**Why this priority**: Reduz custo e atrito; o cliente ajusta texto/oferta sem gastar geração e sem esperar a IA.

**Independent Test**: Abrir um projeto salvo, mudar a headline e exportar; confirmar que nenhuma chamada de geração à OpenAI ocorreu e que o novo arquivo reflete o texto alterado.

**Acceptance Scenarios**:

1. **Given** um projeto salvo, **When** o usuário edita um campo de texto e re-renderiza, **Then** o criativo atualiza usando a base já existente, sem chamada à OpenAI.
2. **Given** um Brand Kit/template que mudou depois da criação, **When** o usuário reabre um projeto antigo, **Then** o layout permanece igual ao original (snapshots congelados), salvo se o usuário escolher reaplicar a versão nova.

---

### User Story 4 — Editar/variar a base visual (Priority: P3)

A partir de uma base gerada (ou de imagens de **referência** que o usuário sobe — uma ou mais), o usuário pede uma **variação** ou uma **edição aproximada** (substituir/remover/adicionar elemento; editar área via máscara).

**Why this priority**: Aumenta a qualidade e o controle, mas o MVP entrega valor sem isso.

**Independent Test**: Subir uma referência, pedir variação e obter nova base coerente; com máscara, editar uma área aproximada da base.

**Acceptance Scenarios**:

1. **Given** uma base existente, **When** o usuário pede "gerar variação", **Then** o sistema produz uma nova base relacionada e a registra como nova geração.
2. **Given** uma base e uma máscara, **When** a máscara é enviada, **Then** o backend valida (mesmo tamanho, canal alpha, formato) e edita a área aproximada; máscara inválida retorna erro amigável.
3. **Given** múltiplas referências, **When** o usuário gera com elas, **Then** todas são consideradas como direção visual (edição **aproximada**, sem promessa de recorte/preservação exatos).

---

### User Story 5 — Estilos próprios do workspace (Priority: P3)

Além dos estilos globais curados, o workspace pode **criar/editar/arquivar** seus próprios estilos (identidade visual recorrente).

**Why this priority**: Personalização avançada; opcional para o lançamento.

**Independent Test**: Criar um estilo do workspace, gerar com ele e confirmar que aparece só para o próprio workspace.

**Acceptance Scenarios**:

1. **Given** um estilo global, **When** o usuário gera com ele, **Then** funciona para qualquer workspace.
2. **Given** um estilo criado pelo workspace A, **When** o workspace B abre a lista de estilos, **Then** o estilo do A **não** aparece para o B.

---

### Edge Cases

- A IA **não** retorna nenhuma imagem parcial antes da final → a UI mostra "processando" e entrega só a final; nunca trava esperando parcial.
- A geração falha por política/limite/erro do provedor/timeout → estado de erro específico com mensagem e ação (tentar de novo, ajustar prompt, reabrir máscara).
- A base sai com ruído de texto apesar do guardrail → tratada gerando variação; o guardrail é best-effort, não garantia.
- O usuário troca de tela durante o streaming → ao voltar, recupera o estado/resultado da geração pelo ID.
- Upload com extensão mentindo o conteúdo real (ex.: `.png` que é HTML) → rejeitado por validação de *MIME* real.
- Logo com fundo branco sobre fundo claro do template → área segura/variante de logo evita ilegibilidade (responsabilidade do template/Brand Kit, não da IA).
- Formato de canal cujo tamanho final excede limites do modelo → `generation_size` é resolvido para um tamanho válido e o export final é feito na montagem, não pela IA.

## Requirements *(mandatory)*

### Functional Requirements

**Geração (base visual — IA)**
- **FR-001**: O sistema MUST gerar a base visual via OpenAI `gpt-image-2` usando a Image API direta (`images.generate`); edição via `images.edit`. **Sem** Responses API nesta fase.
- **FR-002**: O sistema MUST montar o prompt no backend incluindo estilo + briefing + direção do Brand Kit + pedido de **áreas livres** conforme o template, e MUST instruir o modelo a **não** desenhar texto/preço/CTA/telefone/endereço/slogan/textos legais/logo/nome da marca (guardrail best-effort).
- **FR-003**: O sistema MUST suportar **múltiplas** imagens de referência (`referencias_json`) e edição por **máscara**.
- **FR-004**: O sistema MUST validar e normalizar no backend toda imagem enviada (referência, logo, máscara): *MIME* real por magic bytes, tamanho/dimensão máximos, correção de orientação via EXIF, remoção de metadados; para máscara, MUST exigir mesmo tamanho da base, formato compatível e canal alpha.
- **FR-005**: O sistema MUST resolver `creative_format` para uma `generation_size` válida no `gpt-image-2` (bordas múltiplas de 16, ratio ≤ 3:1, ~0,65–8,3 MP) via função de backend; o cliente nunca envia tamanho cru ao modelo.
- **FR-006**: O sistema MUST NOT expor `input_fidelity` como configuração no front; uma opção de UX "Preservar referência", se existir, influencia apenas o prompt.
- **FR-007**: O sistema MUST NOT prometer/produzir fundo transparente nativo via `gpt-image-2`.
- **FR-008**: Se usar `partial_images`, o sistema MUST tratar imagens parciais como **preview descartável** — não salvar como resultado, não permitir download como arte final, sempre substituir pela final.
- **FR-009**: O streaming de geração MUST emitir os eventos SSE `generation.created`, `generation.partial`, `generation.completed`, `generation.failed`.
- **FR-010**: A geração MUST ter estados `pending | streaming | done | error`; em `error`, MUST registrar `error_code` ∈ {`blocked_by_policy`, `rate_limited`, `provider_error`, `invalid_prompt`, `invalid_reference`, `invalid_mask`, `timeout`}.
- **FR-011**: O sistema MUST permitir recuperar o estado/resultado de uma geração por ID (reconexão após troca de tela).
- **FR-012**: Cada geração MUST registrar para auditoria: `model`, `model_snapshot`, `prompt_final`, `params_json`, `request_id`/`provider_response_id`, `referencias_json`, `usage` (tokens), `error_code`/`error_message`.

**Montagem e exportação (OP7NEXO — sem IA)**
- **FR-013**: O sistema MUST montar o criativo final compondo template + logo (camada real) + camadas de texto (headline/subtítulo/CTA/preço) sobre a base, **sem** chamar a OpenAI.
- **FR-014**: O sistema MUST permitir editar textos/logo/posições e re-renderizar **sem** nova geração de IA.
- **FR-015**: O sistema MUST renderizar a exportação final como **job no worker** (`op7nexo-worker`), nunca no request síncrono da API; o front acompanha o estado do job.
- **FR-016**: O sistema MUST separar os conceitos `creative_format`, `generation_size`, `export_size`, `output_format` (png/jpeg/webp) e exportar no `export_size` do canal.
- **FR-017**: A exportação MUST ser visualmente consistente com o preview do front (mesma tipografia/layout).

**Dados, marca e multi-tenant**
- **FR-018**: Todas as entidades MUST ser multi-tenant por `workspace_id`.
- **FR-019**: O front MUST NOT acessar o storage (MinIO) diretamente; todo upload/listagem/URL MUST passar pela API.
- **FR-020**: A logo MUST ser tratada como ativo de marca (upload manual ou seleção de logo já salva) e aplicada como camada no render — **não** enviada ao modelo para redesenhar (salvo uso explícito como referência visual).
- **FR-021**: O sistema MUST manter um Brand Kit por workspace (logo/variantes, cores primária/secundária, fonte, tom de voz, regras visuais, proibições) usado tanto na montagem quanto para enriquecer o prompt.
- **FR-022**: O projeto do criativo MUST salvar **snapshots** de Brand Kit, logo e template para reabrir criativos antigos sem alterar o layout.
- **FR-023**: O sistema MUST manter histórico de gerações e projetos editáveis recuperáveis por ID.
- **FR-024**: Estilos MUST suportar globais (curados) e próprios do workspace; estilos de um workspace MUST NOT vazar para outro.

### Key Entities *(include if feature involves data)*

- **Brand Kit**: identidade do workspace — logo(s)/variantes, cores, fonte, tom de voz, regras visuais e proibições. Usado na montagem e no prompt.
- **Logo**: ativo de marca do workspace (arquivo no storage, variante, dimensões, *MIME*).
- **Template**: layout com áreas seguras (logo/headline/CTA/imagem), margens, proporção e variações por canal.
- **Estilo**: referência pré-pronta (prompt-template + thumb), global ou do workspace.
- **Geração**: uma chamada à OpenAI para produzir/editar a base — guarda prompt final, parâmetros, referências, máscara, base resultante, usage, status/erro e dados de auditoria.
- **Projeto de criativo**: o criativo editável final — base + template + logo + camadas de texto + cores + snapshots + arquivos exportados + status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário leigo consegue produzir e exportar um criativo do zero em **menos de 2 minutos** sem escrever prompt complexo.
- **SC-002**: Em ≥ **90%** dos criativos exportados, logo e textos críticos são **camadas do OP7NEXO** (nítidos/legíveis), não pixels desenhados pela IA.
- **SC-003**: Editar texto/logo/preço e re-exportar ocorre **sem nenhuma chamada de geração** à OpenAI em 100% dos casos.
- **SC-004**: A exportação final bate visualmente com o preview (tipografia/posições) em ≥ **95%** dos casos (revisão amostral).
- **SC-005**: Toda geração com falha apresenta um `error_code` específico e uma ação correspondente no front (0 telas de erro genérico).
- **SC-006**: Reabrir um criativo antigo após mudança de Brand Kit/template preserva o layout original (snapshots) em 100% dos casos.
- **SC-007**: Zero acesso direto do front ao storage (todo tráfego de mídia passa pela API).

## Assumptions

- OpenAI `gpt-image-2` está disponível na conta/projeto configurado em `settings.openai_api_key`/`openai_base_url` e suporta `images.generate`/`images.edit`, `partial_images` e múltiplas referências.
- O acesso à tela é liberado pelo módulo `marketing` (gate de plano existente); permissões seguem o padrão multi-tenant atual.
- O MinIO existente (bucket de criativos) é reutilizado para bases, logos, máscaras e exportações.
- O `op7nexo-worker` existente é a infraestrutura de jobs para o render/export (precisa de Chromium/Playwright na imagem).
- Billing por token/crédito é tratado em spec separado; aqui apenas registramos `usage`.
- Fontes da marca usadas no render estarão disponíveis no ambiente de render (servidor) e no front; tipografias customizadas exigem provisionamento de fontes (a detalhar no plano).
