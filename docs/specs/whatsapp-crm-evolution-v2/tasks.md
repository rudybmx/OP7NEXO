# Tasks — WhatsApp CRM Evolution v2

## 0. Auditoria

- [x] Rodar `python -m py_compile app/api/canais.py`.
- [x] Rodar `pytest tests/test_canais_evolution.py`.
- [x] Corrigir erros de sintaxe/processamento encontrados no webhook atual.
- [ ] Capturar um payload real da Evolution Go do número conectado e salvar como fixture de teste anonimizada.

## 1. Backend/Fila

- [x] Criar migration para `crm_whatsapp_eventos` com `workspace_id`, `canal_id`, `event_type`, `event_hash`, `processing_status`, `processed_at`, `retry_count`, `error_message`.
- [x] Criar tabela `crm_message_jobs`.
- [x] Criar modelo SQLAlchemy para jobs/eventos enriquecidos.
- [x] Implementar serviço `whatsapp_event_queue.py`.
- [x] Ajustar `/webhook/evolution/{token}` para persistir/enfileirar e responder rápido.
- [x] Implementar worker `process_next_whatsapp_jobs(limit=...)`.
- [x] Adicionar scheduler leve para drenar jobs.

## 2. Normalização

- [x] Criar DTOs Pydantic para mensagem, status, conexão e mídia normalizados.
- [x] Criar `whatsapp_normalizer.py`.
- [x] Cobrir payloads `Message`, `MESSAGES_UPSERT`, `Receipt`, `MESSAGES_UPDATE`, `Connected`, `QRCode`, `LoggedOut`.
- [x] Cobrir grupo com `participant_jid` e menção.
- [x] Cobrir LID + `senderPn`.

## 3. Persistência CRM

- [x] Extrair processamento de contato/conversa/mensagem para serviço dedicado.
- [x] Garantir `workspace_id` e `canal_id` em todas as escritas.
- [x] Implementar idempotência por mensagem e evento.
- [x] Corrigir reabertura criando nova conversa quando última estiver `resolvido`.
- [x] Criar histórico normalizado de atribuição/transferência.

## 4. Mídia

- [x] Criar serviço de mídia WhatsApp para download/upload MinIO.
- [x] Registrar inbound com `media_status='pending'`.
- [x] Criar job de download inbound.
- [x] Criar endpoint de upload outbound.
- [x] Enviar mídia pela Evolution usando `sendMedia`.
- [x] Expor mídia no contrato de mensagens.

## 5. Lead E Follow-Up

- [ ] Criar `crm_lead_origin_events`.
- [ ] Migrar extração de referral/UTM para serviço testável.
- [ ] Criar `crm_followups`.
- [ ] Criar endpoints CRUD mínimos de follow-up.
- [ ] Atualizar conversa/contato com `lead_status` e `followup_due_at`.

## 6. Frontend

- [ ] Ajustar hooks para carregar canais/números do workspace.
- [ ] Adicionar filtro de número/canal na inbox.
- [ ] Implementar upload de imagem/documento.
- [ ] Implementar gravação/envio de áudio.
- [ ] Renderizar mídia inline.
- [ ] Renderizar checks `sent/delivered/read/played/failed`.
- [ ] Mostrar participante e menção em grupos.
- [ ] Adicionar criação/edição rápida de follow-up no painel do contato.

## 7. Vetorização Futura

- [ ] Criar view `vw_crm_whatsapp_vector_documents`.
- [ ] Adicionar teste SQL básico da view.
- [ ] Documentar contrato para pipeline de embeddings.

## 8. Validação

- [ ] Testar texto inbound/outbound com número real.
- [ ] Testar imagem inbound/outbound.
- [ ] Testar áudio inbound/outbound.
- [ ] Testar grupo com dois participantes.
- [ ] Testar menção ao número conectado.
- [ ] Testar reenvio do mesmo webhook.
- [ ] Testar agente sem permissão.
- [ ] Build frontend.
- [ ] Deploy via `/root/deploy.sh both`.
