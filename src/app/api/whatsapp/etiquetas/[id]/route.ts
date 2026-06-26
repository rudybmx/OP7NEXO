import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'
import { getSql } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

async function getEtiquetaWorkspace(id: string) {
  const db = getSql()
  const rows = await db`SELECT id, workspace_id FROM public.crm_etiquetas WHERE id = ${id}::uuid AND ativo = true`
  return rows.length ? (rows[0] as { id: string; workspace_id: string }) : null
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { id } = await context.params
    const etiqueta = await getEtiquetaWorkspace(id)
    if (!etiqueta || !access.allowedWorkspaceIds.has(etiqueta.workspace_id)) {
      return NextResponse.json({ error: 'Etiqueta não encontrada' }, { status: 404 })
    }

    const body = await request.json() as { nome?: string; cor?: string }
    const nome = body.nome?.trim()
    const cor = body.cor?.trim()
    if (!nome && !cor) return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })

    const db = getSql()

    if (nome) {
      const dup = await db`
        SELECT id FROM public.crm_etiquetas
        WHERE workspace_id = ${etiqueta.workspace_id}::uuid AND nome = ${nome} AND ativo = true AND id <> ${id}::uuid
      `
      if (dup.length > 0) return NextResponse.json({ error: 'Etiqueta com este nome já existe' }, { status: 409 })
    }

    const [atualizada] = await db`
      UPDATE public.crm_etiquetas
      SET nome = COALESCE(${nome ?? null}, nome),
          cor = COALESCE(${cor ?? null}, cor)
      WHERE id = ${id}::uuid
      RETURNING id, workspace_id, nome, cor, ativo, criado_em
    `

    return NextResponse.json({ etiqueta: atualizada })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { id } = await context.params
    const etiqueta = await getEtiquetaWorkspace(id)
    if (!etiqueta || !access.allowedWorkspaceIds.has(etiqueta.workspace_id)) {
      return NextResponse.json({ error: 'Etiqueta não encontrada' }, { status: 404 })
    }

    const db = getSql()
    // Soft delete (mantém histórico); os vínculos são limpos para sumir dos chips.
    await db`UPDATE public.crm_etiquetas SET ativo = false WHERE id = ${id}::uuid`
    await db`DELETE FROM public.crm_contato_etiquetas WHERE etiqueta_id = ${id}::uuid`
    await db`DELETE FROM public.crm_conversa_etiquetas WHERE etiqueta_id = ${id}::uuid`

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro' }, { status: 500 })
  }
}
