# Feature Specification: Meta Sync Incremental + UI Contas-Ads

**Feature Branch**: `001-meta-sync-incremental-ui`

**Created**: 2026-06-05

**Status**: Draft

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sync Incremental do Catálogo (Priority: P1)

O sistema de sync Meta Ads, ao rodar automaticamente 3×/dia para 72 contas, deve buscar na API da Meta **apenas os itens de catálogo (campanhas, conjuntos, anúncios) que foram alterados desde o último sync**, usando o watermark de `updated_time` já armazenado. Atualmente, 100% do catálogo é re-buscado a cada rodada.

**Why this priority**: Causa direta do gargalo atual — algumas contas ficam com última atualização em 02/06 porque a rodada do scheduler não termina antes do próximo ciclo. Redução estimada de ~80% nas chamadas de catálogo.

**Independent Test**: Após o primeiro sync completo de uma conta, o segundo sync manual deve completar a etapa de catálogo fazendo significativamente menos chamadas à API Meta (verificável via contagem de requisições no log).

**Acceptance Scenarios**:

1. **Given** uma conta já sincronizada com watermarks salvos em `meta_sync_states.watermarks`, **When** o scheduler executa o próximo sync dessa conta, **Then** as chamadas de catálogo à Meta API incluem `updated_since` com o timestamp do watermark anterior
2. **Given** uma conta em primeiro sync (watermark = null) ou em modo backfill, **When** o sync executa, **Then** o catálogo completo é buscado sem filtro `updated_since`
3. **Given** uma conta com watermark do dia anterior, **When** nenhuma campanha foi alterada na Meta, **Then** o sync de catálogo retorna 0 itens e não faz upserts desnecessários
4. **Given** uma conta com 10 campanhas, 3 alteradas desde o último sync, **When** o sync incremental executa, **Then** apenas as 3 campanhas alteradas são retornadas e processadas

---

### User Story 2 — Histórico de Sync por Conta (Priority: P1)

Administradores precisam visualizar o histórico de execuções de sync por conta para diagnosticar problemas: quando foi a última rodada bem-sucedida, qual etapa falhou, quantos itens foram atualizados, se houve rate limit.

**Why this priority**: Sem histórico, é impossível saber se uma conta que mostra "02/06" na tabela estava em cooldown, com erro de token, ou simplesmente nunca chegou na fila do scheduler.

**Independent Test**: Após 3 syncs de uma conta (manuais ou automáticos), acessar o histórico deve mostrar as 3 entradas com status, data/hora, duração e contagens.

**Acceptance Scenarios**:

1. **Given** uma conta que foi sincronizada com sucesso, **When** o histórico de sync é consultado, **Then** a entrada mostra: data/hora de início e fim, modo (recorrente/backfill), status "success", quantidade de campanhas/conjuntos/anúncios atualizados
2. **Given** uma conta cujo sync foi interrompido por rate limit, **When** o histórico é consultado, **Then** a entrada mostra status "rate_limited", o percentual de uso da API no momento e a etapa em que ocorreu
3. **Given** uma conta cujo sync falhou em uma etapa específica, **When** o histórico é consultado, **Then** a entrada mostra status "error", a etapa (`stage_failed`) e a mensagem de erro
4. **Given** histórico com mais de 20 entradas, **When** o endpoint é chamado sem parâmetro de limite, **Then** retorna as 20 mais recentes (padrão)

---

### User Story 3 — Dialog de Edição Centralizado (Priority: P2)

O dialog de edição de contas em `/administracao/contas-ads` deve aparecer centralizado na tela (modal flutuante), não como um painel lateral deslizante. Deve incluir um painel de histórico de sync mostrando as últimas rodadas da conta.

**Why this priority**: Solicitação de UX — o Sheet lateral não é o padrão dos outros dialogs de edição do sistema. O histórico de sync no dialog elimina a necessidade de tela separada para diagnóstico.

**Independent Test**: Clicar em "Editar" em qualquer conta deve abrir um modal centralizado com fundo escurecido. O modal deve mostrar o histórico das últimas 10 rodadas de sync daquela conta.

**Acceptance Scenarios**:

1. **Given** a lista de contas visível, **When** o usuário clica em "Editar" em uma conta, **Then** um modal centralizado aparece com fundo escurecido, contendo todos os campos atuais de edição
2. **Given** o modal de edição aberto, **When** o usuário rola até o final, **Then** vê a seção "Histórico de Sync" com as últimas 10 rodadas: Data/Hora, Modo, Status (com cor), Campanhas atualizadas, Duração
3. **Given** o modal de edição com dados alterados, **When** o usuário clica em "Cancelar" ou fecha o modal, **Then** as alterações são descartadas e o modal fecha
4. **Given** o modal de edição, **When** o usuário salva, **Then** o modal fecha e a tabela reflete os dados atualizados

---

### User Story 4 — Tabela de Contas Melhorada (Priority: P2)

A tabela de contas em `/administracao/contas-ads` deve exibir informações mais claras sobre o estado do sync de cada conta: ícones de status visuais e data de início do período de sync.

**Why this priority**: Com 72 contas, o administrador precisa identificar visualmente contas com problemas sem abrir cada uma individualmente.

**Independent Test**: A tabela deve permitir identificar, sem clicar em nada, quais contas estão em erro, cooldown, executando ou atualizadas com sucesso, e quando cada uma iniciou seu período de dados.

**Acceptance Scenarios**:

1. **Given** uma conta em cooldown de rate limit, **When** a tabela é visualizada, **Then** a linha mostra ícone/badge de cooldown com a data até quando dura
2. **Given** uma conta com último sync bem-sucedido, **When** a tabela é visualizada, **Then** a coluna "Última Atualização" mostra data/hora com ícone de sucesso (✓)
3. **Given** uma conta com sync em erro, **When** a tabela é visualizada, **Then** a linha mostra ícone de alerta (⚠) com a etapa que falhou
4. **Given** uma conta com `periodo_sync_inicio` definido, **When** a tabela é visualizada, **Then** a coluna "Período" mostra a data de início formatada

---

### Edge Cases

- O que acontece quando `updated_since` retorna menos itens que o esperado (campanha deletada na Meta não aparece no resultado filtrado)?
- O que acontece quando o watermark está corrompido ou é futuro (ex: clock skew)?
- Como garantir que contas novas (sem watermark) sempre façam sync completo?
- O que acontece se o endpoint de histórico for chamado para uma conta sem nenhum registro de sync?

---

## Requirements *(mandatory)*

### Functional Requirements

**Backend — Sync Incremental:**

- **FR-001**: O sistema DEVE passar o parâmetro `updated_since` (unix timestamp) nas chamadas de catálogo à Meta API quando existir watermark anterior para campanhas, conjuntos e anúncios
- **FR-002**: O sistema DEVE ler o watermark anterior de `meta_sync_states.watermarks` antes de iniciar a etapa de catálogo, usando os campos `campaigns_updated_time`, `adsets_updated_time`, `ads_updated_time`
- **FR-003**: Em modo backfill ou quando o watermark é null, o sistema DEVE buscar catálogo completo sem `updated_since`
- **FR-004**: O sistema DEVE continuar salvando o `max(updated_time)` de cada nível como watermark ao final de cada sync bem-sucedido

**Backend — Histórico de Sync:**

- **FR-005**: O sistema DEVE registrar o início de cada execução de sync em `meta_sync_log` com `ads_account_id`, `sync_mode`, `started_at`, status inicial "running"
- **FR-006**: O sistema DEVE atualizar a entrada de `meta_sync_log` ao final do sync com `finished_at`, `status`, contagens de itens processados e `request_count`
- **FR-007**: Em caso de rate limit, o sistema DEVE registrar entrada com `status = "rate_limited"` e `rate_limit_usage_pct`
- **FR-008**: Em caso de erro, o sistema DEVE registrar `status = "error"`, `stage_failed` e `error_message`
- **FR-009**: O endpoint `GET /meta/sync/historico/{ads_account_id}` DEVE retornar as últimas N entradas de `meta_sync_log` (padrão N=20, máximo N=100)
- **FR-010**: O endpoint DEVE retornar array vazio (não erro 404) para contas sem histórico

**Frontend — Dialog de Edição:**

- **FR-011**: O componente de edição de conta DEVE ser renderizado como Dialog centralizado (não Sheet lateral)
- **FR-012**: O Dialog DEVE conter todos os campos atualmente disponíveis no Sheet: nome, BM ID, agrupamento, token, sync_paused, workspace_ids_acesso
- **FR-013**: O Dialog DEVE ter seção "Histórico de Sync" na parte inferior, mostrando até 10 entradas com: Data/Hora, Modo, Status (com badge colorido), Campanhas atualizadas, Duração calculada
- **FR-014**: O componente de edição DEVE ser extraído para `src/components/administracao/contas-ads/editar-conta-dialog.tsx`

**Frontend — Tabela:**

- **FR-015**: A coluna "Última Atualização" DEVE exibir ícone visual de status: ✓ (sucesso), ⚠ (erro), ⏳ (cooldown), ▶ (executando)
- **FR-016**: A coluna "Período" DEVE exibir `periodo_sync_inicio` formatado como DD/MM/AAAA

### Key Entities

- **meta_sync_log**: Registro histórico de cada execução de sync — `id`, `ads_account_id`, `sync_mode`, `started_at`, `finished_at`, `status`, `stage_failed`, `error_message`, `campaigns_upserted`, `adsets_upserted`, `ads_upserted`, `insights_days`, `request_count`, `rate_limit_usage_pct`
- **meta_sync_states.watermarks**: JSON com `campaigns_updated_time`, `adsets_updated_time`, `ads_updated_time` (já existente, não modificado)
- **AdsAccount**: Conta de anúncios com `periodo_sync_inicio`, `sincronizado_em`, `sync_state` (join com `meta_sync_states`)

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O tempo total de uma rodada completa do scheduler (72 contas) reduz em pelo menos 50% após implementar sync incremental em condições normais (sem alterações massivas de catálogo)
- **SC-002**: Contas anteriormente presas (sem atualização por mais de 24h) passam a ser atualizadas em todas as rodadas do scheduler
- **SC-003**: O administrador consegue identificar em menos de 30 segundos, na tabela de contas, quais contas estão com problema de sync e qual o tipo do problema
- **SC-004**: O histórico de sync de qualquer conta é acessível em menos de 2 segundos
- **SC-005**: 100% das execuções de sync (sucesso, erro ou rate limit) são registradas em `meta_sync_log`
- **SC-006**: O dialog de edição abre em menos de 500ms incluindo o carregamento do histórico de sync

---

## Assumptions

- O parâmetro `updated_since` da Meta API funciona conforme documentação: retorna apenas itens com `updated_time > timestamp` para campaigns, adsets e ads
- As migrações Alembic seguem numeração sequencial (`052_`) a partir da última migration existente
- O frontend usa `Dialog` do Radix UI já instalado no projeto (não requer nova dependência)
- Contas que ficaram sem sync por mais de 24h terão watermarks desatualizados — a primeira rodada após o deploy ainda buscará apenas itens alterados desde o último watermark (o que é correto: não precisamos re-buscar o que já temos)
- O `request_count` em `meta_sync_log` é uma contagem incremental gerenciada pelo `MetaGraphClient` durante o sync
- Multi-tenancy não é afetado: `meta_sync_log` não precisa de `workspace_id` pois o acesso é controlado por `ads_account_id` que já tem `workspace_id`
