import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { resolveWhatsappWorkspaceAccess, normalizeWorkspaceId } from '@/lib/whatsapp-workspace-access'
import { getSql } from '@/lib/db'

const API_BASE_URL = 'http://op7nexo-api:8000'

export async function POST(request: NextRequest) {
  try {
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    const payload = await request.json()
    const { conversa_id, number, text, tipo, media_url, caption, canal_id, quoted_message_id } = payload
    const workspaceIdBody = normalizeWorkspaceId(typeof payload?.workspace_id === 'string' ? payload.workspace_id : null)

    if ((!conversa_id && !number) || (!text && !media_url)) {
      return NextResponse.json(
        { error: 'Informe conversa_id ou number, e text ou media_url' },
        { status: 400 }
      )
    }

    const db = getSql()

    let canalId: string | null = null
    let conversaNumber: string | null = number || null

    if (conversa_id) {
      // Resolve canal pela conversa existente
      const conversaRows = await db`
        SELECT
          conv.instance,
          conv.workspace_id::text AS workspace_id,
          c.id::text AS canal_id,
          c.evolution_instance_id
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
        return NextResponse.json(
          { error: 'Conversa não encontrada' },
          { status: 404 }
        )
      }

      const conversa = conversaRows[0]
      if (!access.allowedWorkspaceIds.has(conversa.workspace_id)) {
        return NextResponse.json(
          { error: 'Sem acesso a esta conversa.' },
          { status: 403 }
        )
      }
      canalId = canal_id || conversa.canal_id

      // Legado: algumas conversas antigas podem carregar "opcl" ou instance nula.
      if (!canalId) {
        const fallbackRows = await db`
          SELECT id::text AS canal_id
          FROM public.canais_entrada
          WHERE workspace_id = ${conversa.workspace_id}::uuid
            AND tipo IN ('whatsapp_evolution', 'whatsapp_waha')
            AND (connection_status = 'connected' OR status = 'ativo')
          ORDER BY
            CASE
              WHEN connection_status = 'connected' THEN 0
              WHEN status = 'ativo' THEN 1
              ELSE 2
            END,
            criado_em DESC
          LIMIT 1
        `
        canalId = fallbackRows[0]?.canal_id ?? null
      }
    } else {
      const workspaceId = workspaceIdBody
      if (!workspaceId) {
        return NextResponse.json(
          { error: 'Workspace não informado para enviar mensagem.' },
          { status: 400 }
        )
      }
      if (!access.allowedWorkspaceIds.has(workspaceId)) {
        return NextResponse.json(
          { error: 'Sem acesso a este workspace.' },
          { status: 403 }
        )
      }

      // Sem conversa_id, usa o canal ativo do workspace informado.
      const canalRows = await db`
          SELECT id::text AS canal_id
          FROM public.canais_entrada
          WHERE tipo IN ('whatsapp_evolution', 'whatsapp_waha')
            AND workspace_id = ${workspaceId}::uuid
            AND (connection_status = 'connected' OR status = 'ativo')
          ORDER BY
            CASE
              WHEN connection_status = 'connected' THEN 0
              WHEN status = 'ativo' THEN 1
              ELSE 2
            END,
            criado_em DESC
          LIMIT 1
        `

      canalId = canal_id || canalRows[0]?.canal_id || null
      if (!canalId) {
        return NextResponse.json(
          { error: 'Nenhum canal WhatsApp ativo encontrado para este workspace.' },
          { status: 404 }
        )
      }
      conversaNumber = number
    }

    // Pega token de autenticação do header
    // Chama API Python para enviar mensagem
    const response = await fetch(`${API_BASE_URL}/canais/${canalId}/enviar-mensagem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': access.tokenToForward,
      },
      body: JSON.stringify({
        ...(conversa_id ? { conversa_id } : { numero: conversaNumber }),
        texto: text,
        tipo: tipo || (media_url ? 'document' : 'texto'),
        media_url: media_url || null,
        caption: caption || null,
        quoted_message_id: quoted_message_id || null,
      }),
      cache: 'no-store',
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.detail || 'Falha ao enviar mensagem via Evolution',
          details: data,
        },
        { status: response.status }
      )
    }

    return NextResponse.json({ ok: true, result: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
