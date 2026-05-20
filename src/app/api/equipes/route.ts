import { NextResponse } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'
import { getSql } from '@/lib/db'
import { resolveWhatsappWorkspaceAccess, normalizeWorkspaceId } from '@/lib/whatsapp-workspace-access'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/equipes — Lista equipes do usuário (org)
export async function GET(request: NextRequest) {
  const access = await resolveWhatsappWorkspaceAccess(request)
  if (access instanceof Response) return access

  try {
    const url = new URL(request.url)
    const workspaceIdParam = normalizeWorkspaceId(url.searchParams.get('workspace_id'))

    const db = getSql()

    if (!workspaceIdParam) {
      return NextResponse.json({ error: 'workspace_id é obrigatório para listar equipes.' }, { status: 400 })
    }
    if (!access.allowedWorkspaceIds.has(workspaceIdParam)) {
      return NextResponse.json({ error: 'Sem acesso a este workspace.' }, { status: 403 })
    }

    const equipes = await db`
        SELECT 
          e.id::text,
          e.nome,
          e.descricao,
          e.workspace_id::text,
          e.created_at,
          (SELECT COUNT(*) FROM public.crm_whatsapp_equipe_membros em WHERE em.equipe_id = e.id)::int as membros_count
        FROM public.crm_whatsapp_equipes e
        WHERE e.workspace_id = ${workspaceIdParam}::uuid
        ORDER BY e.nome ASC
      `

    return NextResponse.json({ equipes, count: equipes.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/equipes — Cria nova equipe (admin level=0 ou admin da org)
export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request)
  if (!user) return unauthorized()

  try {
    const body = await request.json()
    const { nome, descricao, workspace_id } = body

    if (!nome || typeof nome !== 'string' || nome.trim().length === 0) {
      return NextResponse.json({ error: 'Nome da equipe é obrigatório' }, { status: 400 })
    }

    const db = getSql()

    // Admin usa workspace do body, outros usam seu próprio workspace
    const targetWorkspaceId = user.role === 'platform_admin' && workspace_id ? workspace_id : user.workspace_id
    if (!targetWorkspaceId) return unauthorized()

    // Verifica se já existe equipe com mesmo nome no workspace
    const existente = await db`
      SELECT id FROM public.crm_whatsapp_equipes 
      WHERE nome = ${nome.trim()} AND workspace_id = ${targetWorkspaceId}::uuid
    `
    if (existente.length > 0) {
      return NextResponse.json({ error: 'Já existe uma equipe com este nome' }, { status: 409 })
    }

    const result = await db`
      INSERT INTO public.crm_whatsapp_equipes (workspace_id, nome, descricao)
      VALUES (${targetWorkspaceId}::uuid, ${nome.trim()}, ${descricao || null})
      RETURNING id::text, nome, descricao, workspace_id::text, created_at
    `

    return NextResponse.json({ equipe: result[0] }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
