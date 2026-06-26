# Agendamento público (Fase 5) — spec

## Problema
Hoje só a equipe marca agendamentos (painel autenticado) e o agente de IA pelo WhatsApp.
Falta o paciente marcar sozinho por um link divulgável (flyer, bio, site), sem login.

## Solução
Link público **por agenda** (token CSPRNG 256-bit, longevo e reusável) que abre uma página
standalone onde o paciente escolhe serviço → data → horário livre → preenche nome+telefone → confirma.

## Decisões (do usuário)
- **Escopo:** 1 link por agenda (profissional/sala). O admin gera/revoga na tela Agendas.
- **Confirmação:** configurável por agenda, reusando `agendas.agente_agendamento`:
  - `desativado` → agendamento online indisponível (link responde, mas POST bloqueado);
  - `direto` → grava `status='confirmado'` na hora;
  - `confirmar` → grava `status='agendado'` (fila de aprovação) + observação "aguardando confirmação".
- **Anti-abuso:** só nome+telefone + rate-limit (sem código por WhatsApp no v1).

## Critérios de aceite (segurança — superfície pública)
1. Todo identificador (agenda_id, workspace_id) vem do TOKEN, nunca do corpo.
2. O POST **re-valida o slot no servidor** (`calcular_disponibilidade`): recusa (409) horário fora
   do expediente, no almoço, em bloqueio, no passado ou já ocupado. `criar_agendamento` é permissivo
   e NÃO basta.
3. Serviço informado tem que ser desta agenda ou global do workspace, senão 422.
4. Rate-limit do POST por **IP** (10/h) e **telefone** (5/h), fail-closed (Redis fora → 503).
   GET info/disponibilidade por token, fail-open. Nunca por token no POST (DoS de 1 link travaria a clínica).
5. Token inválido/revogado/agenda inativa → 404 genérico (não vaza existência).
6. `origem='paciente'` no agendamento criado.

## Endpoints
- `GET  /public/agendar/{token}` → agenda (nome, cor, fuso), clínica, pode_agendar, serviços.
- `GET  /public/agendar/{token}/disponibilidade?data&servico_id` → slots livres.
- `POST /public/agendar/{token}` body `{nome, telefone, data_hora_inicio, servico_id?, observacoes?}` → cria.
- `POST /agenda/agendas/{id}/link-publico` (admin) → gera/reusa token + link.
- `DELETE /agenda/agendas/{id}/link-publico` (admin) → revoga.

## Front
Página `/agendar/[token]` standalone (sem shell/sidebar/workspace-context), flat shadcn, light/brand.
`/agendar` em `PUBLIC_PATHS` do middleware. Botão "Link público" na tela Agendas (copia o link).

## Heurísticas Nielsen
- #1 Visibilidade: loading/erro/sucesso visíveis em cada passo.
- #5 Prevenção: slot re-validado server-side (paciente nunca marca horário inválido).
- #9 Recuperação: 409 vira "horário indisponível, escolha outro" acionável.

## Verificação
Backend: TestClient contra schema real de prod em DB scratch — book válido (201/origem=paciente),
fora-de-horário/passado→409, serviço estrangeiro→422, token inválido→404, direto→confirmado,
confirmar→agendado. Migration 106 up/down + índice parcial. Boot-import.
Front: Playwright ao vivo (sem cookie de sessão, timezoneId America/Sao_Paulo): abrir link, escolher
serviço/slot, marcar, ver confirmação, achar no calendário do CRM.
