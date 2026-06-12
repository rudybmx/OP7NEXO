# Tasks — Painel Central de IA

## Backend
- [ ] T1. Migration `070_ai_settings.py`: tabela `ai_settings` + seed 5 features + coluna `ai_insights.model_usado`.
- [ ] T2. `app/models/ai_setting.py`.
- [ ] T3. `app/core/ai_config.py` — resolver DB-first + fallback `.env` + cache TTL + `invalidate_cache`.
- [ ] T4. [P] Refatorar `ia_insights.py` (resolver + gravar `model_usado`).
- [ ] T5. [P] Refatorar `image_gen.py` (`_client_for`, `_image_model`).
- [ ] T6. [P] Refatorar `creative_vision.py`.
- [ ] T7. [P] Refatorar `copy_assist.py`.
- [ ] T8. `app/api/ai_settings.py` — GET/PUT settings + GET insights; registrar router em `main.py`.

## Frontend
- [ ] T9. `src/hooks/use-ai-settings.ts`.
- [ ] T10. `src/app/(plataforma)/admin/ia/page.tsx` (abas Modelos & Chaves, Insights).

## Verificação
- [ ] T11. Build front; `lock-deploy bash /root/deploy.sh api`.
- [ ] T12. Testes manuais (fallback, troca runtime, mascaramento, multi-tenancy).
- [ ] T13. `graphify update .`; Conventional Commit; atualizar CONTEXT.md.
