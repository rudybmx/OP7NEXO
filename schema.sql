-- =====================================================================
-- SCHEMA WER'SUN PLATAFORMA
-- =====================================================================
-- Este schema roda no mesmo banco do GoTrue (wersun), schema public.
-- GoTrue usa o schema 'auth' internamente.
-- =====================================================================

-- Organizacoes
CREATE TABLE IF NOT EXISTS public.organizacoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  slug        TEXT UNIQUE,
  cnpj        TEXT,
  logo_url    TEXT,
  status      TEXT DEFAULT 'ativo', -- ativo, suspenso, cancelado
  nivel_plano TEXT DEFAULT 'basico', -- basico, pro, enterprise
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Perfis de usuarios (extendem o auth do GoTrue)
CREATE TABLE IF NOT EXISTS public.perfis (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     UUID REFERENCES public.organizacoes(id) ON DELETE SET NULL,
  nome       TEXT,
  avatar_url TEXT,
  telefone   TEXT,
  nivel      INTEGER DEFAULT 99, -- 0=superadmin, 1=admin, 2=gerente, 3=estrategista, 4=basico
  cargo      TEXT,
  status     TEXT DEFAULT 'ativo',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contas Meta Ads (contas de anuncio vinculadas)
CREATE TABLE IF NOT EXISTS public.meta_contas (
  id                TEXT PRIMARY KEY,
  org_id            UUID REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome              TEXT NOT NULL,
  status            TEXT DEFAULT 'ACTIVE',
  saldo_inicial     NUMERIC(12,2) DEFAULT 0,
  moeda             TEXT DEFAULT 'BRL',
  timezone          TEXT DEFAULT 'America/Sao_Paulo',
  bm_name           TEXT,
  is_prepay_account BOOLEAN DEFAULT false,
  funding_source    TEXT,
  access_token      TEXT, -- criptografar em prod
  refresh_token     TEXT, -- criptografar em prod
  token_expires_at  TIMESTAMPTZ,
  last_sync_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Campanhas Meta Ads
CREATE TABLE IF NOT EXISTS public.meta_campanhas (
  id              TEXT PRIMARY KEY,
  conta_id        TEXT REFERENCES public.meta_contas(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  nome_abreviado  TEXT,
  objetivo        TEXT,
  status          TEXT DEFAULT 'ACTIVE',
  orcamento_diario NUMERIC(12,2),
  orcamento_total NUMERIC(12,2),
  data_inicio     DATE,
  data_fim        DATE,
  plataformas     TEXT[], -- ['facebook', 'instagram', 'whatsapp']
  meta_leads      INTEGER,
  meta_cpl        NUMERIC(12,2),
  indice_desempenho NUMERIC(5,2),
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Conjuntos de anuncios (Ad Sets)
CREATE TABLE IF NOT EXISTS public.meta_conjuntos (
  id              TEXT PRIMARY KEY,
  campanha_id     TEXT REFERENCES public.meta_campanhas(id) ON DELETE CASCADE,
  conta_id        TEXT REFERENCES public.meta_contas(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  status          TEXT DEFAULT 'ACTIVE',
  orcamento_diario NUMERIC(12,2),
  publico_alvo    TEXT,
  posicionamento  TEXT[],
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Anuncios (Ads)
CREATE TABLE IF NOT EXISTS public.meta_anuncios (
  id              TEXT PRIMARY KEY,
  conjunto_id     TEXT REFERENCES public.meta_conjuntos(id) ON DELETE CASCADE,
  campanha_id     TEXT REFERENCES public.meta_campanhas(id) ON DELETE CASCADE,
  conta_id        TEXT REFERENCES public.meta_contas(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  campanha_nome   TEXT,
  conjunto_nome   TEXT,
  tipo            TEXT, -- IMAGE, VIDEO, CAROUSEL
  status          TEXT DEFAULT 'ACTIVE',
  thumbnail_url   TEXT,
  cor_fundo       TEXT,
  copy_principal  TEXT,
  cta             TEXT,
  url_destino     TEXT,
  score           INTEGER, -- 0-100 calculado
  tendencia       TEXT, -- subindo, estavel, caindo
  dias_ativo      INTEGER,
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Criativos (midias reutilizaveis)
CREATE TABLE IF NOT EXISTS public.meta_criativos (
  id              TEXT PRIMARY KEY,
  org_id          UUID REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  tipo            TEXT, -- IMAGE, VIDEO, CAROUSEL
  hash            TEXT UNIQUE, -- hash do arquivo
  thumbnail_url   TEXT,
  video_url       TEXT,
  duracao_seg     INTEGER,
  status_criativo TEXT DEFAULT 'novo', -- novo, evergreen, atencao, fadiga
  dias_ativo      INTEGER,
  campanhas_count INTEGER DEFAULT 0,
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Relacionamento criativos <-> anuncios
CREATE TABLE IF NOT EXISTS public.meta_anuncio_criativos (
  anuncio_id  TEXT REFERENCES public.meta_anuncios(id) ON DELETE CASCADE,
  criativo_id TEXT REFERENCES public.meta_criativos(id) ON DELETE CASCADE,
  PRIMARY KEY (anuncio_id, criativo_id)
);

-- Publicos (Audiencias)
CREATE TABLE IF NOT EXISTS public.meta_publicos (
  id           TEXT PRIMARY KEY,
  conta_id     TEXT REFERENCES public.meta_contas(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  tipo         TEXT, -- lookalike, saved, custom, special
  tamanho      INTEGER,
  descricao    TEXT,
  last_sync_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Insights diarios (metricas agregadas por dia)
CREATE TABLE IF NOT EXISTS public.meta_insights_diarios (
  id            BIGSERIAL PRIMARY KEY,
  conta_id      TEXT REFERENCES public.meta_contas(id) ON DELETE CASCADE,
  campanha_id   TEXT REFERENCES public.meta_campanhas(id) ON DELETE CASCADE,
  conjunto_id   TEXT REFERENCES public.meta_conjuntos(id) ON DELETE CASCADE,
  anuncio_id    TEXT REFERENCES public.meta_anuncios(id) ON DELETE CASCADE,
  data          DATE NOT NULL,
  impressoes    INTEGER DEFAULT 0,
  alcance       INTEGER DEFAULT 0,
  cliques       INTEGER DEFAULT 0,
  gasto         NUMERIC(12,2) DEFAULT 0,
  leads         INTEGER DEFAULT 0,
  leads_msg     INTEGER DEFAULT 0,
  leads_cad     INTEGER DEFAULT 0,
  leads_compra  INTEGER DEFAULT 0,
  ctr           NUMERIC(8,4) DEFAULT 0,
  cpc           NUMERIC(12,4) DEFAULT 0,
  cpm           NUMERIC(12,4) DEFAULT 0,
  cpl           NUMERIC(12,4) DEFAULT 0,
  frequencia    NUMERIC(8,4) DEFAULT 0,
  video_views_3s  INTEGER DEFAULT 0,
  video_views_15s INTEGER DEFAULT 0,
  video_thruplays INTEGER DEFAULT 0,
  hook_rate     NUMERIC(8,4) DEFAULT 0,
  hold_rate     NUMERIC(8,4) DEFAULT 0,
  UNIQUE NULLS NOT DISTINCT (conta_id, campanha_id, conjunto_id, anuncio_id, data)
);

-- CRM: Leads
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  email         TEXT,
  telefone      TEXT,
  origem        TEXT, -- meta_ads, google_ads, organico, indicacao
  campanha_id   TEXT,
  anuncio_id    TEXT,
  criativo_id   TEXT,
  valor_estimado NUMERIC(12,2),
  status        TEXT DEFAULT 'novo', -- novo, contatado, qualificado, proposta, ganho, perdido
  responsavel_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  etiquetas     TEXT[],
  notas         TEXT,
  data_entrada  TIMESTAMPTZ DEFAULT NOW(),
  data_conversao TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- CRM: Atividades (followup)
CREATE TABLE IF NOT EXISTS public.crm_atividades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  org_id      UUID REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL, -- ligacao, email, whatsapp, reuniao, nota
  descricao   TEXT,
  resultado   TEXT, -- atendeu, caixa_postal, nao_atendeu, agendado, etc
  data_agendada TIMESTAMPTZ,
  realizada   BOOLEAN DEFAULT false,
  created_by  UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Agendamentos
CREATE TABLE IF NOT EXISTS public.agenda_eventos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL,
  descricao   TEXT,
  tipo        TEXT DEFAULT 'reuniao', -- reuniao, ligacao, deadline, evento
  inicio      TIMESTAMPTZ NOT NULL,
  fim         TIMESTAMPTZ,
  responsavel_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  lead_id     UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  status      TEXT DEFAULT 'agendado', -- agendado, confirmado, cancelado, realizado
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Demandas (tickets/kanban)
CREATE TABLE IF NOT EXISTS public.demandas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL,
  descricao   TEXT,
  status      TEXT DEFAULT 'backlog', -- backlog, todo, doing, review, done
  prioridade  TEXT DEFAULT 'media', -- baixa, media, alta, urgente
  solicitante_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  responsavel_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  etiquetas   TEXT[],
  prazo       DATE,
  concluida_em TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- VIEWS PARA DASHBOARDS (substituem as views do PostgREST externo)
-- =====================================================================

-- View: resumo da conta Meta Ads
CREATE OR REPLACE VIEW public.vw_meta_account_summary AS
SELECT
  mc.id AS conta_id,
  SUM(mid.gasto) AS total_spend,
  SUM(mid.leads) AS total_leads,
  SUM(mid.impressoes) AS total_impressions,
  SUM(mid.alcance) AS total_reach,
  SUM(mid.cliques) AS total_clicks,
  CASE WHEN SUM(mid.impressoes) > 0 THEN ROUND((SUM(mid.cliques)::NUMERIC / SUM(mid.impressoes)) * 100, 4) ELSE 0 END AS avg_ctr,
  CASE WHEN SUM(mid.cliques) > 0 THEN ROUND(SUM(mid.gasto) / SUM(mid.cliques), 4) ELSE 0 END AS avg_cpc,
  CASE WHEN SUM(mid.impressoes) > 0 THEN ROUND((SUM(mid.gasto) / SUM(mid.impressoes)) * 1000, 4) ELSE 0 END AS avg_cpm,
  CASE WHEN SUM(mid.leads) > 0 THEN ROUND(SUM(mid.gasto) / SUM(mid.leads), 4) ELSE 0 END AS avg_cpl
FROM public.meta_contas mc
LEFT JOIN public.meta_insights_diarios mid ON mid.conta_id = mc.id
WHERE mid.data >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY mc.id;

-- View: financeiro da conta
CREATE OR REPLACE VIEW public.vw_meta_account_financeiro AS
SELECT
  id AS conta_id,
  is_prepay_account,
  saldo_inicial AS balance,
  0::NUMERIC AS amount_spent, -- preencher via API futuramente
  0::NUMERIC AS spend_cap,    -- preencher via API futuramente
  funding_source AS funding_source_type,
  funding_source AS funding_source_details,
  bm_name
FROM public.meta_contas;

-- =====================================================================
-- INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_perfis_org ON public.perfis(org_id);
CREATE INDEX IF NOT EXISTS idx_perfis_nivel ON public.perfis(nivel);
CREATE INDEX IF NOT EXISTS idx_meta_campanhas_conta ON public.meta_campanhas(conta_id);
CREATE INDEX IF NOT EXISTS idx_meta_conjuntos_campanha ON public.meta_conjuntos(campanha_id);
CREATE INDEX IF NOT EXISTS idx_meta_anuncios_conjunto ON public.meta_anuncios(conjunto_id);
CREATE INDEX IF NOT EXISTS idx_meta_anuncios_campanha ON public.meta_anuncios(campanha_id);
CREATE INDEX IF NOT EXISTS idx_insights_diarios_data ON public.meta_insights_diarios(data);
CREATE INDEX IF NOT EXISTS idx_insights_diarios_conta_data ON public.meta_insights_diarios(conta_id, data);
CREATE INDEX IF NOT EXISTS idx_crm_leads_org ON public.crm_leads(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON public.crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_responsavel ON public.crm_leads(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_crm_atividades_lead ON public.crm_atividades(lead_id);
CREATE INDEX IF NOT EXISTS idx_agenda_inicio ON public.agenda_eventos(inicio);
CREATE INDEX IF NOT EXISTS idx_demandas_org ON public.demandas(org_id);
CREATE INDEX IF NOT EXISTS idx_demandas_status ON public.demandas(status);
