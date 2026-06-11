# Spec — Estúdio AI: carteira de tokens (Carregar Tokens)

**Criado:** 2026-06-11 · **Status:** Fase 1 implementada (backend validado por curl)

## Contexto e princípio

Início da cobrança por token do Estúdio AI. **1 token = R$ 1,00**; consumo por criativo: medium = 1, alta = 2, Modelo Reverso = 3. **Saldo POR workspace** (cobra o cliente/franquia). Carteira nova, nome distinto de `meta_tokens` (que é OAuth da Meta).

**Fase 1 (esta):** carteira (saldo + extrato) + tela **Carregar Tokens**; recarga **manual/admin** (cliente solicita → fica pendente → platform_admin confirma após o pagamento). **Sem** gateway automático e **sem** débito por geração ainda.

## Comportamento

- Sidebar: grupo **Estúdio AI** sob Marketing (abaixo de Campanhas), itens Criativos/Vídeos (só texto, sem página) + **Carregar Tokens** (`/marketing/estudio-ai/carregar-tokens`).
- Tela: **saldo atual** + escolher recarga (pacotes 50/100/250/500 ou valor livre) → **Carregar** cria uma recarga **pendente** + instrução de pagamento (PIX/manual). **Histórico** de transações. **Admin (platform_admin):** seção "Recargas pendentes" com **Confirmar** (credita o saldo).

## Requisitos
- **FR-1**: `estudio_token_saldo` (1 linha por workspace, `workspace_id` UNIQUE). `estudio_token_transacoes` (ledger: crédito/débito, status confirmado/pendente/cancelado).
- **FR-2**: recarga criada por usuário com acesso ao workspace fica **pendente** (não credita). Só `platform_admin` confirma → credita atômico.
- **FR-3**: multi-tenant — todas as rotas exigem `workspace_id` + `verificar_acesso_workspace` + filtram por workspace. Saldo/transações de um workspace nunca aparecem em outro.
- **FR-4**: 1 token = R$ 1,00 (`valor_reais = tokens × 1`).

## Contracts — `/estudio/*`
```
GET  /estudio/saldo?workspace_id=                 → { workspace_id, saldo_tokens }
GET  /estudio/transacoes?workspace_id=            → [ { id, tipo, tokens, valor_reais, motivo, status, criado_em } ]
POST /estudio/recarga      { workspace_id, tokens }      → 201 { transacao(pendente), instrucao_pagamento }
POST /estudio/recarga/{id}/confirmar  (platform_admin)  → { transacao(confirmado), saldo_tokens }
POST /estudio/creditar     { workspace_id, tokens, motivo? } (platform_admin) → { transacao, saldo_tokens }
```

## Débito por geração (fase 2 — 2026-06-11, FEITO)

- **Custo (`custo_tokens` em `criativos_design.py`):** `/design/gerar` debita **3** se `reference_usage=='modelo_reverso'` (geração reverso, flat); senão **2** se `quality=='high'`; senão **1**. Cada formato selecionado = uma geração = um débito.
- **Grátis:** `/design/analisar-modelo` (análise do reverso), `/design/gerar-copy`, `/design/melhorar-copy`.
- **Regra:** pré-checa `estudio_wallet.tem_saldo` ANTES de chamar a OpenAI → se insuficiente, `generation.failed` com `error_code='saldo_insuficiente'` (não gera). **Débito só no sucesso** (`status=='done'`) via `estudio_wallet.debitar(..., referencia=generation_id)`; falha não cobra. `generation.completed` traz `custo_tokens` + `saldo_tokens`.
- Lógica de saldo centralizada em `app/services/estudio_wallet.py` (saldo/tem_saldo/registrar/confirmar/creditar/debitar) — usada pelo router `/estudio` e pelo `/design/gerar`.
- Front: tela Gerar mostra saldo + custo do criativo; botão bloqueia + link "Carregar tokens" sem saldo; modal do Reverso reflete "análise grátis, geração 3 tokens".

## Roadmap (fases seguintes)
- **Gateway de pagamento automático** (PIX/cartão via Mercado Pago/Asaas/Stripe + webhook que confirma a recarga). Chaves só em `.env`; o agente não insere credenciais nem executa transações (UI/integração; o cliente paga).
- Tela de **Vídeos**.

## Fora de escopo (fase 1)
Gateway automático; débito por geração; relatórios de faturamento.
