# Link público de conexão de canal WhatsApp

## Problema
Hoje só o admin conecta um canal WhatsApp (Evolution/WAHA) — escaneando o QR dentro
do painel autenticado. Não há como delegar a conexão ao cliente final.

## Solução
O admin gera um **link público** (`{FRONT_URL}/conectar/{token}`) e envia ao cliente.
O cliente abre sem login, escaneia o QR (ou usa código de pareamento por número) e o
WhatsApp dele conecta naquele canal. O link é seguro (token 256 bits, expira, é
consumido após conexão) e não expõe nada sensível do sistema.

## Escopo
- Cobre `whatsapp_evolution` **e** `whatsapp_waha` (reusa o núcleo polimórfico).
- Pareamento por número disponível no Evolution (WAHA degrada para QR).
- Regra de ouro aplicada **só no link público**; admin e webhook mantêm comportamento atual.

## Comportamento esperado
- **Geração (admin, autenticado):** `POST /canais/{id}/link-conexao` → `{token, link, expira_em}`.
  Reusa o token ativo do canal (get-or-create atômico). Token 24h.
- **Público (sem auth, gated por token), prefixo `/public/conectar`:**
  - `GET /{token}` → info mínima (`canal_nome, cliente_nome, tipo, connection_status, numero_telefone`).
  - `POST /{token}/iniciar` → dispara conexão, retorna QR/pairing. Rate-limit 5/10s.
  - `GET /{token}/status` → status + QR para polling. Rate-limit 30/10s.
  - `POST /{token}/parear {telefone}` → código de pareamento. Rate-limit 5/hora.
  - Token inexistente/expirado → 404; tipo não-whatsapp → 400.
- **Página `/conectar/[token]`:** carregando → QR (contador ~150s) → pareando → conectado → expirado/erro.

## Critérios de aceite
1. Polling público NUNCA re-arma a sessão (só `estado_conexao` + `obter_qr_code` GET) e NUNCA
   tira o canal de `disconnected` nem mexe no `status` administrativo. Queda automática vira
   `connection_status='disconnected'` + UI "reconectar", sem desativar o canal.
2. Token: 256 bits, 24h, rate-limit por ação (5/10s, 30/10s, 5/h), consumo de 1h pós-conexão.
3. Endpoint público não vaza `instance_id/instance_token/webhook_token/config/apikey`.
4. Anti-hijack: ao conectar, o token vira `consumed`; `/iniciar` com token consumido é no-op
   ("já conectado") mesmo se a sessão cair depois; `/parear` → 409; `GET`/`status` respondem
   `connected` sem número/cliente. Consumo acontece no poll **e** no webhook de conexão.
5. Reconexão só via Conectar admin explícito ou novo link; link consumido não reabre.
6. Conectar é idempotente (cria-ou-reusa instância); admin mantém comportamento byte-a-byte
   (modo `publico=False`).

## Heurísticas de Nielsen (front)
- #1 Visibilidade: estados loading/QR/pareando/conectado/expirado/erro sempre visíveis.
- #9 Recuperação: erro de API vira mensagem acionável + botão "tentar novamente".
