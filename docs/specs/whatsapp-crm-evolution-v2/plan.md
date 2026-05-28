# Plano Técnico — WhatsApp CRM Evolution v2

## Estratégia

Implementar em camadas, preservando a tela atual e reduzindo risco em produção. Primeiro estabilizar webhook, idempotência e mídia; depois fila outbound e UX; por fim follow-up e view vetorial.

## Arquitetura Alvo

```
Evolution Go
  -> POST /webhook/evolution/{token}
  -> crm_whatsapp_eventos + crm_message_jobs
  -> worker processa mensagem/status/mídia
  -> PostgreSQL + MinIO
  -> Redis whatsapp:events
  -> SSE /api/whatsapp/stream
  -> /crm/atendimento/conversas
```

Para envio:

```
Front composer
  -> upload mídia opcional para MinIO
  -> POST /canais/{canal_id}/enviar-mensagem
  -> mensagem local pending
  -> Evolution sendText/sendMedia
  -> webhook/status reconcilia
```

## Fase 0 — Auditoria E Correções De Base

1. Validar sintaxe e imports de `app/api/canais.py`; há sinais de trecho quebrado em `_processar_status_mensagem` e reabertura.
2. Rodar testes existentes de canais: `pytest tests/test_canais_evolution.py`.
3. Testar webhook manual com payload real da Evolution Go do número conectado.
4. Identificar canal ativo do workspace piloto e confirmar `webhook_token`, `instance_id`, `instance_token`, `numero_telefone`.

Entrega: webhook atual compilando, sem duplicidade óbvia e com teste cobrindo mensagem/status.

## Fase 1 — Webhook Idempotente E Fila Persistente

1. Migration:
   - enriquecer `crm_whatsapp_eventos` com `workspace_id`, `canal_id`, `event_type`, `event_hash`, status de processamento.
   - criar `crm_message_jobs`.
2. Endpoint `/webhook/evolution/{token}`:
   - valida token.
   - salva raw event com hash estável.
   - ignora duplicados já processados/enfileirados.
   - enfileira job e responde `{"recebido": true}`.
3. Worker:
   - função síncrona chamada por scheduler/loop simples no MVP.
   - lock com `FOR UPDATE SKIP LOCKED`.
   - retry com backoff e `dead_letter` depois do limite.
4. Redis continua apenas para notificar front após commit.

Decisão: usar PostgreSQL como fila agora para evitar dependência operacional nova. Redis Streams/Celery/RQ podem entrar depois.

## Fase 2 — Normalização De Mensagens

1. Criar `app/services/whatsapp_normalizer.py`:
   - suporta Evolution Go (`Info`, `Message`) e legado (`key`, `message`).
   - retorna DTO: instance, remote_jid, participant_jid, from_me, msg_id, timestamp, type, text, mentions, media.
2. Separar processamento:
   - `process_inbound_message`.
   - `process_receipt`.
   - `process_connection`.
3. Garantir idempotência:
   - mensagem por `(workspace_id, canal_id, instance, evolution_msg_id)`.
   - fallback hash para mensagens sem id.
4. Corrigir LID/telefone BR usando rotina isolada e testada.

## Fase 3 — Mídia No MinIO

1. Unificar upload/download em serviço:
   - `download_inbound_media`.
   - `upload_outbound_media`.
   - validação de MIME/tamanho.
2. Inbound:
   - mensagem salva primeiro com `media_status='pending'`.
   - job baixa base64/url/fallback Evolution.
   - salva `whatsapp/{workspace_id}/{conversa_id}/{mensagem_id}.{ext}`.
   - atualiza `crm_whatsapp_midia` e publica `message.media.ready`.
3. Outbound:
   - front envia arquivo para endpoint de upload.
   - backend salva no MinIO.
   - envia `media` para Evolution por URL ou base64 conforme compatibilidade real.
   - registra mensagem pending e reconcilia pelo webhook.

## Fase 4 — Leads, Origem E Follow-Up

1. Criar `crm_lead_origin_events`.
2. Extrair origem em prioridade:
   - referral Click-to-WhatsApp.
   - UTMs explícitas.
   - mensagem pré-preenchida.
   - canal/número.
3. Preservar origem primária do contato; salvar novas ocorrências como histórico.
4. Criar `crm_followups` com status: `pendente`, `feito`, `adiado`, `cancelado`, `vencido`.
5. Atualizar painel do contato para exibir origem, etapa, follow-up e próximos passos.

## Fase 5 — Front WhatsApp Web + CRM

1. Manter rota `/crm/atendimento/conversas`.
2. Ajustar hooks para carregar canais/números e filtrar inbox.
3. Composer:
   - texto.
   - anexar imagem/documento.
   - gravar/enviar áudio.
   - preview antes de enviar.
4. Chat:
   - checks por status.
   - mídia inline.
   - nome de participante em grupo.
   - badge de menção.
   - pending/error retry.
5. Inbox:
   - abas por fila.
   - badges de não lidas e menções.
   - filtro por canal/equipe/agente.
6. Painel contato:
   - tracking de campanha.
   - lead status.
   - follow-up.
   - histórico de transferência/eventos.

## Fase 6 — View Vetorial

1. Criar migration com `vw_crm_whatsapp_vector_documents`.
2. Normalizar texto:
   - remover payload bruto.
   - preservar direção, autor e contexto.
   - excluir mídia sem legenda, exceto transcrição futura.
3. Marcar mensagens `embedding_status='pendente'` por padrão.
4. Contrato futuro: pipeline de embeddings lê a view por `workspace_id` e `embedding_status`.

### Contrato Entregue

`vw_crm_whatsapp_vector_documents` expõe documentos elegíveis para embeddings sem payload bruto:
- uma linha por mensagem textual ou mídia com legenda;
- uma linha por resumo de conversa (`resumo_ia`) quando existir;
- filtros obrigatórios para consumidores: `workspace_id` e `embedding_status`;
- campos: `workspace_id`, `canal_id`, `conversa_id`, `contato_id`, `mensagem_id`, `document_type`, `occurred_at`, `content_text`, `metadata_json`, `embedding_status`, `source_hash`.

O pipeline futuro deve buscar lotes com `WHERE workspace_id = :workspace_id AND embedding_status = 'pendente'`, gerar embedding usando `content_text`, persistir o vetor em store dedicada e atualizar o status da origem (`crm_whatsapp_mensagens.embedding_status` para mensagens; `contexto_ia.embedding_status` para resumos).

## Testes

- Unitários para normalizer Evolution Go e legado.
- Unitários para idempotência de webhook.
- Integração para envio texto/mídia com mock Evolution.
- Integração para MinIO usando mock/local.
- Teste de autorização: agente não acessa workspace/equipe indevida.
- Front: build + teste manual da rota piloto.

## Deploy

1. Backend: migrations + testes + `bash /root/deploy.sh api`.
2. Frontend: build + `bash /root/deploy.sh front`.
3. Teste com número conectado no workspace piloto.
4. Monitorar logs de webhook, jobs, MinIO e Redis.
