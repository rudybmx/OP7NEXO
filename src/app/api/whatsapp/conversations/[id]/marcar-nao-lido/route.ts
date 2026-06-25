import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'
import { getSql } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { id } = await context.params
    const db = getSql()

    const rows = await db`SELECT id, workspace_id FROM public.crm_whatsapp_conversas WHERE id = ${id}::uuid`
    if (rows.length === 0) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    if (!access.allowedWorkspaceIds.has(rows[0].workspace_id)) {
      return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })
    }

    // Marcação manual "não lida" (independente do contador nao_lidas de mensagens reais)
    await db`UPDATE public.crm_whatsapp_conversas SET marcada_nao_lida = true, updated_at = NOW() WHERE id = ${id}::uuid`
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro' }, { status: 500 })
  }
}
