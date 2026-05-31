import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSql } from '@/lib/db'
import { resolveWhatsappWorkspaceAccess } from '@/lib/whatsapp-workspace-access'

// ---------------------------------------------------------------------------
// GET /api/whatsapp/media?conversa_id=<UUID>
// ---------------------------------------------------------------------------
export const dynamic = 'force-dynamic'

type DbMidia = {
  id: string
  conversa_id: string
  tipo: string
  minio_path: string
  url_publica: string
  mimetype: string
  tamanho: number
  created_at: Date | string
}

export async function GET(request: NextRequest) {
  try {
    // --- Autenticação + workspaces autorizados (fonte forte via /me/workspaces = UWA) ---
    const access = await resolveWhatsappWorkspaceAccess(request)
    if (access instanceof Response) return access

    // --- Parâmetros ---
    const url = new URL(request.url)
    const conversaId = url.searchParams.get('conversa_id')
    const tipo = url.searchParams.get('tipo')
    const limitParam = Number(url.searchParams.get('limit') || '50')
    const limit = Math.min(
      Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1),
      200,
    )

    // --- Validação ---
    if (!conversaId) {
      return NextResponse.json(
        { error: 'Parâmetro conversa_id (UUID) é obrigatório.' },
        { status: 400 },
      )
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(conversaId)) {
      return NextResponse.json(
        { error: 'conversa_id deve ser um UUID válido.' },
        { status: 400 },
      )
    }

    const db = getSql()

    // --- Guard de tenant: a conversa precisa pertencer a um workspace autorizado ---
    // Resolve o workspace da conversa e valida ANTES de retornar qualquer mídia.
    // 404 tanto para inexistente quanto para sem-acesso (evita enumeração de conversa_id).
    const conversaRows = await db<{ workspace_id: string }[]>`
      SELECT workspace_id::text AS workspace_id
      FROM public.crm_whatsapp_conversas
      WHERE id = ${conversaId}::uuid
      LIMIT 1
    `
    if (
      conversaRows.length === 0 ||
      !access.allowedWorkspaceIds.has(conversaRows[0].workspace_id)
    ) {
      return NextResponse.json(
        { error: 'Conversa não encontrada.' },
        { status: 404 },
      )
    }
    const workspaceId = conversaRows[0].workspace_id

    // --- Monta query (JOIN com conversa + escopo de workspace como defesa em profundidade) ---
    let query = db<
      DbMidia[]
    >`SELECT m.id::text, m.conversa_id::text, m.tipo, m.minio_path, m.url_publica, m.mimetype, m.tamanho, m.created_at FROM public.crm_whatsapp_midia m JOIN public.crm_whatsapp_conversas c ON c.id = m.conversa_id WHERE m.conversa_id = ${conversaId}::uuid AND c.workspace_id = ${workspaceId}::uuid`

    // Filtro opcional por tipo
    if (tipo) {
      query = db`${query} AND m.tipo = ${tipo}`
    }

    // Ordenação e limite
    query = db`${query} ORDER BY m.created_at DESC LIMIT ${limit}`

    const rows = await query

    // --- Mapeia resposta (camelCase) ---
    const midia = rows.map((row) => ({
      id: row.id,
      conversaId: row.conversa_id,
      tipo: row.tipo,
      minioPath: row.minio_path,
      // Se tem minio_path, gera URL via proxy público; senão usa url_publica original
      urlPublica: row.minio_path
        ? `/api/whatsapp/media/file?path=${encodeURIComponent(row.minio_path)}`
        : row.url_publica,
      mimetype: row.mimetype,
      tamanho: row.tamanho,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
    }))

    return NextResponse.json({
      midia,
      count: midia.length,
      conversaId,
    })
  } catch (error) {
    // Loga o detalhe no servidor, mas NÃO expõe mensagem interna (path/bucket/SQL) ao cliente.
    console.error('[API /whatsapp/media] erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
