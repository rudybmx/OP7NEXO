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
    const body = await request.json()
    const { resolucao, observacao } = body

    if (!resolucao || !['ganho', 'perdido'].includes(resolucao)) {
      return NextResponse.json({ error: 'resolucao deve ser ganho ou perdido' }, { status: 400 })
    }

    const db = getSql()
    const allowedIds = Array.from(access.allowedWorkspaceIds)

    const novaEntrada = JSON.stringify({
      acao: 'resolvido',
      resolucao,
      observacao: observacao || null,
      quando: new Date().toISOString(),
      user_id: access.user.id,
      editado: true,
    })

    const updated = await db`
      UPDATE public.crm_whatsapp_conversas
      SET
        historico_transferencias = COALESCE(historico_transferencias, '[]'::jsonb) || ${novaEntrada}::jsonb,
        updated_at = NOW()
      WHERE id = ${id}::uuid
        AND workspace_id = ANY(${allowedIds}::uuid[])
        AND status = 'resolvido'
      RETURNING id
    `

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Conversa não encontrada ou não está arquivada' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/conversations/arquivadas/[id]] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
