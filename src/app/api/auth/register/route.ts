import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { createToken } from '@/lib/jwt'
import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password, nome, org_nome } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha sao obrigatorios' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter no minimo 6 caracteres' }, { status: 400 })
    }

    // Verifica se email ja existe
    const existente = await sql`SELECT id FROM public.usuarios WHERE email = ${email}`
    if (existente.length > 0) {
      return NextResponse.json({ error: 'Email ja cadastrado' }, { status: 409 })
    }

    const password_hash = await hashPassword(password)

    // Cria organizacao (se informada)
    let org_id = null
    if (org_nome) {
      const org = await sql`
        INSERT INTO public.organizacoes (nome, slug)
        VALUES (${org_nome}, ${org_nome.toLowerCase().replace(/\s+/g, '-')})
        RETURNING id
      `
      org_id = org[0].id
    }

    // Cria usuario
    const usuario = await sql`
      INSERT INTO public.usuarios (email, password_hash, email_verificado)
      VALUES (${email}, ${password_hash}, true)
      RETURNING id, email, status
    `

    const user = usuario[0]

    // Cria perfil
    await sql`
      INSERT INTO public.perfis (id, org_id, nome, nivel, status)
      VALUES (${user.id}, ${org_id}, ${nome || email.split('@')[0]}, ${org_id ? 1 : 0}, 'ativo')
    `

    // Gera tokens
    const access_token = await createToken({
      sub: user.id,
      email: user.email,
      level: org_id ? 1 : 0,
      org_id: org_id,
    }, '1h')

    const refresh_token = await createToken({
      sub: user.id,
      type: 'refresh',
    }, '7d')

    // Salva refresh token no banco (hash)
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
    console.error('[API /auth/register] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
