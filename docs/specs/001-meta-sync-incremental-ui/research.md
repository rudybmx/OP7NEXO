# Research: Meta Sync Incremental + UI Contas-Ads

**Date**: 2026-06-05
**Branch**: `001-meta-sync-incremental-ui`

---

## Decision 1: Parâmetro `updated_since` na Meta API

**Decision**: Usar `updated_since` (integer unix timestamp) nos endpoints de catálogo.

**Rationale**: A documentação oficial da Meta Marketing API v25.0 confirma o parâmetro `updated_since` para `/act_X/ads`. Para `/campaigns` e `/adsets`, a API aceita o parâmetro como filtro de tempo de atualização (comportamento documentado e testado por integradores de mercado).

**Alternatives considered**:
- `filtering=[{"field":"updated_time","operator":"GREATER_THAN","value":ts}]` — parâmetro de filtering complexo; `updated_since` é mais simples e nativo
- Buscar tudo e comparar localmente — elimina API calls extras mas mantém tráfego de rede alto
- Usar `since`/`until` — esses parâmetros são para time_range de insights, não para updated_time de objetos

**Implementation note**: Quando `updated_since` retorna lista vazia (sem itens alterados), o watermark existente é mantido inalterado — não sobrescrevemos com null.

---

## Decision 2: Numeração da Migration

**Decision**: `053_meta_sync_log.py`

**Rationale**: A última migration existente é `052_resolver_lids_historicos.py`. A nova migration para `meta_sync_log` deve ser sequencialmente `053`.

---

## Decision 3: Rastreamento de `request_count`

**Decision**: Adicionar contador `_request_count: int = 0` ao `MetaGraphClient` (incrementado em cada chamada `get()`), exposto via property `request_count`. Em `_sincronizar_conta_impl`, salvar em `totais["api_requests"]` ao final.

**Rationale**: `MetaGraphClient` já é o ponto central de todas as chamadas HTTP à Meta API. Adicionar um contador simples é mínimo e não invasivo. Alternativa de contar via `totais` nos callers seria dispersa e incompleta.

**Alternatives considered**:
- Omitir `request_count` do log — perde diagnóstico valioso de rate limit
- Contar no scheduler — não cobre syncs manuais

---

## Decision 4: Estrutura do `meta_sync_log` vs `meta_sync_states`

**Decision**: Tabela separada `meta_sync_log` para histórico; `meta_sync_states` continua como "último estado" (não alterado).

**Rationale**: `meta_sync_states` tem UNIQUE por conta e serve a queries de "estado atual" — alterar seria breaking change. O log histórico é append-only e precisa de múltiplos registros por conta.

---

## Decision 5: Dialog Centralizado — componente a reutilizar

**Decision**: Usar `Dialog` + `DialogContent` do Radix UI já instalado em `src/components/ui/dialog.tsx`. Extrair para `src/components/administracao/contas-ads/editar-conta-dialog.tsx`.

**Rationale**: O padrão já existe em `src/components/administracao/canais/editar-canal-dialog.tsx`. Reutilizar o mesmo componente `Dialog` mantém consistência visual e evita nova dependência.

**Alternatives considered**:
- Manter Sheet e apenas centralizar com CSS — não é o padrão visual do sistema
- Usar `AlertDialog` — semântica incorreta para formulário de edição

---

## Decision 6: Acesso ao histórico no frontend

**Decision**: Carregar histórico de sync via `GET /meta/sync/historico/{id}` ao abrir o dialog de edição (lazy load, não antecipado).

**Rationale**: Carregar ao abrir evita requests desnecessários na listagem de 72 contas. O histórico é consultado pontualmente, não em bulk.

---

## Resolved: Watermark com zero itens retornados

Se `updated_since` retornar lista vazia, os watermarks não são atualizados (mantém o timestamp anterior). Isso é correto: se nada mudou, o watermark continua válido para a próxima rodada.

## Resolved: Multi-tenancy do meta_sync_log

`meta_sync_log` não precisa de `workspace_id` diretamente — o isolamento é garantido pelo `ads_account_id` que já está vinculado a um `workspace_id`. Os endpoints que retornam histórico devem verificar que a conta pertence ao workspace do usuário autenticado (igual ao padrão atual de `meta_sync_states`).
