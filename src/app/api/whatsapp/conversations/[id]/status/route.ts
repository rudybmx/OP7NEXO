import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'
import { getSql } from '@/lib/db'

type RouteContext = {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { id } = await context.params
    const body = await request.json()
    const { status, resolucao, ia_ativa } = body

    const setIaAtiva = typeof ia_ativa === 'boolean'

    if (!status && !setIaAtiva) {
      return NextResponse.json({ error: 'Informe status ou ia_ativa' }, { status: 400 })
    }

    const statusValidos = ['nova', 'em_atendimento', 'aguardando', 'resgate', 'resolvido', 'processando']
    if (status && !statusValidos.includes(status)) {
      return NextResponse.json({ error: 'status invalido' }, { status: 400 })
    }

    const db = getSql()

    // Verifica se conversa existe e pertence a um workspace acessível
    const conversas = await db`
      SELECT id, workspace_id, status, responsavel_id, equipe_id
           , closed_at, first_response_at
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

    // RBAC: apenas responsavel, admin da equipe, ou superadmin pode alterar
    if (access.user.role !== 'platform_admin') {
      const isResponsavel = conversa.responsavel_id === access.user.id
      let isAdminEquipe = false

      if (conversa.equipe_id) {
        const membro = await db`
          SELECT perfil
          FROM public.crm_whatsapp_equipe_membros
          WHERE equipe_id = ${conversa.equipe_id}::uuid
            AND user_id = ${access.user.id}::uuid
            AND perfil = 'admin'
          LIMIT 1
        `
        isAdminEquipe = membro.length > 0
      }

      if (!isResponsavel && !isAdminEquipe) {
        return NextResponse.json({ error: 'Permissao negada' }, { status: 403 })
      }
    }

    const isResolucao = status === 'resolvido'

    // Se resolver, registra resolucao no historico apenas na transicao
    const historicoEntry = isResolucao && conversa.status !== 'resolvido'
      ? JSON.stringify({
          acao: 'resolvido',
          de: conversa.status,
          para: status,
          resolucao: resolucao || null,
          quando: new Date().toISOString(),
          user_id: access.user.id,
        })
      : null

    // Monta UPDATE dinâmico com status e/ou ia_ativa
    const updated = isResolucao
      ? await db`
          UPDATE public.crm_whatsapp_conversas
          SET
            status = ${status},
            closed_at = COALESCE(closed_at, NOW()),
            resolution_time = CASE
              WHEN resolution_time IS NULL AND first_response_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (COALESCE(closed_at, NOW()) - first_response_at))::int
              ELSE resolution_time
            END,
            ${setIaAtiva ? db`ia_ativa = ${ia_ativa},` : db``}
            ${historicoEntry ? db`historico_transferencias = historico_transferencias || ${historicoEntry}::jsonb,` : db``}
            updated_at = NOW()
          WHERE id = ${id}::uuid
          RETURNING id, status, closed_at, ia_ativa, resolution_time, updated_at
        `
      : status
        ? await db`
            UPDATE public.crm_whatsapp_conversas
            SET
              status = ${status},
              ${setIaAtiva ? db`ia_ativa = ${ia_ativa},` : db``}
              updated_at = NOW()
            WHERE id = ${id}::uuid
            RETURNING id, status, closed_at, ia_ativa, resolution_time, updated_at
          `
        : await db`
            UPDATE public.crm_whatsapp_conversas
            SET
              ia_ativa = ${ia_ativa},
              updated_at = NOW()
            WHERE id = ${id}::uuid
            RETURNING id, status, closed_at, ia_ativa, resolution_time, updated_at
          `

    return NextResponse.json({
      ok: true,
      conversa: updated[0],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/conversations/status] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
