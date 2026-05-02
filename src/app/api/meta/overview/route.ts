import { NextResponse } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user || !user.org_id) return unauthorized()

  try {
    // Busca resumo da conta (view)
    const summary = await sql`
      SELECT * FROM public.vw_meta_account_summary
      WHERE conta_id IN (
        SELECT id FROM public.meta_contas
        WHERE org_id = ${user.org_id}
      )
    `

    // Busca financeiro
    const financeiro = await sql`
      SELECT * FROM public.vw_meta_account_financeiro
      WHERE conta_id IN (
        SELECT id FROM public.meta_contas
        WHERE org_id = ${user.org_id}
      )
    `

    return NextResponse.json({
      summary: summary[0] || null,
      financeiro: financeiro[0] || null,
    })
  } catch (err) {
    console.error('[API /meta/overview] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
