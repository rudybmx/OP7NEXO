import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'
import { getSql } from '@/lib/db'

type RouteContext = {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { id } = await context.params

    const db = getSql()

    // Verifica se conversa existe e pertence a um workspace acessível
    const conversas = await db`
      SELECT id, workspace_id, status, responsavel_id, equipe_id
      FROM public.crm_whatsapp_conversas
      WHERE id = ${id}::uuid
    `

    if (conversas.length === 0) {
      return NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 })
    }

    const conversa = conversas[0]
    if (!access.allowedWorkspaceIds.has(conversa.workspace_id)) {
      return NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 })
    }

    // Verifica se usuario pode atender canais
    if (access.user.role !== 'platform_admin') {
      const perfil = await db`
        SELECT pode_atender_canais
        FROM public.users
        WHERE id = ${access.user.id}::uuid
      `
      if (perfil.length === 0 || !perfil[0].pode_atender_canais) {
        return NextResponse.json({ error: 'Usuario nao autorizado a atender canais' }, { status: 403 })
      }
    }

    // Teto (Fase 1): atendente não "rouba" conversa de outro humano (só própria/sem-dono/IA).
    if (
      access.user.role === 'company_agent' &&
      conversa.responsavel_id &&
      conversa.responsavel_id !== access.user.id
    ) {
      return NextResponse.json({ error: 'Sem permissao para esta conversa' }, { status: 403 })
    }

    // Verifica se usuario tem acesso a equipe da conversa (se houver)
    if (conversa.equipe_id && access.user.role !== 'platform_admin') {
      const membro = await db`
        SELECT perfil
        FROM public.crm_whatsapp_equipe_membros
        WHERE equipe_id = ${conversa.equipe_id}::uuid
          AND user_id = ${access.user.id}::uuid
        LIMIT 1
      `
      if (membro.length === 0) {
        return NextResponse.json({ error: 'Usuario nao pertence a equipe desta conversa' }, { status: 403 })
      }
    }

    // Registra assumir no historico
    const historicoEntry = JSON.stringify({
      acao: 'assumir',
      de: conversa.responsavel_id || 'ia',
      para: access.user.id,
      quando: new Date().toISOString(),
      user_id: access.user.id,
    })

    const updated = await db`
      UPDATE public.crm_whatsapp_conversas
      SET
        responsavel_id = ${access.user.id}::uuid,
        status = 'em_atendimento',
        ai_ativo = false,
        historico_transferencias = historico_transferencias || ${historicoEntry}::jsonb,
        updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING id, responsavel_id, status, updated_at
    `

    return NextResponse.json({
      ok: true,
      conversa: updated[0],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/conversations/assumir] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
