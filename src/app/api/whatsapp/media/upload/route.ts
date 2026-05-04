import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSql } from '@/lib/db'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'
import {
  getMinioClient,
  ensureBucket,
  getBucketName,
  getPublicUrl,
} from '@/lib/minio-client'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Configuração: tamanho máximo do upload (50 MB)
// ---------------------------------------------------------------------------
export const dynamic = 'force-dynamic'
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

// ---------------------------------------------------------------------------
// Tipos de mídia permitidos
// ---------------------------------------------------------------------------
const TIPOS_VALIDOS = new Set([
  'imagem',
  'documento',
  'audio',
  'video',
  'sticker',
  'localizacao',
  'contato',
])

function inferirTipo(mimetype: string): string {
  if (mimetype.startsWith('image/')) return 'imagem'
  if (mimetype.startsWith('audio/')) return 'audio'
  if (mimetype.startsWith('video/')) return 'video'
  if (
    mimetype.startsWith('application/') ||
    mimetype === 'text/plain' ||
    mimetype === 'text/csv'
  )
    return 'documento'
  return 'documento'
}

// ---------------------------------------------------------------------------
// POST /api/whatsapp/media/upload
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    // --- Autenticação ---
    const user = await getUserFromRequest(request)
    if (!user) return unauthorized()

    // --- Lê o form-data multipart ---
    const formData = await request.formData()

    const file = formData.get('file')
    const conversaIdRaw = formData.get('conversa_id')
    const tipoRaw = formData.get('tipo')

    // --- Validações ---
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Arquivo (file) é obrigatório.' },
        { status: 400 },
      )
    }

    if (!conversaIdRaw || typeof conversaIdRaw !== 'string') {
      return NextResponse.json(
        { error: 'conversa_id (UUID) é obrigatório.' },
        { status: 400 },
      )
    }

    const conversaId = conversaIdRaw.trim()
    // Valida formato UUID básico
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(conversaId)) {
      return NextResponse.json(
        { error: 'conversa_id deve ser um UUID válido.' },
        { status: 400 },
      )
    }

    // Verifica se a conversa existe e pertence à organização do usuário
    const db = getSql()
    const conversa = user.level === 0
      ? await db<{ id: string }[]>`
          SELECT id FROM public.crm_whatsapp_conversas WHERE id = ${conversaId}::uuid
        `
      : await db<{ id: string }[]>`
          SELECT id FROM public.crm_whatsapp_conversas
          WHERE id = ${conversaId}::uuid
            AND org_id = ${user.org_id || null}::uuid
        `
    if (conversa.length === 0) {
      return NextResponse.json(
        { error: 'Conversa não encontrada.' },
        { status: 404 },
      )
    }

    // --- Valida tamanho ---
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `Arquivo excede o tamanho máximo de ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
        },
        { status: 413 },
      )
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: 'Arquivo está vazio.' },
        { status: 400 },
      )
    }

    // --- Determina o tipo ---
    let tipo = tipoRaw && typeof tipoRaw === 'string' ? tipoRaw.trim().toLowerCase() : ''
    if (!tipo || !TIPOS_VALIDOS.has(tipo)) {
      tipo = inferirTipo(file.type)
    }

    // --- Prepara o arquivo para upload ---
    const buffer = Buffer.from(await file.arrayBuffer())
    const extensao = file.name.split('.').pop() || 'bin'
    const objectKey = `whatsapp/${conversaId}/${randomUUID()}.${extensao}`

    // --- Upload para o MinIO ---
    await ensureBucket()
    const minioClient = getMinioClient()
    const bucketName = getBucketName()

    await minioClient.putObject(bucketName, objectKey, buffer, buffer.length, {
      'Content-Type': file.type || 'application/octet-stream',
      'x-amz-meta-uploaded-by': user.id,
      'x-amz-meta-original-name': encodeURIComponent(file.name),
    })

    // --- Gera URL pública ---
    const urlPublica = getPublicUrl(objectKey)

    // --- Registra no banco de dados ---
    const agora = new Date()
    const id = randomUUID()

    await db`
      INSERT INTO public.crm_whatsapp_midia
        (id, conversa_id, tipo, minio_path, url_publica, mimetype, tamanho, created_at)
      VALUES
        (${id}::uuid, ${conversaId}::uuid, ${tipo}, ${objectKey}, ${urlPublica}, ${
      file.type || 'application/octet-stream'
    }, ${file.size}, ${agora})
    `

    // --- Resposta de sucesso ---
    return NextResponse.json(
      {
        ok: true,
        midia: {
          id,
          conversa_id: conversaId,
          tipo,
          minio_path: objectKey,
          url_publica: urlPublica,
          mimetype: file.type || 'application/octet-stream',
          tamanho: file.size,
          nome_original: file.name,
          created_at: agora.toISOString(),
        },
      },
      { status: 201 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/media/upload] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
