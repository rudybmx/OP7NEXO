# Tasks: Canal WhatsApp WAHA — Fase 1

Legenda: [P] = pode rodar em paralelo com outras tarefas do mesmo grupo.

---

## Grupo 1 — Backend: tipos e labels [P entre si]

- [ ] [P] **B1** `app/services/canal_labels.py` — adicionar `"whatsapp_waha"` em `_TIPO_PROVIDER` (`"waha"`) e `_TIPO_LABEL` (`"WhatsApp WAHA"`)
- [ ] [P] **B2** `app/api/canais.py` linha 66 — adicionar `"whatsapp_waha"` ao Literal `TIPOS_VALIDOS`
- [ ] [P] **B3** `app/api/canais.py` linha 774 — alterar condição para gerar `webhook_token` também para `"whatsapp_waha"`

## Grupo 2 — Backend: normalizer (depende de nada)

- [ ] **B4** Criar `app/services/waha_normalizer.py` com `adapt_waha_to_evolution(raw: dict) -> dict`

## Grupo 3 — Backend: endpoint inbound (depende de B2, B3, B4)

- [ ] **B5** `app/api/canais.py` — adicionar `POST /webhook/waha/{token}` após linha 2109 usando `adapt_waha_to_evolution` + `enqueue_evolution_event`

## Grupo 4 — Frontend: tipos e constantes [P entre si]

- [ ] [P] **F1** `src/components/administracao/canais/canal-shared.ts` — add `'whatsapp_waha'` ao union `TipoCanal` + entrada no array `TIPOS`
- [ ] [P] **F2** `src/lib/whatsapp-canal.ts` — add `'whatsapp_waha'` em `TIPO_LABEL_FALLBACK` e `getCanalTags()`
- [ ] [P] **F3** `src/hooks/use-whatsapp-canais.ts` — add `'whatsapp_waha'` a `TIPOS_CANAL_ATENDIMENTO`
- [ ] [P] **F4** `src/app/(plataforma)/administracao/canais-omnichannel/page.tsx` — case WAHA em `getChannelBadge()`
- [ ] [P] **F5** `src/components/crm/atendimento/painel-inbox.tsx` — add tom visual WAHA em `getProviderTone()`

## Grupo 5 — Frontend: formulário de criação (depende de F1)

- [ ] **F6** `src/components/administracao/canais/novo-canal-dialog.tsx` — add `'whatsapp_waha'` a `TIPOS_CRIAVEIS`; bloco de campos `api_base_url`, `api_key_ref`, `session`

## Grupo 6 — Testes backend (depende de B1–B5)

- [ ] **T1** Teste unitário `adapt_waha_to_evolution`: dado payload flat WAHA, verificar campos `remoteJid`, `fromMe`, `body`, `instance`
- [ ] **T2** Smoke test `POST /webhook/waha/{token}`: token inválido → 404; token válido + payload texto → 200 + job em `crm_message_jobs`
- [ ] **T3** Verificar `crm_whatsapp_mensagens`: registro com texto correto após smoke test
- [ ] **T4** Verificar que nenhum valor de API key aparece em logs ou resposta de API

## Grupo 7 — Relatório (depende de todos os testes)

- [ ] **R1** Entregar relatório ao usuário: arquivos modificados, testes executados e resultados, `webhook_token` do canal criado para configuração manual
- [ ] **R2** Aguardar aprovação antes de qualquer `bash /root/deploy.sh`
