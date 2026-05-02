import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { verifyPassword, hashPassword } from '@/lib/password'
import { createToken } from '@/lib/jwt'
import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha sao obrigatorios' }, { status: 400 })
    }

    // Busca usuario
    const usuarios = await sql`
      SELECT id, email, password_hash, status FROM public.usuarios WHERE email = ${email}
    `

    if (usuarios.length === 0) {
      return NextResponse.json({ error: 'Credenciais invalidas' }, { status: 401 })
    }

    const user = usuarios[0]

    if (user.status !== 'ativo') {
      return NextResponse.json({ error: 'Conta suspensa ou nao verificada' }, { status: 403 })
    }

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Credenciais invalidas' }, { status: 401 })
    }

    // Busca perfil
    const perfis = await sql`
      SELECT nivel, org_id FROM public.perfis WHERE id = ${user.id}
    `
    const perfil = perfis[0] || { nivel: 99, org_id: null }

    // Atualiza last_login
    await sql`UPDATE public.usuarios SET last_login_at = NOW() WHERE id = ${user.id}`

    // Gera tokens
    const access_token = await createToken({
      sub: user.id,
      email: user.email,
      level: perfil.nivel,
      org_id: perfil.org_id,
    }, '1h')

    const refresh_token = await createToken({
      sub: user.id,
      type: 'refresh',
    }, '7d')

    // Salva refresh token
    const refresh_hash = await hashPassword(refresh_token)
    await sql`
      INSERT INTO public.refresh_tokens (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${refresh_hash}, NOW() + INTERVAL '7 days')
    `

    return NextResponse.json({
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
      },
    })

  } catch (err) {
    console.error('[API /auth/login] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
