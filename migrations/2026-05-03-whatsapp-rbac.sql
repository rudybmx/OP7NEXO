-- =====================================================================
-- WerSun CRM WhatsApp / Evolution
-- Banco: Postgres existente postgres_wersun / database wersun
-- Objetivo: Sistema de equipes/permissões RBAC + armazenamento de mídia
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- TABELAS DE EQUIPE E PERMISSÃO (RBAC)
-- =====================================================================

-- Equipes de atendimento WhatsApp vinculadas a uma organização.
CREATE TABLE IF NOT EXISTS public.crm_whatsapp_equipes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  nome                TEXT NOT NULL,
  descricao           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Membros vinculados a uma equipe (N:N entre equipe e usuário).
CREATE TABLE IF NOT EXISTS public.crm_whatsapp_equipe_membros (
  equipe_id           UUID NOT NULL REFERENCES public.crm_whatsapp_equipes(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL,
  perfil              TEXT NOT NULL DEFAULT 'agente' CHECK (perfil IN ('admin','agente','viewer')),
  UNIQUE(equipe_id, user_id)
);

-- Permissões individuais de visualização entre equipes.
CREATE TABLE IF NOT EXISTS public.crm_whatsapp_permissoes (
  user_id                     UUID PRIMARY KEY,
  pode_ver_outras_equipes     BOOLEAN NOT NULL DEFAULT false,
  equipes_visiveis            UUID[] NOT NULL DEFAULT '{}'::uuid[]
);

-- =====================================================================
-- NOVAS COLUNAS EM CONVERSAS (ALTER TABLE)
-- =====================================================================

-- equipe_id: vincula a conversa a uma equipe de atendimento.
-- responsavel_id: agente responsável pela conversa (pode já existir da migração anterior).
-- historico_transferencias: rastreamento de transferências entre agentes/equipes.
ALTER TABLE public.crm_whatsapp_conversas
  ADD COLUMN IF NOT EXISTS equipe_id                UUID REFERENCES public.crm_whatsapp_equipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel_id           UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS historico_transferencias  JSONB NOT NULL DEFAULT '[]'::jsonb;

-- =====================================================================
-- MÍDIA (ARQUIVOS DE WHATSAPP)
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
-- ÍNDICES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_equipes_org
  ON public.crm_whatsapp_equipes(org_id);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_equipes_org_nome
  ON public.crm_whatsapp_equipes(org_id, nome);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_equipe_membros_equipe
  ON public.crm_whatsapp_equipe_membros(equipe_id);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_equipe_membros_user
  ON public.crm_whatsapp_equipe_membros(user_id);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_conversas_equipe
  ON public.crm_whatsapp_conversas(equipe_id);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_conversas_equipe_status
  ON public.crm_whatsapp_conversas(equipe_id, status, ultima_msg_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_conversas_responsavel
  ON public.crm_whatsapp_conversas(responsavel_id);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_midia_conversa
  ON public.crm_whatsapp_midia(conversa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_midia_conversa_tipo
  ON public.crm_whatsapp_midia(conversa_id, tipo);

-- =====================================================================
-- PERMISSÕES (GRANT)
-- =====================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_whatsapp_equipes TO wersun_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_whatsapp_equipe_membros TO wersun_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_whatsapp_permissoes TO wersun_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_whatsapp_midia TO wersun_admin;
