# PMP v2 — Spec-Driven Development Package
**Feature:** Plano de Marketing Personalizado  
**Versão:** 2.0  
**Data:** 2026-05-14

---

## Para o Agente Dev

### Ordem de leitura obrigatória:
1. `spec.md` — O QUE construir e POR QUÊ (user stories + regras de negócio)
2. `plan.md` — COMO construir (schema, APIs, componentes, lógica de jobs)
3. `tasks.md` — EXECUTE em ordem, fase por fase (A → B → C → D)

### Antes de qualquer código:
```
1. Ler os 3 arquivos completos
2. Mapear o schema atual do banco vs. o schema do plan.md
3. Listar diferenças e confirmar com Rudy se houver conflito
4. Iniciar pela Fase A — Core
```

### Não inicie a próxima fase sem:
- Todas as tasks da fase anterior com ✅
- Teste manual dos critérios de aceite das user stories da fase

### Variáveis de ambiente necessárias:
```env
ANTHROPIC_API_KEY=          # Para insights de IA (Fase B)
PMP_REMINDER_CRON="0 8 * * *"    # Diário 08h BRT
PMP_PULSE_CRON="0 18 * * 0"      # Domingo 18h BRT
PMP_PULSE_CHECK_CRON="0 8 * * 1" # Segunda 08h BRT
CHECKIN_TOKEN_SECRET=       # JWT secret para tokens de check-in
CHECKIN_TOKEN_EXPIRY="7d"
```

### Modelo Claude API a usar:
```
claude-sonnet-4-20250514
max_tokens: 1000
```

---

## Contexto do Produto

- App de gestão de marketing para ODCs (franquias)
- Estrategistas fazem reuniões mensais e planejam ações para clientes
- Responsáveis executam as tarefas e precisam de lembretes simples
- Gestores acompanham progresso via dashboard

## Princípios de Design da Feature

1. **Simples para o usuário final** — responsável não pode ter curva de aprendizado
2. **Inteligente nos bastidores** — IA e automações sem expor complexidade
3. **Feedback loop fechado** — toda tarefa criada tem um caminho claro até conclusão
4. **Mobile-first na tela de check-in** — responsável responde pelo celular
