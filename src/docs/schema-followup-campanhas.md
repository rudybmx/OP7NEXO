# Odontocompany by Op7 — Schema Follow-up & Recorrência
Este documento contém o schema SQL completo para as tabelas de Follow-up, Recorrência e Campanhas na plataforma Odontocompany by Op7.

---

## Estrutura de Tabelas (PostgreSQL 16)

```sql
-- ═══════════════════════════════════════
-- FOLLOW-UP CONFIG (templates de cadência)
-- ═══════════════════════════════════════
CREATE TABLE followup_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  -- Cadência
  cadencia_tipo TEXT NOT NULL CHECK (cadencia_tipo IN ('diario','dias_alternados','semanal','personalizado')),
  cadencia_intervalo_dias INTEGER,  -- só para 'personalizado'
  cadencia_horario_envio TIME NOT NULL DEFAULT '09:00',
  max_tentativas INTEGER NOT NULL DEFAULT 8,
  canal TEXT NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp','email','sms')),
  -- Escopo
  aplicar_para TEXT NOT NULL DEFAULT 'todos' CHECK (aplicar_para IN ('todos','agenda')),
  agenda_ids UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- FOLLOW-UP MENSAGENS (templates por config)
-- ═══════════════════════════════════════
CREATE TABLE followup_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_config_id UUID NOT NULL REFERENCES followup_configs(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  conteudo TEXT NOT NULL,
  tem_midia BOOLEAN NOT NULL DEFAULT false,
  midia_url TEXT,
  midia_tipo TEXT CHECK (midia_tipo IN ('imagem','video','documento')),
  delay_extra_dias INTEGER NOT NULL DEFAULT 0
);

-- ═══════════════════════════════════════
-- LEADS / FOLLOW-UP STATE
-- ═══════════════════════════════════════
CREATE TABLE followup_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  -- Identificação
  nome TEXT,
  telefone TEXT NOT NULL,
  email TEXT,
  -- Origem / UTM
  origem TEXT NOT NULL DEFAULT 'outro' CHECK (origem IN (
    'meta_ads','google_ads','linkedin_ads','tiktok_ads',
    'whatsapp','indicacao','offline','organico','outro'
  )),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  campanha_id UUID REFERENCES campanhas(id),
  -- Follow-up
  followup_config_id UUID REFERENCES followup_configs(id),
  status_followup TEXT NOT NULL DEFAULT 'ativo' CHECK (status_followup IN (
    'ativo','vencido','respondeu','encerrado','esgotado','pausado'
  )),
  tentativa_atual INTEGER NOT NULL DEFAULT 0,
  max_tentativas INTEGER NOT NULL DEFAULT 8,
  proximo_envio TIMESTAMPTZ,
  ultimo_contato TIMESTAMPTZ,
  ultimo_resumo TEXT,
  -- Temperatura / Interesse
  temperatura TEXT CHECK (temperatura IN ('quente','morno','frio')),
  interesse TEXT,
  status_fechamento TEXT NOT NULL DEFAULT 'em_aberto' CHECK (status_fechamento IN (
    'em_aberto','ganho','perca','perdido','reagendado'
  )),
  -- Integração
  session_id TEXT,                  -- sessão no CRM de Atendimento
  agente_id TEXT,                   -- agente IA responsável
  agendamento_id UUID,              -- referência se converteu
  -- Recorrência
  recorrencia_ativa BOOLEAN NOT NULL DEFAULT false,
  recorrencia_config_id UUID,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- FILA DE EXECUÇÃO (gatilhos de disparo)
-- ═══════════════════════════════════════
CREATE TABLE followup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  followup_lead_id UUID NOT NULL REFERENCES followup_leads(id) ON DELETE CASCADE,
  mensagem_id UUID REFERENCES followup_mensagens(id),
  tentativa_numero INTEGER NOT NULL,
  agendado_para TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente',    -- aguardando execução
    'processando', -- sendo executado agora
    'enviado',     -- disparado com sucesso
    'falhou',      -- erro no envio
    'cancelado'    -- cancelado antes de enviar
  )),
  tentativas_envio INTEGER NOT NULL DEFAULT 0,  -- retries
  erro_detalhes TEXT,
  enviado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- HISTÓRICO DE DISPAROS
-- ═══════════════════════════════════════
CREATE TABLE followup_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  followup_lead_id UUID NOT NULL REFERENCES followup_leads(id),
  tentativa_numero INTEGER NOT NULL,
  canal TEXT NOT NULL,
  conteudo_enviado TEXT,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  houve_resposta BOOLEAN NOT NULL DEFAULT false,
  resposta_em TIMESTAMPTZ,
  resumo_resposta TEXT
);

-- ═══════════════════════════════════════
-- RECORRÊNCIA CONFIGS
-- ═══════════════════════════════════════
CREATE TABLE recorrencia_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  trigger_tipo TEXT NOT NULL CHECK (trigger_tipo IN (
    'pos_comparecimento','pos_procedimento','aniversario','data_fixa'
  )),
  dias_apos_trigger INTEGER NOT NULL DEFAULT 180,
  filtro_servico TEXT,
  filtro_agenda_ids UUID[],
  -- Cadência (igual ao followup)
  cadencia_tipo TEXT NOT NULL DEFAULT 'semanal',
  cadencia_horario_envio TIME NOT NULL DEFAULT '09:00',
  max_tentativas INTEGER NOT NULL DEFAULT 5,
  canal TEXT NOT NULL DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE recorrencia_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorrencia_config_id UUID NOT NULL REFERENCES recorrencia_configs(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  conteudo TEXT NOT NULL,
  tem_midia BOOLEAN NOT NULL DEFAULT false,
  midia_url TEXT,
  delay_extra_dias INTEGER NOT NULL DEFAULT 0
);

-- ═══════════════════════════════════════
-- RECORRÊNCIA LEADS (leads alocados)
-- ═══════════════════════════════════════
CREATE TABLE recorrencia_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  followup_lead_id UUID REFERENCES followup_leads(id),
  agendamento_id UUID NOT NULL REFERENCES agendamentos(id),
  recorrencia_config_id UUID NOT NULL REFERENCES recorrencia_configs(id),
  nome TEXT,
  telefone TEXT NOT NULL,
  interesse TEXT,
  agenda_nome TEXT,
  data_comparecimento DATE NOT NULL,
  data_trigger_programada DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN (
    'aguardando','ativo','concluido','cancelado'
  )),
  tentativa_atual INTEGER NOT NULL DEFAULT 0,
  proximo_envio TIMESTAMPTZ,
  ultimo_contato TIMESTAMPTZ,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- CAMPANHAS
-- ═══════════════════════════════════════
CREATE TABLE campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  nome TEXT NOT NULL,
  plataforma TEXT NOT NULL CHECK (plataforma IN (
    'meta','google','linkedin','tiktok','whatsapp','offline','organico','outro'
  )),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,           -- identificador principal para cruzar com leads
  utm_content TEXT,
  custo_total NUMERIC(10,2),
  ativo BOOLEAN NOT NULL DEFAULT true,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- RLS (Row Level Security)
-- ═══════════════════════════════════════
ALTER TABLE followup_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrencia_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrencia_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrencia_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanhas ENABLE ROW LEVEL SECURITY;

-- Política padrão Odontocompany by Op7 (org_id via JWT claim)
-- Repetir para cada tabela acima:
CREATE POLICY "org_isolation" ON followup_leads
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- ═══════════════════════════════════════
-- ÍNDICES
-- ═══════════════════════════════════════
CREATE INDEX idx_followup_leads_org_status ON followup_leads(org_id, status_followup);
CREATE INDEX idx_followup_leads_proximo_envio ON followup_leads(proximo_envio) WHERE status_followup IN ('ativo','vencido');
CREATE INDEX idx_followup_leads_utm ON followup_leads(utm_campaign, org_id);
CREATE INDEX idx_followup_queue_agendado ON followup_queue(agendado_para) WHERE status = 'pendente';
CREATE INDEX idx_recorrencia_leads_trigger ON recorrencia_leads(data_trigger_programada) WHERE status = 'aguardando';
CREATE INDEX idx_campanhas_utm ON campanhas(utm_campaign, org_id);
```
