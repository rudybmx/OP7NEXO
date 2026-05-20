# Administração — Gestão da Plataforma

## Objetivo
Área administrativa para gerenciar usuários, canais de comunicação, contas de anúncios e empresas. Acesso restrito por role.

## Estado atual
Usuários, Canais, Contas Ads: **Produção**. Empresas: **Em desenvolvimento**.

## Escopo
- In scope: usuários, canais omnichannel, contas de anúncios, empresas
- Out of scope: billing, planos (estrutura preparada)

## Rotas
```
/administracao/usuarios              — gestão de usuários
/administracao/canais-omnichannel    — gestão de canais WhatsApp/webhook
/administracao/contas-ads            — gestão de contas Meta Ads
/administracao/empresas/*            — planos, financeiro, auditoria, relatórios
/admin/tokens                        — tokens Meta Ads globais (platform_admin)
/admin/usuarios                      — usuários admin
/admin/organizacoes                  — organizações
```

## Regras de comportamento

### Usuários
- Listagem filtrada por role: `platform_admin` vê todos, `company_admin` vê só do workspace
- Criação: `POST /usuarios` ou `POST /auth/registro-usuario`
- Campos: nome, email, senha, role, workspace_id
- Soft delete: `ativo = false`

### Canais Omnichannel
- Lista todos os canais do workspace
- Criação: tipo + nome + config específica do canal
- WhatsApp Evolution: após criar, exibe QR Code para conexão
- Status visual: ativo (verde) / inativo (cinza)

### Contas de Anúncios
- Lista contas Meta Ads do workspace
- Botões: Sincronizar (manual), Ativar/Desativar (toggle)
- Sync mostra progress bar durante execução
- Status da conta: mapeado do `account_status` da Meta API (1=ativo)
- Toggle via `ativo` no banco

### Tokens Meta Ads (platform_admin)
- Tokens globais — sem filtro de workspace
- Status visual: verde / amarelo (<30 dias para expirar) / vermelho (expirado)
- Listagem em dropdown ao cadastrar conta de anúncio

## Padrões técnicos
- Rotas: `src/app/(plataforma)/administracao/*/page.tsx`
- Componentes: `src/components/` por módulo
- Todas as chamadas via `/api/proxy` → API Python

## Critérios de aceite
- [x] Lista de usuários filtrada por role
- [x] Criação de usuário com workspace vinculado
- [x] Canais exibem QR Code para WhatsApp Evolution
- [x] Contas Ads com sync manual e toggle ativo/inativo
- [x] Tokens globais sem filtro de workspace
- [ ] Empresas — planos, financeiro, auditoria (em desenvolvimento)

## Open Questions
- Qual o MVP das páginas de Empresas para ir a produção?
