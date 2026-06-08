import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess, normalizeWorkspaceId } from '@/lib/whatsapp-workspace-access'
import { getSql } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const { searchParams } = new URL(request.url)
    const filtroResolucao = searchParams.get('resolucao') ?? 'todos'

    const workspaceIdParam = normalizeWorkspaceId(searchParams.get('workspace_id'))
    if (!workspaceIdParam) {
      return NextResponse.json({ error: 'workspace_id é obrigatório.' }, { status: 400 })
    }
    if (!access.allowedWorkspaceIds.has(workspaceIdParam)) {
      return NextResponse.json({ error: 'Sem acesso a este workspace.' }, { status: 403 })
    }

    const db = getSql()

    const rows = await db`
      SELECT
        c.id,
        c.created_at,
        c.updated_at,
        c.ultima_mensagem,
        c.lead_status,
        ct.nome          AS contato_nome,
        ct.telefone      AS contato_telefone,
        (
          SELECT elem->>'resolucao'
          FROM jsonb_array_elements(COALESCE(c.historico_transferencias, '[]'::jsonb)) AS elem
          WHERE elem->>'acao' = 'resolvido'
          ORDER BY elem->>'quando' DESC
          LIMIT 1
        ) AS resolucao,
        (
          SELECT elem->>'observacao'
          FROM jsonb_array_elements(COALESCE(c.historico_transferencias, '[]'::jsonb)) AS elem
          WHERE elem->>'acao' = 'resolvido'
          ORDER BY elem->>'quando' DESC
          LIMIT 1
        ) AS observacao,
        (
          SELECT u.nome
          FROM jsonb_array_elements(COALESCE(c.historico_transferencias, '[]'::jsonb)) AS elem
          LEFT JOIN public.users u ON u.id = (elem->>'user_id')::uuid
          WHERE elem->>'acao' = 'resolvido'
          ORDER BY elem->>'quando' DESC
          LIMIT 1
        ) AS responsavel_fechamento
      FROM public.crm_whatsapp_conversas c
      JOIN public.crm_whatsapp_contatos ct ON ct.id = c.contato_id
      WHERE c.status = 'resolvido'
        AND c.workspace_id = ${workspaceIdParam}::uuid
      ORDER BY c.updated_at DESC
    `

    // Aplica filtro de resolucao no JS (evita subquery complexa com filtro)
    const filtered = filtroResolucao === 'todos'
      ? rows
      : rows.filter((r: { resolucao?: string | null }) => {
          const val = (r.resolucao ?? '').toLowerCase()
          return filtroResolucao === 'ganho' ? val === 'ganho' : val === 'perdido'
        })

    const total = rows.length
    const ganho = rows.filter((r: { resolucao?: string | null }) => (r.resolucao ?? '').toLowerCase() === 'ganho').length
    const perdido = rows.filter((r: { resolucao?: string | null }) => (r.resolucao ?? '').toLowerCase() === 'perdido').length

    return NextResponse.json({
      conversas: filtered,
      kpis: { total, ganho, perdido },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/conversations/arquivadas] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
