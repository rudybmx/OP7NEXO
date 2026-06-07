import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'
import { getSql } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const url = new URL(request.url)
    const workspaceId = url.searchParams.get('workspace_id')

    if (!workspaceId || !access.allowedWorkspaceIds.has(workspaceId)) {
      return NextResponse.json({ error: 'workspace_id inválido ou sem acesso' }, { status: 403 })
    }

    const db = getSql()
    const etiquetas = await db`
      SELECT id, workspace_id, nome, cor, ativo, criado_em
      FROM public.crm_etiquetas
      WHERE workspace_id = ${workspaceId}::uuid AND ativo = true
      ORDER BY nome
    `

    return NextResponse.json({ etiquetas })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const body = await request.json() as { workspace_id?: string; nome: string; cor?: string }
    const workspaceId = body.workspace_id

    if (!workspaceId || !access.allowedWorkspaceIds.has(workspaceId)) {
      return NextResponse.json({ error: 'workspace_id inválido ou sem acesso' }, { status: 403 })
    }

    const nome = body.nome?.trim()
    const cor = body.cor || '#25D366'

    if (!nome) return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 })

    const db = getSql()

    const existente = await db`
      SELECT id FROM public.crm_etiquetas
      WHERE workspace_id = ${workspaceId}::uuid AND nome = ${nome} AND ativo = true
    `
    if (existente.length > 0) {
      return NextResponse.json({ error: 'Etiqueta com este nome já existe' }, { status: 409 })
    }

    const [etiqueta] = await db`
      INSERT INTO public.crm_etiquetas (workspace_id, nome, cor)
      VALUES (${workspaceId}::uuid, ${nome}, ${cor})
      RETURNING id, workspace_id, nome, cor, ativo, criado_em
    `

    return NextResponse.json({ etiqueta }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro' }, { status: 500 })
  }
}
