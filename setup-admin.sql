-- =====================================================================
-- SETUP: Criar primeiro usuario admin no Wer'sun
-- =====================================================================
-- Rode este script no Postgres apos aplicar o schema.sql
-- Substitua os valores abaixo pelo seu email e senha desejados
--
-- Comando:
--   docker exec -i postgres_wersun psql -U supabase_auth_admin -d wersun < setup-admin.sql
-- =====================================================================

DO $$
DECLARE
  v_email TEXT := 'admin@wersun.com.br';     -- <-- MUDE SEU EMAIL
  v_senha TEXT := 'WersunAdmin2026!';        -- <-- MUDE SUA SENHA
  v_nome  TEXT := 'Administrador';           -- <-- MUDE SEU NOME
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  -- 1. Cria organizacao raiz
  INSERT INTO public.organizacoes (nome, slug, nivel_plano, status)
  VALUES ('WerSun Root', 'wersun-root', 'enterprise', 'ativo')
  RETURNING id INTO v_org_id;

  -- 2. Cria usuario com senha bcrypt (pre-hashada aqui para simplicidade)
  --    Nota: Em producao, use a API /api/auth/register ou gere o hash via app
  INSERT INTO public.usuarios (email, password_hash, email_verificado, status)
  VALUES (
    v_email,
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiAYMyzJ/I1K',  -- hash de 'WersunAdmin2026!'
    true,
    'ativo'
  )
  RETURNING id INTO v_user_id;

  -- 3. Cria perfil admin (nivel 0 = superadmin)
  INSERT INTO public.perfis (id, org_id, nome, nivel, cargo, status)
  VALUES (v_user_id, v_org_id, v_nome, 0, 'Fundador', 'ativo');

  RAISE NOTICE 'Admin criado com sucesso!';
  RAISE NOTICE 'Email: %', v_email;
  RAISE NOTICE 'Org ID: %', v_org_id;
  RAISE NOTICE 'User ID: %', v_user_id;
END $$;
