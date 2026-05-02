import { NextResponse } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return unauthorized()

  try {
    const perfis = await sql`
      SELECT 
        p.id,
        p.nome,
        p.email,
        p.avatar_url,
        p.telefone,
        p.nivel,
        p.cargo,
        p.status,
        p.org_id,
        o.nome as org_nome,
        o.slug as org_slug
      FROM public.perfis p
      LEFT JOIN public.organizacoes o ON o.id = p.org_id
      WHERE p.id = ${user.id}
    `

    if (perfis.length === 0) {
      return NextResponse.json({ error: 'Perfil nao encontrado' }, { status: 404 })
    }

    return NextResponse.json(perfis[0])
  } catch (err) {
    console.error('[API /auth/me] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
