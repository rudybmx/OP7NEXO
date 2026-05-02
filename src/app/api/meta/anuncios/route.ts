import { NextResponse } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user || !user.org_id) return unauthorized()

  const { searchParams } = new URL(req.url)
  const campanhaId = searchParams.get('campanha_id')
  const conjuntoId = searchParams.get('conjunto_id')
  const status = searchParams.get('status')

  try {
    let query = sql`
      SELECT 
        a.*,
        mc.nome as conta_nome
      FROM public.meta_anuncios a
      JOIN public.meta_contas mc ON mc.id = a.conta_id
      WHERE mc.org_id = ${user.org_id}
    `

    if (campanhaId) {
      query = sql`${query} AND a.campanha_id = ${campanhaId}`
    }
    if (conjuntoId) {
      query = sql`${query} AND a.conjunto_id = ${conjuntoId}`
    }
    if (status) {
      query = sql`${query} AND a.status = ${status}`
    }

    query = sql`${query} ORDER BY a.updated_at DESC`

    const anuncios = await query
    return NextResponse.json(anuncios)
  } catch (err) {
    console.error('[API /meta/anuncios] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
