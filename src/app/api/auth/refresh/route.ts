import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { verifyPassword, hashPassword } from '@/lib/password'
import { verifyToken, createToken } from '@/lib/jwt'
import type { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { refresh_token } = body

    if (!refresh_token) {
      return NextResponse.json({ error: 'Refresh token obrigatorio' }, { status: 400 })
    }

    // Verifica JWT do refresh token
    let payload
    try {
      payload = await verifyToken(refresh_token)
    } catch {
      return NextResponse.json({ error: 'Refresh token invalido' }, { status: 401 })
    }

    if (!payload.sub || payload.type !== 'refresh') {
      return NextResponse.json({ error: 'Refresh token invalido' }, { status: 401 })
    }

    // Busca usuario no GoTrue
    const usuarios = await sql`
      SELECT id, email, raw_user_meta_data
      FROM auth.users
      WHERE id = ${payload.sub}
        AND deleted_at IS NULL
    `
    if (usuarios.length === 0) {
      return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 401 })
    }

    const user = usuarios[0]

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

    // Gera novos tokens
    const new_access_token = await createToken({
      sub: user.id,
      email: user.email,
      level: nivel,
      role: membro?.role,
      org_id: membro?.org_id ?? null,
    }, '1h')

    const new_refresh_token = await createToken({
      sub: user.id,
      type: 'refresh',
    }, '7d')

    // Salva novo refresh token no auth.refresh_tokens
    const refresh_hash = await hashPassword(new_refresh_token)
    await sql`
      INSERT INTO auth.refresh_tokens 
        (instance_id, user_id, token, session_id, created_at, updated_at)
      VALUES 
        ('00000000-0000-0000-0000-000000000000', ${user.id}, ${refresh_hash}, NULL, NOW(), NOW())
    `

    return NextResponse.json({
      access_token: new_access_token,
      refresh_token: new_refresh_token,
    })

  } catch (err) {
    console.error('[API /auth/refresh] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
