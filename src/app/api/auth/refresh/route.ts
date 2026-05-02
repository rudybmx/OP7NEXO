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

    // Busca tokens validos no banco para este usuario
    const tokens = await sql`
      SELECT id, token_hash FROM public.refresh_tokens
      WHERE user_id = ${payload.sub}
        AND revoked_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
    `

    // Verifica se algum token no banco corresponde ao que foi enviado
    let validTokenId = null
    for (const t of tokens) {
      if (await verifyPassword(refresh_token, t.token_hash)) {
        validTokenId = t.id
        break
      }
    }

    if (!validTokenId) {
      return NextResponse.json({ error: 'Refresh token revogado ou expirado' }, { status: 401 })
    }

    // Revoga o token antigo
    await sql`UPDATE public.refresh_tokens SET revoked_at = NOW() WHERE id = ${validTokenId}`

    // Busca usuario e perfil
    const usuarios = await sql`SELECT id, email, status FROM public.usuarios WHERE id = ${payload.sub}`
    if (usuarios.length === 0) {
      return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 401 })
    }

    const user = usuarios[0]
    const perfis = await sql`SELECT nivel, org_id FROM public.perfis WHERE id = ${user.id}`
    const perfil = perfis[0] || { nivel: 99, org_id: null }

    // Gera novos tokens
    const new_access_token = await createToken({
      sub: user.id,
      email: user.email,
      level: perfil.nivel,
      org_id: perfil.org_id,
    }, '1h')

    const new_refresh_token = await createToken({
      sub: user.id,
      type: 'refresh',
    }, '7d')

    // Salva novo refresh token
    const refresh_hash = await hashPassword(new_refresh_token)
    await sql`
      INSERT INTO public.refresh_tokens (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${refresh_hash}, NOW() + INTERVAL '7 days')
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
