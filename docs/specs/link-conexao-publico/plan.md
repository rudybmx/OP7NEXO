# Plano técnico — Link público de conexão

## Backend (op7nexo-api)
- **Model + migration:** `app/models/canal_connect_token.py` + `alembic/versions/090_canal_connect_tokens.py`
  (token TEXT PK, canal_id FK CASCADE, workspace_id, status active|consumed, expires_at, created_at,
  consumed_at). Índice parcial único `WHERE status='active'` → 1 token ativo por canal.
- **Serviços:** `app/services/rate_limit.py` (Redis INCR+EXPIRE; fail-closed nas ações caras),
  `app/services/connect_token.py` (gerar/reusar atômico, buscar válido, consumir).
- **Núcleo reusado (`app/api/canais.py`):** extraídos `_conectar_evolution(c,db)` e
  `_status_evolution_core(c,db,*,publico)` dos endpoints admin (admin chama com `publico=False`
  → idêntico). `publico=True` aplica a regra de ouro. `_status_waha` já era conforme. Pareamento:
  `_parear_evolution(c,db,telefone)` via `conectar_instancia(phone=...)`. Endpoint admin
  `POST /canais/{id}/link-conexao`.
- **Router público:** `app/api/public_conectar.py` (registrado em `app/main.py`).
- **Consumo assíncrono:** `whatsapp_crm_persistence.py::process_evolution_connection_event`
  consome o token ao `state=='connected'` (fecha o furo de corrida do poll).

## Frontend (op7nexo-front)
- Página `src/app/conectar/[token]/page.tsx` (server, `await params`) + componente client
  `src/components/conectar/conectar-cliente.tsx`. `/conectar` em `PUBLIC_PATHS` (`src/middleware.ts`).
- Botão "Link" na tela `administracao/canais-omnichannel/page.tsx` (evolution/waha) → copia o link.

## Anti-hijack — 3 camadas
1. Síncrono: `/iniciar` e `/status` consomem o token ao detectar `connected`.
2. Assíncrono: webhook `process_evolution_connection_event` consome ao `connected`.
3. Guard por estado real: `_conectar_*` devolve `connected` sem re-armar se já aberto;
   token `consumed` nunca re-arma.

## Validação
- `import app.main` OK; `alembic heads` = `090` único; DDL offline válido; índice parcial
  testado em DB scratch (rejeita 2º ativo, permite após consumo). Front typecheck limpo.
