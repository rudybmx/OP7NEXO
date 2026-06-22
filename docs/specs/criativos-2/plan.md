# Plano Técnico — Criativos 2.0 (Carrossel Newsjacking)

> Lê `spec.md`. Decisões travadas via PoC (2026-06-23) + revisão. Texto **queimado pelo modelo** (sem Playwright na Fase 1). Build sobre `api/production`/`production` (multiformato + personagem já mergeados).

## Arquitetura

**Pipeline (Fase 1):**
`assunto → Diretor LLM (roteiro JSON, validado Pydantic) → APROVAÇÃO/edição do usuário → pré-cheque saldo (carrossel inteiro) → job no worker → por slide: gpt-image-2 integrado (texto queimado) → MinIO → galeria (SSE por-slide)`.

**Reuso (em produção):**
- `app/services/image_gen.py` — `_image_client`/`_image_model`, `montar_prompt_integrado`, `executar_geracao_integrada`, `resolve_generation_size`. Base de cada slide.
- `app/services/copy_assist.py` — padrão de prompt de copy (`gerar_pacote_copy`, `_sem_travessao`). O Diretor estende para multi-slide.
- `app/services/creative_vision.py` — `extrair_creative_spec` = engine da **Origin B** (referência de estilo).
- personagem (`images.edit` rosto fiel), `estudio_wallet`, `object_storage` (MinIO), `app/core/ai_config.py` (DB-first), `app/core/deps.py` (`verificar_acesso_workspace`).
- Modelo `criativo_geracoes` (1 linha por base de slide, auditoria/usage).

**Novo (API, em `/root/wt/api-criativos-2`):**
- `app/models/criativo/carrossel.py` — `CriativoCarrossel`, `CriativoCarrosselSlide`.
- `app/services/carrossel_director.py` — assunto → roteiro; schema Pydantic + repair; lê system prompt da tabela de config.
- `app/services/carrossel_gen.py` — orquestração: monta prompt integrado por slide (a partir do roteiro), chama `image_gen`, aplica consistência (multi-painel/`images.edit`), grava slides; estratégia de fatiar multi-painel.
- `app/api/criativos_carrossel.py` — router `/design/carrossel/*`.
- `app/worker.py` — registrar o job de carrossel (poll + claim atômico).
- Tabela de config do system prompt do Diretor (versionada).
- `alembic/versions/NNN_criativos_2_carrossel.py`.

## Modelo de dados
```
criativo_carrosseis(
  id uuid pk, workspace_id uuid fk, user_id uuid fk,
  origem varchar(20) check(manual|noticia|referencia), tema text,
  molde varchar(2) check(A|B|C), composition_mode varchar(12) default 'standard',
  n_slides int, master_format varchar(20), director_json jsonb,
  status varchar(20) default 'pending', error_code varchar(40), error_message text,
  ativo bool default true, criado_em timestamptz, atualizado_em timestamptz)

criativo_carrossel_slides(
  id uuid pk, carrossel_id uuid fk, slide_index int,
  intensidade varchar(12), copy_json jsonb, image_prompt text,
  geracao_id uuid fk(criativo_geracoes) null, base_image_url text,
  formatos_json jsonb, status varchar(20) default 'pending',
  criado_em timestamptz, atualizado_em timestamptz,
  unique(carrossel_id, slide_index))

criativo_config(  -- ou reusar tabela de config existente
  chave varchar pk, valor text, versao int, atualizado_em timestamptz)
  -- chave='diretor_newsjacking_system_prompt'
```

## Endpoints (`/design/carrossel`)
- `POST /diretor` `{workspace_id, origem, tema|referencia_base64, n_slides, master_format}` → `{carrossel_id, director_json}` (valida Pydantic; **não** gera imagem). Custo: tokens de texto (registra `usage`).
- `PUT /{id}/roteiro` `{director_json}` → persiste edição do usuário (custo zero).
- `POST /{id}/gerar` `{quality}` → pré-cheque saldo do carrossel; enfileira job; **SSE**: `carrossel.created`, `carrossel.slide.done {index,total,url}`, `carrossel.completed`, `carrossel.failed`.
- `POST /{id}/slides/{index}/regenerar` `{quality}` → gera só aquele slide.
- `GET /{id}` → estado + slides + urls (reconexão).

Todos: `verificar_acesso_workspace`. Padrão espelha `criativos_design.py`.

## Pontos-chave de implementação
- **Diretor:** `json_object` no modelo de copy; saída = schema Pydantic `RoteiroCarrossel{molde, tensao, payload, gatilhos[], paleta{tensao,resolucao,pivo}, slides[Slide{index,intensidade,copy{...},direcao_imagem,image_prompt}], ctas{engajamento,conversao}}`. Em `ValidationError` → 1 retry com erro no prompt; se falhar, 422 acionável.
- **Prompt por slide:** reaproveita `montar_prompt_integrado` alimentado pelo `image_prompt` + `copy` do roteiro (texto a ser queimado) + paleta semântica + personagem/objeto. Guardrail: o modelo PODE desenhar o texto do roteiro (queimado), mas não inventar copy fora dele.
- **Consistência:** default = `images.edit` com foto(s) de personagem por slide (rosto fiel, já provado). Opção multi-painel: 1 prompt com `Painel 1..k` → fatiar (Pillow) em k slides; lotes de k≤3 em 9:16 (limite 3:1), ancorando o personagem entre lotes. Decidir k por `master_format`.
- **Multi-formato:** gera o `master_format` por padrão; outros formatos = nova geração nativa sob demanda (texto queimado não deriva por crop). `formatos_json` guarda url por formato.
- **Token model:** custo do carrossel = Σ slides × formatos × fator(quality). Pré-cheque cobre o total; débito por slide concluído. Reusa `custo_tokens`/`estudio_wallet`.
- **Worker:** job `carrossel_gen` com claim atômico (padrão `sync_jobs`); processa slides sequencialmente, publica progresso (Redis/SSE).

## Front (`/root/wt/front-criativos-2`)
- `src/app/(plataforma)/marketing/estudio-ai/criativos-2/page.tsx` → `<Criativos2/>`.
- Componentes: `OrigemPicker` (assunto | referência) · `RoteiroReview` (editar copy/molde/intensidade por slide) · `PersonagensObjetos` (reusa uploader de personagem) · `ConfigCarrossel` (nº slides, modo, formato mestre) · `GaleriaCarrossel` (slide×formato, download, **regenerar slide**, preview low→high).
- `contexto-layout.tsx`: `{ nome: "Criativos 2.0" }` sem `rota`.
- Estado: `usePersistedState` (abas/visualização) + `useRascunho` (roteiro/inputs). Nielsen #1/#3/#5/#6/#9.
- Chamadas via `/api/proxy/design/carrossel/*`; SSE para progresso.

## Verificação
- API curl (ws Doutor Feridas): `/diretor` → roteiro válido; `/{id}/gerar` → SSE por-slide → MinIO com slides; `/slides/{i}/regenerar` afeta 1; saldo insuficiente bloqueia antes de pagar.
- Front por URL (menu oculto); fluxo com aprovação; F5 preserva rascunho; download por formato.
- QA visual contra as 10 referências. Gates: typecheck front; boot API + `alembic upgrade head`.

## Heurísticas de Nielsen (obrigatório)
#1 progresso por-slide visível · #3 regenerar/descartar com confirmação · #5 rascunho de roteiro nunca se perde · #6 estado sobrevive a F5 · #9 erro de slide vira ação (`getErrorMessage`).
