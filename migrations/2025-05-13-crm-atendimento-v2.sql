-- =====================================================================
-- Migration 022: CRM Atendimento v2 - Schema Adaptado
-- =====================================================================
-- Banco: op7nexo (schema real da API Python/FastAPI)
-- Objetivo: Criar tabelas CRM WhatsApp + campos necessários em users
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. CAMPOS NOVOS EM users (para permissões de atendimento)
-- =====================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pode_atender_canais BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pode_acessar_crm BOOLEAN NOT NULL DEFAULT false;

-- =====================================================================
-- 2. TABELAS DE EQUIPE E PERMISSAO (RBAC)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_equipes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  nome                TEXT NOT NULL,
  descricao           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_equipe_membros (
  equipe_id           UUID NOT NULL REFERENCES public.crm_whatsapp_equipes(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  perfil              TEXT NOT NULL DEFAULT 'agente' CHECK (perfil IN ('admin','agente','viewer')),
  UNIQUE(equipe_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_permissoes (
  user_id                     UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  pode_ver_outras_equipes     BOOLEAN NOT NULL DEFAULT false,
  equipes_visiveis            UUID[] NOT NULL DEFAULT '{}'::uuid[]
);

-- =====================================================================
-- 3. CONTATOS WHATSAPP
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_contatos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  jid                 TEXT NOT NULL,
  telefone            TEXT,
  nome                TEXT,
  push_name           TEXT,
  avatar_url          TEXT,
  origem              TEXT NOT NULL DEFAULT 'evolution',
  tags                TEXT[] NOT NULL DEFAULT ARRAY['WhatsApp','Evolution'],
  perfil_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  resumo_ia           TEXT,
  sentimento_ia       TEXT,
  score_lead_ia       INTEGER CHECK (score_lead_ia IS NULL OR (score_lead_ia >= 0 AND score_lead_ia <= 100)),
  last_message_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(jid)
);

-- =====================================================================
-- 4. CONVERSAS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_conversas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  contato_id          UUID NOT NULL REFERENCES public.crm_whatsapp_contatos(id) ON DELETE CASCADE,
  instance            TEXT NOT NULL DEFAULT 'opcl',
  remote_jid          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'em_atendimento' CHECK (status IN ('nova','em_atendimento','aguardando','resgate','resolvido','processando')),
  ia_ativa            BOOLEAN NOT NULL DEFAULT true,
  responsavel_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  agente              TEXT NOT NULL DEFAULT 'Op7 Nexo',
  campanha            TEXT,
  etapa_funil         TEXT,
  prioridade          INTEGER NOT NULL DEFAULT 0,
  nao_lidas           INTEGER NOT NULL DEFAULT 0 CHECK (nao_lidas >= 0),
  ultima_mensagem     TEXT,
  ultima_direcao      TEXT CHECK (ultima_direcao IS NULL OR ultima_direcao IN ('entrada','saida')),
  ultima_msg_at       TIMESTAMPTZ,
  resumo_ia           TEXT,
  proximas_acoes_ia   JSONB NOT NULL DEFAULT '[]'::jsonb,
  contexto_ia         JSONB NOT NULL DEFAULT '{}'::jsonb,
  equipe_id           UUID REFERENCES public.crm_whatsapp_equipes(id) ON DELETE SET NULL,
  historico_transferencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(instance, remote_jid)
);

-- =====================================================================
-- 5. MENSAGENS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_mensagens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id       UUID NOT NULL REFERENCES public.crm_whatsapp_conversas(id) ON DELETE CASCADE,
  contato_id        UUID REFERENCES public.crm_whatsapp_contatos(id) ON DELETE SET NULL,
  evolution_msg_id  TEXT,
  instance          TEXT NOT NULL DEFAULT 'opcl',
  remote_jid        TEXT NOT NULL,
  direcao           TEXT NOT NULL CHECK (direcao IN ('entrada','saida')),
  from_me           BOOLEAN NOT NULL DEFAULT false,
  remetente_tipo    TEXT NOT NULL DEFAULT 'contato' CHECK (remetente_tipo IN ('contato','agente','ia','sistema')),
  remetente_nome    TEXT,
  conteudo          TEXT NOT NULL,
  message_type      TEXT NOT NULL DEFAULT 'text',
  status            TEXT,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  tokens_estimados  INTEGER,
  embedding_status  TEXT NOT NULL DEFAULT 'pendente' CHECK (embedding_status IN ('pendente','processado','ignorado','erro')),
  enviada_em        TIMESTAMPTZ,
  recebida_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_crm_whatsapp_mensagens_evolution_msg
  ON public.crm_whatsapp_mensagens(instance, evolution_msg_id)
  WHERE evolution_msg_id IS NOT NULL;

-- =====================================================================
-- 6. EVENTOS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_eventos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event           TEXT,
  instance        TEXT NOT NULL DEFAULT 'opcl',
  remote_jid      TEXT,
  evolution_msg_id TEXT,
  payload         JSONB NOT NULL,
  recebido_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 7. MIDIA
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_midia (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id     UUID NOT NULL REFERENCES public.crm_whatsapp_conversas(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL,
  minio_path      TEXT,
  url_publica     TEXT,
  mimetype        TEXT,
  tamanho         BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 8. MEMORIAS IA
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_whatsapp_memorias_ia (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id     UUID REFERENCES public.crm_whatsapp_conversas(id) ON DELETE CASCADE,
  contato_id      UUID REFERENCES public.crm_whatsapp_contatos(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'observacao',
  titulo          TEXT,
  conteudo        TEXT NOT NULL,
  confianca       NUMERIC(4,3) CHECK (confianca IS NULL OR (confianca >= 0 AND confianca <= 1)),
  fonte_msg_id    UUID REFERENCES public.crm_whatsapp_mensagens(id) ON DELETE SET NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ativa           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 9. TRIGGERS updated_at
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_whatsapp_contatos_updated_at ON public.crm_whatsapp_contatos;
CREATE TRIGGER trg_crm_whatsapp_contatos_updated_at
BEFORE UPDATE ON public.crm_whatsapp_contatos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_whatsapp_conversas_updated_at ON public.crm_whatsapp_conversas;
CREATE TRIGGER trg_crm_whatsapp_conversas_updated_at
BEFORE UPDATE ON public.crm_whatsapp_conversas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_whatsapp_memorias_ia_updated_at ON public.crm_whatsapp_memorias_ia;
CREATE TRIGGER trg_crm_whatsapp_memorias_ia_updated_at
BEFORE UPDATE ON public.crm_whatsapp_memorias_ia
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 10. INDICES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_users_atender ON public.users(pode_atender_canais);
CREATE INDEX IF NOT EXISTS idx_users_workspace ON public.users(workspace_id);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_equipes_workspace ON public.crm_whatsapp_equipes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_equipes_workspace_nome ON public.crm_whatsapp_equipes(workspace_id, nome);
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_equipe_membros_equipe ON public.crm_whatsapp_equipe_membros(equipe_id);
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_equipe_membros_user ON public.crm_whatsapp_equipe_membros(user_id);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_contatos_jid ON public.crm_whatsapp_contatos(jid);
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_contatos_telefone ON public.crm_whatsapp_contatos(telefone);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_conversas_ultima ON public.crm_whatsapp_conversas(ultima_msg_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_conversas_status ON public.crm_whatsapp_conversas(status, ultima_msg_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_conversas_equipe ON public.crm_whatsapp_conversas(equipe_id);
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_conversas_equipe_status ON public.crm_whatsapp_conversas(equipe_id, status, ultima_msg_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_conversas_responsavel ON public.crm_whatsapp_conversas(responsavel_id);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_mensagens_conversa_data ON public.crm_whatsapp_mensagens(conversa_id, COALESCE(enviada_em, recebida_em));
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_mensagens_remote_jid ON public.crm_whatsapp_mensagens(instance, remote_jid, COALESCE(enviada_em, recebida_em) DESC);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_midia_conversa ON public.crm_whatsapp_midia(conversa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_midia_conversa_tipo ON public.crm_whatsapp_midia(conversa_id, tipo);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_eventos_msg ON public.crm_whatsapp_eventos(instance, evolution_msg_id);

-- =====================================================================
-- 11. VIEW DE CONTEXTO PARA IA
-- =====================================================================

CREATE OR REPLACE VIEW public.vw_crm_whatsapp_contexto_ia AS
SELECT
  c.id AS conversa_id,
  c.instance,
  c.remote_jid,
  ct.telefone,
  COALESCE(ct.nome, ct.push_name, ct.telefone, ct.jid) AS contato_nome,
  c.status,
  c.ia_ativa,
  c.nao_lidas,
  c.ultima_mensagem,
  c.ultima_msg_at,
  c.resumo_ia AS resumo_conversa_ia,
  ct.resumo_ia AS resumo_contato_ia,
  ct.sentimento_ia,
  ct.score_lead_ia,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'direcao', m.direcao,
        'remetente', m.remetente_nome,
        'conteudo', m.conteudo,
        'quando', COALESCE(m.enviada_em, m.recebida_em)
      )
      ORDER BY COALESCE(m.enviada_em, m.recebida_em) DESC
    ) FILTER (WHERE m.id IS NOT NULL),
    '[]'::jsonb
  ) AS ultimas_mensagens
FROM public.crm_whatsapp_conversas c
JOIN public.crm_whatsapp_contatos ct ON ct.id = c.contato_id
LEFT JOIN LATERAL (
  SELECT *
  FROM public.crm_whatsapp_mensagens mx
  WHERE mx.conversa_id = c.id
  ORDER BY COALESCE(mx.enviada_em, mx.recebida_em) DESC
  LIMIT 30
) m ON true
GROUP BY c.id, ct.id;
