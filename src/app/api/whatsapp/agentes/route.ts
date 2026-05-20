import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess, normalizeWorkspaceId } from '@/lib/whatsapp-workspace-access'
import { getSql } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const url = new URL(request.url)
    const workspaceIdParam = normalizeWorkspaceId(url.searchParams.get('workspace_id'))

    const db = getSql()

    if (!workspaceIdParam) {
      return NextResponse.json({ error: 'workspace_id é obrigatório para listar agentes.' }, { status: 400 })
    }
    if (!access.allowedWorkspaceIds.has(workspaceIdParam)) {
      return NextResponse.json({ error: 'Sem acesso a este workspace.' }, { status: 403 })
    }

    const agentes = await db`
        SELECT
          u.id::text,
          u.nome,
          u.email,
          u.role as cargo,
          u.pode_atender_canais,
          w.id::text as workspace_id,
          w.nome as workspace_nome
        FROM public.users u
        LEFT JOIN public.workspaces w ON w.id = u.workspace_id
        WHERE u.pode_atender_canais = true
          AND u.workspace_id = ${workspaceIdParam}::uuid
          AND u.ativo = true
        ORDER BY u.nome ASC
      `

    return NextResponse.json({ agentes, count: agentes.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/agentes] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
