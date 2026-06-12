# Tasks — Consumo & Custo de IA (Fase 2)

## Backend
- [x] T1. Migration `071_ai_usage.py`: `ai_usage_log`, `ai_model_pricing` (seed 4 modelos), `fx_rates`.
- [x] T2. Models: `ai_usage_log.py`, `ai_model_pricing.py`, `fx_rate.py`.
- [x] T3. `app/services/ai_usage.py` — `registrar_uso` (sessão própria, best-effort) + cálculo de custo snapshot + cache de preço.
- [x] T4. `app/services/fx.py` — cotação USD-BRL diária (lazy, timeout 3s, fallback última).
- [x] T5. Instrumentação: image_gen (base+integrada), ia_insights (captura usage), criativos_design (vision + 2x copy nos endpoints).
- [x] T6. `app/api/ai_usage.py` — summary/pricing/fx; registrar router em `main.py`.

## Frontend
- [x] T7. `src/hooks/use-ai-usage.ts`.
- [x] T8. `src/components/admin/ConsumoIaPainel.tsx` + aba "Consumo & Custo" em `/admin/ia`.

## Verificação
- [ ] T9. Deploy (api+worker+front); migration 071 aplicada.
- [ ] T10. Gerar copy/imagem/analisar-modelo → conferir linhas em `ai_usage_log` com custo; `GET /ai/usage/summary` bate; `GET /ai/usage/fx` retorna cotação.
- [ ] T11. graphify + commit + push + CONTEXT.md.
