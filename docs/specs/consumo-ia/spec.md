# Consumo & Custo de IA (Fase 2 do Painel de IA)

## Objective

Registrar **cada chamada de IA** do sistema (modelo, tokens, imagens, custo, feature, workspace) e mostrar num painel quanto cada modelo/feature/workspace está consumindo — em tokens e em **$ (USD e BRL)**. Fechar a lacuna deixada na Fase 1 ("rastreamento de custo"), permitindo ao admin ver gasto por franquia e por feature e ajustar modelos com base em custo real.

Sucesso = toda chamada de IA gera um registro com custo calculado; o painel mostra totais e quebras (por workspace, feature, modelo, período) em USD e BRL.

## Current State

- Fase 1 entregue: config de modelo/chave por feature mutável em runtime (`ai_settings`, resolver `app/core/ai_config.py`), painel `/admin/ia`, análises em `/admin/analises-ia`.
- O dado de uso (`resp.usage`: prompt/completion/total tokens) **já existe** nas respostas e é capturado em `copy_assist`, `creative_vision`, `image_gen` (em `ger.usage`); **`ia_insights` descarta** o usage hoje.
- Não há ledger central de chamadas de IA nem cálculo de custo. A carteira `estudio_token_*` é crédito de design vendido ao cliente — **não** é custo de IA.

## Scope

- In scope:
  - Tabela `ai_usage_log` (1 linha por chamada de IA) + helper `registrar_uso(...)` chamado em cada call site (insights/copy/vision/image, base e integrada).
  - Tabela `ai_model_pricing` (preços por modelo, editável no painel): texto (input/output por 1M tokens) e imagem (preço por qualidade). Custo **snapshot** no log (não recalcula se preço mudar).
  - Câmbio USD→BRL diário: tabela `fx_rates` + busca lazy numa API pública sem chave (cotação do dia), cacheada.
  - Endpoints (`platform_admin`): resumo agregado de consumo (por período, com quebra por feature/modelo/workspace) + CRUD de preços + cotação do dia.
  - Front: aba **Consumo & Custo** no `/admin/ia` (KPIs + quebras + filtro de período) e editor de preços.
- Out of scope:
  - Limites/orçamento por workspace com bloqueio (alertas podem vir depois).
  - Câmbio em tempo real / múltiplas moedas além de BRL.
  - Reconciliação com a fatura real da OpenAI.

## Behavior Rules

- `registrar_uso` **nunca** quebra a chamada de IA: falha de log é engolida e logada (best-effort).
- Custo é **calculado e congelado** no momento do registro (`cost_usd` snapshot), usando o preço vigente do modelo. Mudar preço depois não altera histórico.
- Texto: `cost = prompt/1e6 * input_usd_1m + completion/1e6 * output_usd_1m`. Imagem: `cost = image_count * preço(qualidade)`.
- Modelo sem preço cadastrado → registra com `cost_usd = NULL` e `pricing_source = 'sem_preco'` (não inventa custo); o painel sinaliza.
- BRL é **derivado na exibição**: `cost_brl = cost_usd * cotação_do_dia`. A cotação é buscada 1x/dia e cacheada em `fx_rates`; se a API falhar, usa a última cotação conhecida.
- Tudo restrito a `platform_admin` (config é global, igual Fase 1). Quebra por workspace é dimensão de leitura, não controle de acesso.
- `workspace_id` é gravado quando a chamada tem contexto de workspace; chamadas sem workspace ficam `NULL` (agrupam como "Plataforma").

## Inputs and Outputs

- Inputs (por chamada, interno): feature, workspace_id, model, provider, kind (text|image), usage (tokens) ou (image_count, quality, size), request_id, status.
- Outputs:
  - `GET /ai/usage/summary?inicio=&fim=&group_by=feature|model|workspace` → totais (chamadas, tokens, custo USD/BRL) + lista da quebra pedida + cotação usada.
  - `GET /ai/usage/pricing` / `PUT /ai/usage/pricing/{model}` → tabela de preços (editável).
  - `GET /ai/usage/fx` → cotação USD-BRL do dia (data, valor, fonte).

## Error Cases

- API de câmbio fora do ar → usa última cotação de `fx_rates`; se nunca houve, BRL fica indisponível (mostra só USD).
- Resposta da IA sem `usage` → registra tokens 0 e `cost_usd = NULL` (não estima).
- Modelo sem linha de preço → `cost_usd = NULL`, sinalizado no painel.
- Não-`platform_admin` nos endpoints → 403.

## Acceptance Criteria

- [ ] Cada chamada de insights/copy/vision/image gera 1 linha em `ai_usage_log` com tokens e custo (quando há preço).
- [ ] Falha no log NÃO quebra a geração/insight/copy.
- [ ] `GET /ai/usage/summary` retorna totais e quebra por feature/modelo/workspace no período, em USD e BRL.
- [ ] Editar preço de um modelo afeta só chamadas futuras (histórico imutável).
- [ ] Cotação USD-BRL é buscada 1x/dia e cacheada; falha da API não derruba o painel.
- [ ] Tudo só acessível a `platform_admin`.

## Test Plan

- Manual: rodar gerar-copy/gerar-base/analisar-modelo e conferir linhas novas em `ai_usage_log` com custo.
- Manual: `GET /ai/usage/summary` confere totais e quebras; bate (aprox.) com soma das linhas.
- Manual: alterar preço via `PUT /ai/usage/pricing` e confirmar que só novas chamadas usam o novo preço.
- Manual: `GET /ai/usage/fx` retorna cotação do dia; simular falha → usa última conhecida.

## Open Questions

- None
