# Spec — Agente de IA agenda sozinho (tool-calling) · Fase 3

## Objetivo
Dar ao agente de WhatsApp (Central de Agentes) a capacidade de **consultar e marcar/remarcar/cancelar agendamentos dentro da conversa**, via **tool-calling** nativo do LLM, reusando os serviços de domínio da Agenda (Fase 1). O agente passa a ter um **loop agêntico** (modelo → tool_calls → executa → realimenta → resposta final), em vez de só gerar JSON de resposta.

## Decisões (travadas)
- **Vínculo por TELEFONE da conversa.** O executor das tools injeta `workspace_id` + **telefone do contato da conversa** (de `conversa.remote_jid`/contato) — o **modelo NUNCA** passa esses; só passa dados de negócio (data, serviço, nome). Garante multi-tenant + a regra "vínculo por telefone".
- **5 tools fixas** (não um registro genérico por agente): `consultar_disponibilidade`, `buscar_agendamentos_contato`, `criar_agendamento`, `reagendar_agendamento`, `cancelar_agendamento`.
- **Autonomia por agenda** (`agendas.agente_agendamento`, já existe — sem migration):
  - `desativado` → as tools de agenda **não são oferecidas** para aquela agenda.
  - `direto` → o agente agenda assim que tiver os dados.
  - `confirmar` (default) → o agente **confirma o horário com o próprio cliente na conversa** antes de gravar ("Posso confirmar para terça às 14h?") — diferença é **só de prompt**, ambos gravam via `criar_agendamento`. (Decisão do usuário: sem aprovação de equipe.)
- **Exceção terceiro**: `criar_agendamento` aceita `para_terceiro=True` + `paciente_nome` (grava sem telefone do cliente, registra na observação; `agendado_por_telefone` = telefone da conversa).
- **Modelo**: tool-calling exige modelo confiável — recomendado **gpt-4o-mini/gpt-4.1** (OpenAI). O agente ativo já usa gpt-4o-mini (validar no teste; DeepSeek é menos confiável p/ tools).

## As 5 ferramentas (o modelo só passa os campos de negócio)
| Tool | Params do MODELO | Injetado pelo executor | Chama | Retorno ao modelo |
|---|---|---|---|---|
| `consultar_disponibilidade` | `agenda_nome?`, `data` (YYYY-MM-DD), `servico_nome?` | workspace_id | `calcular_disponibilidade` (resolve agenda+duração do serviço) | lista de horários livres (HH:mm) por agenda |
| `buscar_agendamentos_contato` | — | workspace_id, telefone | query por telefone (norm OU agendado_por) | próximos + resumo de comparecimento |
| `criar_agendamento` | `cliente_nome`, `data_hora` (ISO local), `agenda_nome?`, `servico_nome?`, `para_terceiro?`, `paciente_nome?`, `observacoes?` | workspace_id, telefone, origem="agente" | `criar_agendamento` | confirmação (data/hora/serviço/agenda) ou erro (conflito/sem vaga) |
| `reagendar_agendamento` | `agendamento_ref` (ou resolve pelo próximo do contato), `nova_data_hora` | workspace_id, telefone | localiza + `reagendar` | novo horário ou erro |
| `cancelar_agendamento` | `agendamento_ref?`, `motivo?` | workspace_id, telefone | localiza + `cancelar` | confirmação |

- **Resolução de agenda/serviço por NOME** (string), escopada ao workspace. Se houver 1 agenda só, `agenda_nome` é opcional. Se ambíguo, a tool devolve as opções p/ o modelo perguntar.
- **Timezone**: `data_hora` é interpretada na `fuso_horario` da agenda (zoneinfo) → grava UTC. Datas relativas ("amanhã") o modelo resolve a partir do contexto temporal já injetado no system prompt.

## Loop agêntico
- `chamar_json` é estendido p/ aceitar `tools` + `messages` (lista completa) e retornar a **mensagem** (content + tool_calls).
- Em `gerar_resposta`: se há tools disponíveis, monta `messages=[system, user]` e itera (máx **5** iterações):
  1. chama o LLM com `tools=` + `tool_choice="auto"` (+ `response_format=json_object` mantido p/ a resposta final).
  2. se `message.tool_calls`: executa cada uma (executor), anexa `assistant`(tool_calls) + `tool`(result) às messages, continua.
  3. se não: `message.content` é o JSON final `{resposta, score_confianca, intent, nome_cliente}` → parse como hoje.
- **Cap + fallback**: estourou 5 iterações → última resposta textual vira `resposta` com score moderado; erro no loop → `handoff` (motivo `erro_llm`), igual ao caminho atual. Contrato de retorno de `gerar_resposta` **inalterado**.
- Tools só entram quando o workspace tem ≥1 agenda com `agente_agendamento != 'desativado'` (senão, caminho atual sem tools — zero regressão).

## Segurança / multi-tenant
- Executor recebe `workspace_id` + `telefone` do **contexto da conversa**, nunca do modelo. Toda chamada de serviço é escopada a `workspace_id`. `reagendar`/`cancelar` só agem em agendamentos que casam o telefone da conversa (norm OU agendado_por).
- Tools de uma agenda `desativado` não são expostas.

## Tratamento de erro
- Tool levanta exceção de domínio (`ConflitoAgendamento`/`AgendaNaoEncontrada`/`DadosInvalidos`) → o executor devolve `{erro: "..."}` ao modelo (não quebra o loop); o modelo explica ao cliente.
- Falha de LLM/parse/timeout → `handoff` (comportamento atual preservado).
- `db.rollback()` em qualquer falha de tool de escrita não-de-domínio (não envenenar a transação — lição da Central de Agentes).

## Critérios de aceite (testáveis — "fase montada = fase testada")
1. **Disponibilidade**: inbound "tem horário amanhã?" → loop chama `consultar_disponibilidade` → resposta lista horários reais da agenda (respeita almoço/bloqueio/tz/capacidade).
2. **Marcar (confirmar)**: inbound "quero marcar limpeza" → agente pergunta/propõe horário, **confirma com o cliente**, chama `criar_agendamento` → agendamento criado (origem=agente, telefone da conversa) e aparece na caixa do Atendimento.
3. **Anti-double-book**: dois fluxos no mesmo slot (capacidade 1) → 2º recebe erro de conflito e o agente oferece outro horário.
4. **Multi-tenant/telefone**: o agendamento criado casa o telefone da conversa; `buscar_agendamentos_contato` só retorna os do contato.
5. **Reagendar/cancelar**: "preciso remarcar" → localiza o próximo do contato → `reagendar`; "cancela" → `cancelar`.
6. **Autonomia**: agenda `desativado` → o agente não tem as tools (não agenda); `direto` → agenda sem pedir confirmação; `confirmar` → pede o ok antes.
7. **Zero regressão**: workspace sem agenda (ou todas `desativado`) → fluxo do agente idêntico ao atual (sem tools).
8. **Backend sem erros**: pytest dos tools + simulação do loop com stub de LLM; boot-import (`docker run --rm`); `alembic heads` único (sem migration nova, mas checar).

## Fora de escopo (Fase 3)
- Lembretes/NPS (Fase 4), agendamento público (Fase 5), aprovação por equipe (o usuário escolheu confirmação com o cliente), UI de "pendentes".
