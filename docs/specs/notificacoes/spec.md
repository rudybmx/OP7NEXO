# Spec — Ambiente de Notificações (sino + central)

## Contexto / problema
Não havia notificação in-app: canal de WhatsApp caía sem ninguém ser avisado (só alerta
por WhatsApp admin, desabilitado por padrão) e "mensagem nova" só existia como contador
`nao_lidas` dentro do inbox. Faltava um sino visível e um lugar central para ver os alertas.

## Comportamento esperado
- **Sino** no rodapé do sidebar (ao lado do "Assistente AI"), visível a todos; badge vermelho
  com a contagem de não-lidas (do usuário); popover lista as notificações; clicar marca como
  lida e navega pelo `link`. Polling a cada 45s.
- **Central** em *Administração > Empresas > Notificações*: feed/histórico (filtros tipo,
  lida/não-lida, busca; marcar lida / marcar todas) + bloco "Quem vê cada tipo" (audiência), só
  para admin.

## Tipos (v1, extensível)
- `canal_offline` — severidade `critico`; gatilho: health-check de canais (worker); audiência
  default = administradores; link → `/administracao/canais-omnichannel`.
- `mensagem_nova` — gatilho: inbound WhatsApp (entrada, não-grupo); audiência default =
  atendentes; **agregada por conversa** (1 viva por vez); link → `/atendimento?conversa=<id>`.

## Regras
- **Audiência por papel**, configurável por workspace×tipo (`notificacao_config`); snapshot em
  `notificacoes.audiencia_papeis` no momento da criação. `[]` = todos. Toggle de audiência na UI
  por grupo (Administradores / Atendentes); se ambos OFF → tipo desativado (`ativo=false`).
- **Leitura por usuário** (`notificacao_leituras`): broadcast sem fan-out; contador de não-lidas
  é por usuário (visível ao papel e sem linha de leitura própria).
- **Dedupe/agregação**: não cria nova se já existe uma com a mesma `dedupe_key` ainda "viva"
  (sem nenhuma leitura). `canal_offline` tem ainda anti-spam Redis 12h por canal.
- **Tolerância a falha**: a criação roda em SAVEPOINT e nunca derruba o fluxo do gatilho
  (caminho quente de webhook / job do worker). Redis indisponível → degrada (notifica mesmo).
- **Multi-tenant**: `workspace_id` em toda query; endpoints de config exigem admin.

## Endpoints (`/notificacoes`)
- `GET /notificacoes` (filtros `tipo`, `nao_lidas`, paginação) · `GET /notificacoes/contador`
- `POST /notificacoes/{id}/lida` · `POST /notificacoes/marcar-todas-lidas`
- `GET /notificacoes/config` (admin) · `PUT /notificacoes/config/{tipo}` (admin)

## Modelo de dados (migration 100)
- `notificacoes` (workspace_id, tipo, severidade, titulo, mensagem, link, audiencia_papeis JSONB,
  entidade_tipo/entidade_id, dedupe_key, payload JSONB, criado_em)
- `notificacao_leituras` (PK notificacao_id+user_id, lida_em)
- `notificacao_config` (PK workspace_id+tipo, ativo, audiencia_papeis JSONB)

## Critérios de aceite (verificados)
- 12 testes unitários do service + 10 asserts de integração SQL real (dedupe, audiência JSONB
  `@>`, leitura por usuário, config override) passando; migration 099 aplica limpa; `app.main`
  importa; front buildou (`Compiled successfully`).
- Ao vivo (pós-deploy): canal `disconnected` → 1 notificação (não duplica em 12h); msg nova →
  1 por conversa; abrir conversa marca lida; sino e página renderizam em light/dark.

## Realtime / escalabilidade (v2)
Polling no v1; o service já publica em Redis (`notifications:events`) para um SSE futuro. `tipo`
genérico + `payload` JSONB ⇒ novos tipos sem migration. Diferido: ativar/desativar por tipo na
UI, canais de entrega (email/WhatsApp/push), "canal reconectado".
