import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'
import { getSql } from '@/lib/db'

const API_BASE_URL = 'http://op7nexo-api:8000'

// POST /api/whatsapp/reagir — reage (ou remove) com emoji a uma mensagem,
// espelhando no WhatsApp. Resolve o canal pela conversa e encaminha ao backend.
export async function POST(request: NextRequest) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const payload = await request.json()
    const { conversa_id, target_evolution_msg_id, emoji, canal_id } = payload

    if (!conversa_id || !target_evolution_msg_id) {
      return NextResponse.json(
        { error: 'Informe conversa_id e target_evolution_msg_id' },
        { status: 400 }
      )
    }

    const db = getSql()
    const conversaRows = await db`
      SELECT
        conv.workspace_id::text AS workspace_id,
        c.id::text AS canal_id
      FROM public.crm_whatsapp_conversas conv
      LEFT JOIN public.canais_entrada c
        ON (
          c.evolution_instance_id = conv.instance
          OR CONCAT('op7-', c.workspace_id::text, '-', c.id::text) = conv.instance
          OR CONCAT('webhook:', LEFT(REPLACE(c.id::text, '-', ''), 8)) = conv.instance
        )
      WHERE conv.id = ${conversa_id}::uuid
      LIMIT 1
    `

    if (conversaRows.length === 0) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    const conversa = conversaRows[0]
    if (!access.allowedWorkspaceIds.has(conversa.workspace_id)) {
      return NextResponse.json({ error: 'Sem acesso a esta conversa.' }, { status: 403 })
    }

    let canalId: string | null = canal_id || conversa.canal_id
    if (!canalId) {
      const fallbackRows = await db`
        SELECT id::text AS canal_id
        FROM public.canais_entrada
        WHERE workspace_id = ${conversa.workspace_id}::uuid
          AND tipo IN ('whatsapp_evolution', 'whatsapp_waha', 'whatsapp_oficial')
          AND (connection_status = 'connected' OR status = 'ativo')
        ORDER BY
          CASE WHEN connection_status = 'connected' THEN 0 WHEN status = 'ativo' THEN 1 ELSE 2 END,
          criado_em DESC
        LIMIT 1
      `
      canalId = fallbackRows[0]?.canal_id ?? null
    }
    if (!canalId) {
      return NextResponse.json({ error: 'Nenhum canal WhatsApp encontrado.' }, { status: 404 })
    }

    const response = await fetch(`${API_BASE_URL}/canais/${canalId}/reagir`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': access.tokenToForward,
      },
      body: JSON.stringify({
        conversa_id,
        target_evolution_msg_id,
        emoji: emoji ?? '',
      }),
      cache: 'no-store',
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.detail || 'Falha ao reagir', details: data },
        { status: response.status }
      )
    }
    return NextResponse.json({ ok: true, result: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
