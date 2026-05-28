# Auditoria Fase 0 — 2026-05-28

## Graphify

- `graphify update .` executado com sucesso na API.
- Extração semântica completa executada com `GEMINI_API_KEY` carregada de `/root/.hermes/.env`.
- Resultado: `1543 nodes`, `3712 edges`, `116 communities`.
- Dependência `openai` instalada no venv próprio do tool `graphifyy` via `uv pip`, porque o backend Gemini do graphify exige esse pacote.

## Git Remote

- `/root/op7nexo-api`: sem remote configurado.
- `/root/op7nexo-front`: `origin git@github.com:rudybmx/OP7NEXO.git`.
- Decisão: não configurar o remote da API usando o remote do front sem confirmação, porque os repositórios têm raízes Git separadas.

## Testes Executados

- `docker compose run --rm -T -v /root/op7nexo-api:/app op7nexo-api python -m py_compile app/services/evolution.py app/api/canais.py`
- `docker compose run --rm -T -v /root/op7nexo-api:/app op7nexo-api sh -c 'pip install --quiet pytest && python -m pytest tests/test_canais_evolution.py -q'`
- Resultado: `4 passed`.

## Canal Evolution Encontrado

- Canal: `rudy_zap`
- Workspace: `9647ad83-20c6-416a-a5f1-527aee1e48ce` (`Rudy`)
- Canal ID: `7c6a0ae5-ff34-4b1e-98f0-3f2caf5bf753`
- Instance: `op7-9647ad83-20c6-416a-a5f1-527aee1e48ce-7c6a0ae5-ff34-4b1e-98f0-3f2caf5bf753`
- Evolution `/instance/all`: `status=open`, `connected=true`.
- Banco antes da auditoria: `status=inativo`, `connection_status=disconnected`.
- Banco depois da sincronização operacional: `status=ativo`, `connection_status=connected`.

## Correção Aplicada

`app/services/evolution.py` agora faz fallback em `estado_conexao()`:

1. tenta `/instance/status`;
2. tenta legacy `/instance/connectionState/{instance_name}`;
3. se ambos não funcionarem, consulta `/instance/all` via `obter_instancia()`.

Motivo: a Evolution Go desta VPS respondeu 404 para os endpoints de status direto, mas retornou a instância conectada via `/instance/all`.

## Webhook

- A configuração do webhook foi chamada com sucesso usando `configurar_webhook()`.
- A listagem `/instance/all` não expõe o webhook configurado (`webhook=None`), então a confirmação definitiva deve ser feita por recebimento de mensagem real ou endpoint específico da Evolution, se disponível.
- Não há eventos recentes depois de `2026-05-25`; eventos antigos mostram instância `qozt_atendimento`, que não corresponde ao canal atual `rudy_zap`.

## Payload Real Observado

Último evento `Message` no banco:

- Instance: `qozt_atendimento`
- Grupo: `120363404098583550@g.us`
- Estrutura Evolution Go: payload com `data.Info`, `data.Message`, `groupData`.
- `Info` contém `ID`, `Chat`, `Sender`, `SenderAlt`, `IsFromMe`, `IsGroup`, `PushName`, `Timestamp`.
- `Message` do exemplo contém `reactionMessage`.

Pendente: salvar fixture anonimizada a partir de um payload novo do número conectado atual.

## Achados Para Fase 1

- `crm_whatsapp_eventos.workspace_id` está `NULL` nos eventos existentes; a fila nova precisa gravar `workspace_id` e `canal_id`.
- Conversas antigas da instância `qozt_atendimento` têm `canal_id = NULL`; migration/backfill será necessário.
- `crm_whatsapp_midia` está vazia mesmo havendo conversas com `ultima_mensagem='[mídia]'`; mídia inbound ainda não está persistindo como esperado.
- A UI e o backend precisam resolver múltiplas instâncias: eventos antigos são do workspace piloto, mas o canal conectado atual está em outro workspace.
