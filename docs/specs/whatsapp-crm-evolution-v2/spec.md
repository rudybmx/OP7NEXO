# WhatsApp CRM Evolution v2

## Objetivo

Transformar `/crm/atendimento/conversas` em uma experiência operacional equivalente ao WhatsApp Web para equipes de atendimento, mantendo o comportamento de CRM: multi-tenant, múltiplos canais por workspace, atribuição de agentes/equipes, tracking de origem do lead, follow-up e base preparada para vetorização futura.

O primeiro provedor entregue será `whatsapp_evolution` usando Evolution Go. A arquitetura deve manter contratos neutros para adicionar Instagram, Facebook Messenger e WhatsApp oficial sem recriar a tela.

## Estado Atual Observado

- `canais_entrada` já suporta `whatsapp_evolution`, `whatsapp_oficial`, `instagram`, `facebook` e `webhook`.
- Evolution Go já é conectado por canal/workspace com `config.evolution.instance_name`, `instance_id` e `instance_token`.
- Webhook atual: `POST /webhook/evolution/{token}` normaliza eventos `Message`, `Receipt`, `Connected`, `LoggedOut`, `QRCode` e legados.
- CRM atual persiste `crm_whatsapp_contatos`, `crm_whatsapp_conversas`, `crm_whatsapp_mensagens`, `crm_whatsapp_midia`, `crm_whatsapp_eventos`, equipes, permissões e memória IA.
- Grupos já têm `is_group`, `group_name`, `participant_jid`, `participant_name`, `is_mentioned`.
- Contatos já têm campos de tracking: `campanha_origem`, UTMs, `meta_ad_id`, `meta_ctwa_clid`, dados de referral.
- Mensagens já têm `tokens_estimados` e `embedding_status`, mas ainda falta uma view/camada de extração estável para pipeline vetorial.
- Há indícios de dívida no webhook atual: salvamento raw duplicado, trechos potencialmente quebrados em status/reabertura, processamento síncrono demais e ausência de fila persistente.

## Fontes Técnicas

- Evolution Go Webhooks: `POST /instance/connect`, `subscribe: ["ALL"]`, resposta `2xx` em até 30s, até 5 retentativas de 30s.
- Evolution API v2 Webhooks: eventos como `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `SEND_MESSAGE`, `GROUPS_UPDATE`, `GROUP_PARTICIPANTS_UPDATE`.
- Evolution API v2 Send Media: `POST /message/sendMedia/{instance}` aceita `number`, `mediatype`, `mimetype`, `caption`, `media`, `fileName`.
- Evolution Go README: suporte a Webhook/WebSocket/AMQP/NATS, mídia, MinIO/S3 e storage opcional.
- Meta WhatsApp Cloud API: mensagens, status e mídia via webhooks; janela de atendimento de 24h aplica ao provedor oficial.

## Escopo

### In Scope

- Webhook Evolution robusto, idempotente e rápido.
- Fila persistente para eventos inbound, status, mídia e envio outbound.
- Envio e recepção de texto, imagem, áudio, vídeo e documento.
- Download/upload de mídia para MinIO, com registro em `crm_whatsapp_midia`.
- Grupos: conversa única por grupo, participante real por mensagem, menções e avatar/nome do grupo.
- Múltiplos números por workspace, selecionáveis no atendimento.
- Atribuição de conversa por agente/equipe, fila de "novas", "minhas", "equipe" e "resolvidas".
- Tracking de lead por Meta referral, UTMs, mensagem pré-preenchida, campanha e origem.
- Follow-up básico: próximos passos, vencimento, status do lead e eventos de acompanhamento.
- View SQL para dataset vetorial futuro.
- Tela `/crm/atendimento/conversas` com interação de WhatsApp Web: inbox, chat, painel do contato, anexos, áudio, imagem, status de entrega/leitura, busca e filtros.

### Out of Scope Nesta Fase

- Motor de embeddings e banco vetorial em produção.
- Automações avançadas de IA respondendo pelo agente.
- Instagram/Meta oficial implementados de ponta a ponta.
- Administração de membros de grupos.
- Templates HSM completos para Meta oficial, exceto manter compatibilidade planejada.

## Regras Funcionais

1. Todo dado operacional deve carregar `workspace_id`; nenhuma query pode depender apenas de `instance` ou `remote_jid`.
2. Um workspace pode ter vários canais/números. Conversas devem carregar `canal_id` e `instance`.
3. Webhook deve responder `2xx` rapidamente após validar token e enfileirar/persistir evento bruto; o worker/background job é o único ponto de processamento pesado.
4. Idempotência obrigatória por `(workspace_id, canal_id, instance, evolution_msg_id, event_type)`. Sem `evolution_msg_id`, usar hash canônico estável sem campos instáveis do payload.
5. Mensagem duplicada não pode gerar nova conversa, nova mídia ou novo evento de follow-up.
6. Conversa 1:1 ativa é identificada por `(workspace_id, canal_id, instance, remote_jid, status != resolvido)`.
7. Conversa de grupo ativa é única por `(workspace_id, canal_id, instance, remote_jid, status != resolvido)`.
8. Se conversa `resolvido` receber nova mensagem de entrada, criar nova conversa vinculada ao mesmo contato/remote_jid.
9. Em grupo, `remote_jid` é o grupo e `participant_jid` é o remetente real. A UI deve mostrar nome do participante acima do balão.
10. Em grupo, `mentionedJid` contendo o número da instância marca `is_mentioned = true` e eleva prioridade visual.
11. Mensagens `from_me=true` vindas do webhook devem reconciliar envio local pelo `evolution_msg_id` ou chave temporária, não duplicar.
12. Status de entrega deve mapear `pending`, `sent`, `delivered`, `read`, `played`, `failed`.
13. Áudio recebido deve ficar reproduzível na UI sem depender da URL efêmera da Evolution.
14. Imagem/documento/vídeo recebido deve ser salvo no MinIO e referenciado por `crm_whatsapp_midia`.
15. Envio de mídia deve aceitar arquivo local do front, salvar no MinIO, enviar URL/base64 para Evolution e persistir mensagem com status inicial.
16. O lead deve preservar primeira origem conhecida; novas origens entram como eventos/histórico, não sobrescrevem sem regra explícita.
17. A tela deve permitir assumir, transferir, resolver e iniciar conversa sem sair do contexto.
18. Agente só vê conversas do workspace e das filas permitidas pelo seu papel/equipe.
19. Toda mudança de status, atribuição, transferência e follow-up deve gerar evento auditável.
20. A view vetorial deve expor apenas dados normalizados e filtráveis por workspace/canal/conversa/contato, sem depender de payload bruto.

## Modelo De Dados Alvo

### Ajustes em tabelas existentes

- `crm_whatsapp_eventos`: adicionar `workspace_id`, `canal_id`, `event_type`, `event_hash`, `processed_at`, `processing_status`, `error_message`, `retry_count`.
- `crm_whatsapp_conversas`: garantir `canal_id NOT NULL` para novos registros; adicionar `lead_status`, `followup_due_at`, `last_inbound_at`, `last_outbound_at`.
- `crm_whatsapp_mensagens`: adicionar `client_temp_id`, `provider_status`, `played_at`, `media_status`, `quoted_message_id`, `raw_event_id`.
- `crm_whatsapp_midia`: adicionar `workspace_id`, `canal_id`, `storage_status`, `sha256`, `duration_seconds`, `width`, `height`.
- `crm_whatsapp_contatos`: manter origem primária e adicionar/normalizar `lead_status`, `lead_score`, `last_origin_event_id`.

### Novas tabelas

- `crm_message_jobs`: fila persistente de processamento inbound/outbound/media/status.
- `crm_lead_origin_events`: histórico de origem/campanha/referral/UTM por contato/conversa.
- `crm_followups`: tarefas de follow-up por contato/conversa.
- `crm_conversation_assignments`: histórico normalizado de assumir/transferir/equipe/responsável.

### View vetorial futura

`vw_crm_whatsapp_vector_documents` deve produzir uma linha por mensagem elegível e uma linha por resumo de conversa quando existir.

Campos mínimos:
- `workspace_id`, `canal_id`, `conversa_id`, `contato_id`, `mensagem_id`
- `document_type`: `message` ou `conversation_summary`
- `occurred_at`
- `content_text`
- `metadata_json`: direção, tipo, agente, lead_status, origem, campanha, grupo, participante, status
- `embedding_status`
- `source_hash`

## UX Alvo Da Página

Layout base permanece em três colunas:
- Inbox: abas `Novas`, `Minhas`, `Equipe`, `Grupos`, `Resolvidas`; filtro por número/canal, equipe, agente, status e busca.
- Chat: bolhas com checks, áudio inline, imagens com preview, documentos, menções, reply visual futuro, composer com texto, anexos, gravação de áudio, seletor de canal/número.
- Contato/CRM: ficha do lead, origem/campanha, etapa, responsável, equipe, follow-ups, notas, histórico de eventos, links para cadastro completo.

UI/labels em português do Brasil. Código, nomes técnicos e APIs em inglês quando forem identificadores.

## Critérios De Aceite

- Webhook responde `2xx` em menos de 2s em payload normal e processa em background/fila.
- Reenvio do mesmo evento da Evolution não duplica mensagem, conversa, mídia ou tracking.
- Texto inbound aparece na tela em tempo real via SSE/Redis e fallback de polling.
- Imagem inbound é salva no MinIO, aparece no chat e tem registro em `crm_whatsapp_midia`.
- Áudio inbound é salvo no MinIO e reproduz no chat.
- Envio de imagem e áudio pelo front cria mensagem local, envia pela Evolution e reconcilia status.
- Grupo mostra conversa única, nome do grupo, participante por mensagem e destaque de menção.
- Múltiplos números por workspace aparecem como filtro e o envio usa o canal correto.
- Agente só acessa conversas autorizadas por workspace/equipe.
- Lead vindo de campanha preserva referral/UTM/campanha no contato e em histórico.
- Follow-up pode ser criado/atualizado a partir da conversa.
- View vetorial retorna documentos com `workspace_id` e conteúdo limpo.

## Riscos E Decisões

- Evolution Go retenta webhooks até 5 vezes; idempotência tem que ser no banco, não em memória.
- O webhook público não deve depender de `BackgroundTasks` para responder; a fila persistente `crm_message_jobs` com lock por `FOR UPDATE SKIP LOCKED` é o caminho robusto. Redis continua apenas para realtime.
- Não usar URL efêmera da Evolution como fonte final de mídia. MinIO é a fonte persistente.
- A tela atual tem API routes Next acessando banco diretamente e também proxy para FastAPI. O plano deve migrar gradualmente a regra de negócio para FastAPI e manter Next como BFF fino.
- Antes de schema em produção, validar migrations existentes e corrigir possíveis inconsistências no `app/api/canais.py`.

## Open Questions

- Nenhuma pergunta bloqueante para especificação. A implementação deve usar o workspace padrão `5cbc61b9-66bd-4de2-8272-39fff5c9dcc3` como piloto e descobrir o canal ativo pelo banco.

## Contrato De Vetorização

`vw_crm_whatsapp_vector_documents` é a fonte estável para o pipeline futuro de embeddings. A view retorna apenas texto normalizado em `content_text` e metadados operacionais em `metadata_json`; não expõe payload bruto da Evolution nem blobs de mídia. Mensagens sem texto/legenda ficam fora até haver transcrição.

Consumidores devem filtrar por `workspace_id` e `embedding_status`. `document_type='message'` referencia `mensagem_id`; `document_type='conversation_summary'` representa `resumo_ia` da conversa e usa `mensagem_id = NULL`. `source_hash` muda quando a origem textual muda e deve ser usado para idempotência/reprocessamento.
