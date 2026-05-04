import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSql } from '@/lib/db'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'

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
    // --- Autenticação ---
    const user = await getUserFromRequest(request)
    if (!user) return unauthorized()

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

    // --- Monta query ---
    const db = getSql()

    let query = db<
      DbMidia[]
    >`SELECT id::text, conversa_id::text, tipo, minio_path, url_publica, mimetype, tamanho, created_at FROM public.crm_whatsapp_midia WHERE conversa_id = ${conversaId}::uuid`

    // Filtro opcional por tipo
    if (tipo) {
      query = db`${query} AND tipo = ${tipo}`
    }

    // Ordenação e limite
    query = db`${query} ORDER BY created_at DESC LIMIT ${limit}`

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
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/media] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
