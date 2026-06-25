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

    await db`UPDATE public.crm_whatsapp_conversas SET nao_lidas = 0, marcada_nao_lida = false, updated_at = NOW() WHERE id = ${id}::uuid`

    // Fecha o loop do sino: marca a notificação "mensagem_nova" desta conversa como lida
    // para quem abriu (a próxima mensagem volta a gerar uma notificação). Best-effort.
    try {
      await db`
        INSERT INTO public.notificacao_leituras (notificacao_id, user_id)
        SELECT n.id, ${access.user.id}::uuid FROM public.notificacoes n
        WHERE n.workspace_id = ${rows[0].workspace_id}::uuid
          AND n.entidade_tipo = 'conversa' AND n.entidade_id = ${id}::uuid
        ON CONFLICT DO NOTHING`
    } catch {
      // não bloqueia o marcar-lido se a tabela/linha ainda não existir
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro' }, { status: 500 })
  }
}
