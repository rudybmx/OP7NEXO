import { NextResponse } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user || !user.org_id) return unauthorized()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const contaId = searchParams.get('conta_id')

  try {
    let query = sql`
      SELECT 
        c.*,
        mc.nome as conta_nome
      FROM public.meta_campanhas c
      JOIN public.meta_contas mc ON mc.id = c.conta_id
      WHERE mc.org_id = ${user.org_id}
    `

    if (status) {
      query = sql`${query} AND c.status = ${status}`
    }
    if (contaId) {
      query = sql`${query} AND c.conta_id = ${contaId}`
    }

    query = sql`${query} ORDER BY c.updated_at DESC`

    const campanhas = await query
    return NextResponse.json(campanhas)
  } catch (err) {
    console.error('[API /meta/campanhas] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
