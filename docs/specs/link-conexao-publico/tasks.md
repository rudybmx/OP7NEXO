# Tarefas — Link público de conexão

- [x] T1 Model + migration `canal_connect_tokens` (090, índice parcial único)
- [x] T2 Serviço `rate_limit.py` (Redis, fail-closed nas ações caras) [P]
- [x] T3 Serviço `connect_token.py` (gerar/reusar atômico, validar, consumir) [P]
- [x] T4 Refactor núcleo Evolution `_conectar_evolution` / `_status_evolution_core(publico)`
- [x] T5 Endpoint admin `POST /canais/{id}/link-conexao` + `_parear_evolution`
- [x] T6 Router público `public_conectar.py` + registro em `main.py`
- [x] T7 Consumo assíncrono do token em `process_evolution_connection_event`
- [x] T8 Front: página `/conectar/[token]` + `/conectar` no middleware
- [x] T9 Front: botão "Gerar link" na tela admin de canais
- [x] T10 Specs + smoke (import/heads/DDL/índice parcial) — deploy pendente de OK do usuário
