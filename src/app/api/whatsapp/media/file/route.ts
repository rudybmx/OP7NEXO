import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getMinioClient } from '@/lib/minio-client'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/whatsapp/media/file?path=whatsapp/xxxx/yyyy.jpg
// Proxy para servir arquivos do MinIO — requer autenticação
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return unauthorized()

    const url = new URL(request.url)
    const objectPath = url.searchParams.get('path')

    if (!objectPath) {
      return NextResponse.json({ error: 'Parâmetro path é obrigatório' }, { status: 400 })
    }

    // Sanitiza o path para evitar path traversal
    if (objectPath.includes('..') || objectPath.startsWith('/')) {
      return NextResponse.json({ error: 'Path inválido' }, { status: 400 })
    }

    const minio = getMinioClient()
    const bucket = process.env.MINIO_BUCKET || 'whatsapp-media'

    // Obtém o objeto do MinIO como stream
    const dataStream = await minio.getObject(bucket, objectPath)
    
    // Obtém informações do objeto para content-type
    const stat = await minio.statObject(bucket, objectPath)

    // Converte stream para buffer
    const chunks: Buffer[] = []
    for await (const chunk of dataStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const buffer = Buffer.concat(chunks)

    // Retorna com o content-type correto
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': stat.metaData?.['content-type'] || 'application/octet-stream',
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[Media Proxy] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
