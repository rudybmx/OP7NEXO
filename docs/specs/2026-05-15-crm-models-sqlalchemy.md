# CRM WhatsApp — Models SQLAlchemy (Fase 1.1)

## Objective

Criar models SQLAlchemy 2.0 para todas as tabelas CRM WhatsApp existentes no banco, permitindo o backend Python acessá-las via ORM em vez de SQL raw. Isso é pré-requisito para centralizar a lógica de conversas/mensagens/contatos no backend e remover o acesso direto ao PostgreSQL pelo frontend Next.js.

## Current State

- As tabelas `crm_whatsapp_*` existem no PostgreSQL (criadas via SQL manual no frontend).
- O backend Python (`app/api/canais.py`) acessa essas tabelas **exclusivamente via SQL raw** (`sqlalchemy.text`).
- Não há models ORM para essas tabelas — perde-se type safety, validação, relacionamentos e manutenção.
- O schema está fragmentado entre duas versões (`workspace_id` vs `org_id`). A versão da API Alembic (027) confirma `workspace_id` como padrão.

## Scope

### In scope:
- Criar models SQLAlchemy para: `Contato`, `Conversa`, `Mensagem`, `Equipe`, `EquipeMembro`, `Permissao`, `Midia`, `Evento`, `MemoriaIA`.
- Usar `workspace_id` como tenant ID (padrão da API).
- Adicionar campo `ativo` (soft delete) em todas as tabelas principais.
- Adicionar campos de SLA (`first_response_at`, `assigned_at`, `closed_at`, `resolution_time`) em `Conversa`.
- Adicionar `wa_status` e timestamps de entrega em `Mensagem`.
- Adicionar `mensagem_id` FK em `Midia`.
- Criar migration Alembic evolutiva (não-destrutiva).
- Criar arquivo `__init__.py` em `app/models/` exportando todos os novos models.

### Out of scope:
- Endpoints REST (Fase 1.3).
- Refatoração do frontend proxy (Fase 1.4).
- Meta Cloud API (Fase 3).
- IA automática (Fase 4).

## Behavior Rules

1. Toda tabela de dados tem `workspace_id UUID` com FK para `workspaces.id`.
2. Soft delete padrão: `ativo BOOLEAN DEFAULT true` em todas as tabelas principais.
3. `deleted_at` opcional para auditoria (sem trigger, apenas campo).
4. Enum de status da conversa: `nova`, `em_atendimento`, `aguardando`, `resolvido`, `arquivada`.
5. Enum de status da mensagem WhatsApp: `pending`, `sent`, `delivered`, `read`, `failed`.
6. Enum de direção: `entrada`, `saida`.
7. Enum de tipo de remetente: `contato`, `agente`, `ia`, `sistema`.
8. `wa_id` (jid) deve ser único por `workspace_id`.
9. Relacionamentos ORM devem usar `back_populates` e `lazy="select"` para evitar queries implícitas pesadas.

## Inputs and Outputs

- Inputs: Migration Alembic + models Python.
- Outputs: Tabelas existentes no PostgreSQL com colunas novas adicionadas. Models importáveis em `app.models`.

## Error Cases

- Migration falha se houver conflito de constraint UNIQUE existente.
- Coluna nova com `NOT NULL` sem default quebra em tabelas com dados existentes.

## Acceptance Criteria

- [ ] Todos os models são criados em `app/models/crm/`
- [ ] Migration `030_crm_models.py` é criada e revisada (sem `DROP` nem `DELETE`)
- [ ] `alembic upgrade head` aplica sem erro no banco de produção
- [ ] Models podem ser importados via `from app.models import Contato, Conversa, Mensagem, ...`
- [ ] Campos `ativo` e `deleted_at` presentes nas tabelas principais
- [ ] `workspace_id` usado consistentemente (não `org_id`)

## Test Plan

- Manual: rodar `alembic upgrade head` localmente e verificar schema no psql (`\d crm_whatsapp_conversas`)
- Automated: verificar se `from app.models.crm import Conversa` não levanta exceção
- Verificar se relacionamentos ORM funcionam (`Conversa.mensagens`, `Contato.conversas`)

## Open Questions

- None
