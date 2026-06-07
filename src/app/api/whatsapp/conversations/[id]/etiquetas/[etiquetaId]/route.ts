import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'
import { getSql } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string; etiquetaId: string }> }

export const dynamic = 'force-dynamic'

async function checkConversaAccess(id: string, access: Awaited<ReturnType<typeof resolveWhatsappWorkspaceAccess>>) {
  if (access instanceof Response) return null
  const db = getSql()
  const rows = await db`SELECT id, workspace_id FROM public.crm_whatsapp_conversas WHERE id = ${id}::uuid`
  if (rows.length === 0) return null
  if (!access.allowedWorkspaceIds.has(rows[0].workspace_id)) return null
  return rows[0] as { id: string; workspace_id: string }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { id, etiquetaId } = await context.params
    const conversa = await checkConversaAccess(id, access)
    if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

    const db = getSql()

    const etiqueta = await db`
      SELECT id FROM public.crm_etiquetas
      WHERE id = ${etiquetaId}::uuid AND workspace_id = ${conversa.workspace_id}::uuid AND ativo = true
    `
    if (etiqueta.length === 0) return NextResponse.json({ error: 'Etiqueta não encontrada' }, { status: 404 })

    await db`
      INSERT INTO public.crm_conversa_etiquetas (conversa_id, etiqueta_id)
      VALUES (${id}::uuid, ${etiquetaId}::uuid)
      ON CONFLICT DO NOTHING
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { id, etiquetaId } = await context.params
    const conversa = await checkConversaAccess(id, access)
    if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

    const db = getSql()
    await db`
      DELETE FROM public.crm_conversa_etiquetas
      WHERE conversa_id = ${id}::uuid AND etiqueta_id = ${etiquetaId}::uuid
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro' }, { status: 500 })
  }
}
