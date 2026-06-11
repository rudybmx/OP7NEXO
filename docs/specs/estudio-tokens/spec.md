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

## Admin — controle global (fase 3a, 2026-06-11, FEITO)

A página **Administração › Empresas › Gestão de Tokens** (`/admin/tokens`) virou 2 abas: **Conexões** (Meta/Google, o que já existia) e **Token Estúdio** (`TokenEstudioAdmin.tsx`): resumo (tokens em circulação, clientes com saldo, recargas pendentes), confirmar recargas pendentes e **liberar/creditar tokens** para qualquer cliente. Endpoints (todos `platform_admin`):
```
GET  /estudio/admin/saldos              → [ { workspace_id, nome, saldo_tokens } ]  (todos os workspaces ativos)
GET  /estudio/admin/recargas-pendentes  → [ { id, workspace_id, nome, tokens, valor_reais, criado_em } ]
# reusa POST /estudio/creditar (liberar) e POST /estudio/recarga/{id}/confirmar
```

## Gateway Stripe (3b — 2026-06-11, FEITO; TEST mode)

Pagamento automático via **Stripe Checkout hospedado** (R$1/token). Crédito **idempotente por `session_id`** (nunca credita 2x) por duas vias: confirm-on-return + webhook. A idempotência depende de `estudio_wallet.creditar(..., referencia=session_id)` **gravar** o `referencia` na transação — é o que o pré-check `_ja_creditado` (`WHERE referencia==session_id`) e o índice único parcial `uq_estudio_tx_referencia_credito` (migration 068) consultam.
```
POST /estudio/checkout            { workspace_id, tokens }   → { url }  (Checkout Session; metadata={workspace_id,tokens})
POST /estudio/checkout/confirmar  { workspace_id, session_id } → { pago, saldo_tokens }  (no retorno; retrieve+credita se paid)
POST /estudio/stripe/webhook      (Stripe assina) → credita em checkout.session.completed OU async_payment_succeeded (verifica assinatura com stripe_webhook_secret)
```
- **Cartão vs PIX (assíncrono):** cartão paga na hora (`completed` já vem `paid`). **PIX** é assíncrono — o `completed` chega `payment_status='unpaid'` (no-op) e o crédito vem no **`checkout.session.async_payment_succeeded`** (`paid`). O handler trata os dois (`async_payment_failed` só loga); `_creditar_sessao` credita só se `payment_status=='paid'` (idempotente). PIX aparece sozinho no Checkout quando ativado no Dashboard (automatic payment methods + BRL); o webhook `we_...` está inscrito nos 3 eventos.
- **Segredos** só no `.env` (gitignored): `stripe_secret_key`, `stripe_publishable_key`, `stripe_webhook_secret` (+ `frontend_url`). `stripe` no requirements.
- **Front (Carregar Tokens):** botão primário **"Pagar com cartão/PIX"** → `/checkout` → redireciona; no retorno (`?session_id=`) chama `/checkout/confirmar` e credita. Recarga manual continua como secundária.
- **Estado (2026-06-11):** conta nova `51ThCSc` (outro CNPJ); webhook `we_1ThD2B` criado via API, inscrito em `completed`+`async_payment_succeeded`+`async_payment_failed`, `whsec_` no `.env`. Cartão validado E2E (confirm-on-return + webhook creditam, sem duplicar). Código de PIX pronto.
- **⚠️ Pendências:** (1) **ativar PIX** no Dashboard (Settings→Payment methods→Pix) p/ ele aparecer no Checkout — sessão-espelho hoje mostra só `['card']`; (2) testar PIX de ponta a ponta (sandbox simula sucesso → `async_payment_succeeded` credita); (3) **rotacionar** as chaves test (expostas no chat) + revogar a conta antiga `51ThAyn`; migrar p/ live em produção.

## Roadmap (fases seguintes)
- Tela de **Vídeos**; relatórios de faturamento.

## Fora de escopo (fase 1)
Gateway automático; débito por geração; relatórios de faturamento.
