# SPEC — Feature: Plano de Marketing Personalizado (PMP) v2
**Feature ID:** 001  
**Status:** Em especificação  
**Data:** 2026-05-14  
**Autor:** Rudy (CTO)  
**Agente alvo:** Dev Agent (VPS)

---

## 1. Visão Geral

### Problema
O estrategista faz reuniões mensais com clientes e planeja ações de marketing (tráfego pago, eventos, conteúdo, etc.), mas hoje não existe um sistema estruturado para:
- Lançar esse planejamento de forma rápida e padronizada
- Acompanhar execução sem depender de planilhas ou WhatsApp
- Gerar alertas proativos quando algo está atrasado ou em risco

### Solução
Evoluir a tela de PMP existente com:
1. **Criação simplificada de tarefas** (form minimalista)
2. **Sistema de status em 3 estados** (sem complexidade desnecessária)
3. **Engine de lembretes automáticos** (D-3, D-1, vencido, semanal)
4. **Insights de IA** atualizados em tempo real por tarefa/fase
5. **Check-in de progresso** em 1 clique pelo responsável

---

## 2. Usuários e Papéis

| Papel | Ações permitidas |
|---|---|
| **Estrategista** | Criar, editar, excluir tarefas; atribuir responsável; definir datas; adicionar contexto/categoria |
| **Responsável** | Atualizar status da própria tarefa; fazer check-in de progresso; adicionar comentário de bloqueio |
| **Gestor / Admin** | Visualizar todos os planos; exportar PDF; ver histórico; receber digest semanal |

---

## 3. User Stories

### US1 — Criação Rápida de Tarefa (Estrategista)
```
Como estrategista,
Quero criar uma tarefa em menos de 30 segundos,
Para que o planejamento da reunião seja registrado sem fricção.
```
**Critérios de aceite:**
- [ ] Botão "+ Nova Tarefa" sempre visível na tela PMP
- [ ] Modal com campos: Título (obrigatório), Descrição (opcional), Responsável (obrigatório), Data Início (obrigatório), Data Fim (obrigatório), Categoria (obrigatório), Fase (obrigatório)
- [ ] Criar com Enter / botão Salvar
- [ ] Tarefa aparece imediatamente no Gantt e na lista
- [ ] Status inicial sempre = "A Fazer"

### US2 — Atualização de Status Simples (Responsável)
```
Como responsável por uma tarefa,
Quero atualizar o status com 1 clique,
Para que o plano reflita a realidade sem burocracia.
```
**Critérios de aceite:**
- [ ] Status com 3 estados apenas: `A Fazer` → `Em Andamento` → `Concluída`
- [ ] Estado especial `Bloqueada` acessível via menu contextual (não no fluxo principal)
- [ ] Ao marcar `Concluída`, confirmar com data de conclusão (pré-preenchida = hoje)
- [ ] Ao marcar `Bloqueada`, exigir campo texto: "Motivo do bloqueio" (obrigatório)
- [ ] Mudança de status salva sem reload de página

### US3 — Lembretes Automáticos (Engine)
```
Como estrategista,
Quero que o sistema avise automaticamente sobre tarefas próximas do prazo,
Para que eu não precise ficar monitorando manualmente.
```
**Critérios de aceite:**
- [ ] Sistema envia notificação interna (in-app) nos eventos:
  - `D-3` da data fim: "⚠️ [Tarefa X] vence em 3 dias"
  - `D-1` da data fim: "🔴 [Tarefa X] vence amanhã"
  - `D+0` (dia do vencimento): "🚨 [Tarefa X] vence hoje"
  - `D+1` (vencida): "❌ [Tarefa X] está atrasada" — dispara 1x/dia até ser concluída ou bloqueada
- [ ] Notificações enviadas para: Responsável + Estrategista do cliente
- [ ] Canal primário: notificação in-app (badge + toast)
- [ ] Canal secundário (configurável): e-mail, WhatsApp (via integração existente no app)

### US4 — Pulso Semanal de Check-in (Responsável)
```
Como responsável,
Quero receber um resumo semanal das minhas tarefas abertas,
Para que eu possa confirmar progresso ou sinalizar bloqueios de forma rápida.
```
**Critérios de aceite:**
- [ ] Todo domingo 18h, cada responsável recebe lista de suas tarefas abertas da semana seguinte
- [ ] Interface de check-in: card por tarefa com 3 botões: `✅ Em dia` / `⚠️ Precisa de atenção` / `🚫 Bloqueada`
- [ ] Respostas registradas no histórico da tarefa
- [ ] Se responsável não responder ao pulso em 24h → notificação para o estrategista

### US5 — Insights de IA por Plano
```
Como estrategista,
Quero receber insights automáticos sobre o plano do cliente,
Para que eu identifique riscos e oportunidades sem análise manual.
```
**Critérios de aceite:**
- [ ] Seção "Insights da IA" atualiza ao abrir o plano (máx. 3 insights)
- [ ] Tipos de insight:
  - **Alerta**: tarefa atrasada em fase crítica / dependência quebrada
  - **Oportunidade**: fase adiantada / tarefa concluída antes do prazo
  - **Risco**: múltiplas tarefas com prazo na mesma semana / responsável sobrecarregado
- [ ] Cada insight com link direto para a tarefa/fase relevante
- [ ] Insights gerados por IA (Claude API) com contexto do plano atual

### US6 — Visão Geral do Mês (Estrategista / Gestor)
```
Como estrategista,
Quero uma visão consolidada do mês do cliente com progresso real,
Para que eu chegue na próxima reunião preparado.
```
**Critérios de aceite:**
- [ ] Tab "Resumo" exibe: % concluído, tarefas por status, tarefas em risco
- [ ] Linha do tempo (Gantt) com filtros: Mês / Semana / Hoje
- [ ] KPIs no topo: Total, Concluídas, Em Andamento, Atrasadas, Progresso Geral
- [ ] Exportar PDF: gera snapshot do plano com status atual (disponível na tab Resumo e Plano Ativo)

---

## 4. Regras de Negócio

| ID | Regra |
|---|---|
| RN01 | Toda tarefa deve ter pelo menos: Título, Responsável, Data Fim e Categoria |
| RN02 | Data Início ≤ Data Fim (validação no frontend e backend) |
| RN03 | Tarefa só vai para "Concluída" se tiver data de conclusão registrada |
| RN04 | Tarefa "Bloqueada" congela os lembretes de D-1/D+1 mas mantém visibilidade no Gantt |
| RN05 | Insights de IA são somente-leitura; o estrategista não edita, apenas reage |
| RN06 | Pulso semanal só dispara se a tarefa tiver Data Fim dentro dos próximos 14 dias |
| RN07 | Responsável pode ser interno (usuário do sistema) ou externo (e-mail apenas) |
| RN08 | Cada tarefa pertence a exactamente 1 Fase e 1 Categoria |

---

## 5. Categorias de Tarefa (enum fixo, expansível)
```
MIDIA_PAGA | CONTEUDO | SEO | EVENTO | REUNIAO | EMAIL_MARKETING | SOCIAL | OUTRO
```

## 6. Fases do Plano (enum fixo, expansível)
```
DIAGNOSTICO | ESTRATEGIA | EXECUCAO | ANALISE | ENCERRAMENTO
```

---

## 7. Fora de Escopo (v2)
- Integração com ferramentas externas de gestão (Asana, Trello, etc.)
- Chat interno por tarefa (comentários sim, chat não)
- Aprovação de tarefas por hierarquia
- Relatório financeiro do plano
- Multi-idioma
