import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import { createToken } from '@/lib/jwt'
import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha sao obrigatorios' }, { status: 400 })
    }

    // Busca usuario no GoTrue (auth.users)
    const usuarios = await sql`
      SELECT 
        u.id, 
        u.email, 
        u.encrypted_password,
        u.raw_user_meta_data,
        COALESCE(p.full_name, u.email) as nome
      FROM auth.users u
      LEFT JOIN public.user_profiles p ON p.id = u.id
      WHERE u.email = ${email}
        AND u.deleted_at IS NULL
    `

    if (usuarios.length === 0) {
      return NextResponse.json({ error: 'Credenciais invalidas' }, { status: 401 })
    }

    const user = usuarios[0]

    // Verifica senha com bcrypt (GoTrue usa bcrypt)
    if (!user.encrypted_password) {
      return NextResponse.json({ error: 'Conta configurada sem senha. Use login social ou redefina sua senha.' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.encrypted_password)
    if (!valid) {
      return NextResponse.json({ error: 'Credenciais invalidas' }, { status: 401 })
    }

    // Busca nivel e org via org_members
    const membros = await sql`
      SELECT 
        m.org_id,
        m.role,
        o.level as org_level
      FROM public.org_members m
      JOIN public.organizations o ON o.id = m.org_id
      WHERE m.user_id = ${user.id}
        AND m.is_active = true
        AND o.is_active = true
        AND o.deleted_at IS NULL
      ORDER BY o.level ASC
      LIMIT 1
    `

    const membro = membros[0]
    const nivel = membro?.org_level ?? 99

    // Gera tokens
    const access_token = await createToken({
      sub: user.id,
      email: user.email,
      level: nivel,
      role: membro?.role,
      org_id: membro?.org_id ?? null,
    }, '1h')

    const refresh_token = await createToken({
      sub: user.id,
      type: 'refresh',
    }, '7d')

    // Salva refresh token no auth.refresh_tokens (GoTrue)
    const bcrypt = await import('bcryptjs')
    const refresh_hash = await bcrypt.hash(refresh_token, 12)
    await sql`
      INSERT INTO auth.refresh_tokens 
        (instance_id, user_id, token, session_id, created_at, updated_at)
      VALUES 
        ('00000000-0000-0000-0000-000000000000', ${user.id}, ${refresh_hash}, NULL, NOW(), NOW())
    `

    // Atualiza last_sign_in_at no GoTrue
    await sql`
      UPDATE auth.users 
      SET last_sign_in_at = NOW() 
      WHERE id = ${user.id}
    `

    return NextResponse.json({
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
      },
    })

  } catch (err) {
    console.error('[API /auth/login] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
