# Plano técnico — Fase 3 (agente tool-calling)

## Arquivos
- **NOVO** `app/services/agenda/agente_tools.py`:
  - `TOOLS_SCHEMA: list[dict]` — as 5 funções no formato OpenAI (`{"type":"function","function":{name,description,parameters}}`). Params só de negócio (sem workspace/telefone).
  - `tools_para_workspace(db, workspace_id) -> tuple[list[dict], str | None]` — devolve (schemas, bloco_contexto) **só se** houver ≥1 agenda com `agente_agendamento != 'desativado'`; o bloco_contexto lista agendas (nome + modo) + serviços (nome + duração) p/ injetar no system prompt. Senão `([], None)`.
  - `executar_tool(db, *, workspace_id, telefone, nome, args) -> dict` — dispatch das 5; resolve agenda/serviço por nome (escopo workspace); injeta workspace+telefone; chama os serviços de domínio; converte data_hora local→UTC pela `fuso_horario` da agenda; captura exceções de domínio → `{"erro": str}`; `db.rollback()` em falha inesperada de escrita.
  - Helpers: `_resolver_agenda(db, ws, nome)`, `_resolver_servico(db, ws, agenda, nome)`, `_localizar_agendamento_do_contato(db, ws, telefone, ref)`.
- **MOD** `app/services/llm_client_service.py`:
  - NOVO `chamar_com_tools(db, agente, messages, tools=None, tool_choice="auto") -> tuple[msg, dict]` — `client.chat.completions.create(model, response_format=json_object, messages, tools?, tool_choice?)`; retorna `(resp.choices[0].message, usage_dict)`. `chamar_json` mantido (back-compat).
- **MOD** `app/services/agent_service.py`:
  - `_montar_system(...)` ganha `bloco_agenda: str | None` — anexa o contexto de agendas/serviços + a instrução de autonomia (direto vs confirmar) antes do schema JSON.
  - `gerar_resposta(...)` ganha `telefone_contato: str | None = None`. Se `tools_para_workspace` retornar tools: roda o **loop** (máx 5 it.) via `chamar_com_tools`, executando `agente_tools.executar_tool` e anexando `assistant`(tool_calls)+`tool`(result); na iteração sem tool_calls, parseia o JSON final. Sem tools → caminho atual (`chamar_json`) intacto.
  - `processar_reply(...)` passa `telefone_contato` (de `conversa.remote_jid`/contato) ao `gerar_resposta`.
- **NOVO** testes `app/tests/test_agente_tools.py` (ou scratch): schemas válidos; executor cria/consulta/cancela em DB scratch; resolução por nome; exceções → `{erro}`; loop com stub de LLM que devolve tool_calls e depois JSON final.

## Ordem (cada passo testado)
1. `agente_tools.py` (schemas + executor + resolvers) — testar executor isolado em DB scratch (criar/disponibilidade/buscar/reagendar/cancelar) **sem LLM**.
2. `llm_client_service.chamar_com_tools` — testar com stub (monkeypatch do client) que devolve tool_calls → depois content JSON.
3. Wire no `agent_service` (system prompt + loop + telefone) — teste de `gerar_resposta` com stub de LLM rodando o loop ponta-a-ponta (sem rede).
4. Boot-import (`docker run --rm`) + `alembic heads` único (sem migration, mas conferir) + pytest.
5. Deploy **api → worker** (`lock-deploy bash /root/deploy.sh api` depois `worker`).
6. Validação ao vivo: cadastrar agenda no workspace de teste com `agente_agendamento` direto/confirmar, mandar msg real no WhatsApp ("tem horário amanhã?", "quero marcar") → ver o loop chamar as tools (logs) + agendamento criado + caixa do Atendimento.

## Riscos / mitigação
- **tools + response_format=json_object** juntos: OK no OpenAI (tool_calls vêm com content null; o content final é o JSON). DeepSeek menos confiável → recomendar gpt-4o-mini; degradar p/ caminho-sem-tools se o provider recusar.
- **Loop infinito** → cap 5 + fallback textual.
- **Envenenar transação** (lição Central de Agentes): cada tool de escrita isola falha + rollback; retrieve/erro nunca aborta a resposta.
- **Sem migration** → mas rodar boot-import + `alembic heads` (lição do outage 102/103).
- **Latência**: worker é assíncrono (sem teto Cloudflare 100s), mas várias idas ao LLM somam — manter cap baixo.
