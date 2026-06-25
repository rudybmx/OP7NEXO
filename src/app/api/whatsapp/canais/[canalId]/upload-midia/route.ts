import { type NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'

// Encaminha o upload de mídia para o backend usando autenticação por cookie
// (ws-session) ou header Authorization. O catch-all /api/proxy só repassa o
// header Bearer, que NÃO existe nesta app (auth vive no cookie httpOnly
// ws-session, não no localStorage) — por isso o upload de mídia dava 403
// "Not authenticated". Aqui resolvemos o token igual ao /api/whatsapp/send.
const UPSTREAM = 'http://op7nexo-api:8000'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ canalId: string }> },
) {
  const user = await getUserFromRequest(req)
  if (!user) return unauthorized()

  const { canalId } = await params
  const authHeader = req.headers.get('authorization') || ''
  const cookieToken = req.cookies.get('ws-session')?.value
  const tokenToForward = authHeader || (cookieToken ? `Bearer ${cookieToken}` : '')

  // Preserva o content-type (com o boundary do multipart) e demais headers,
  // apenas injetando o Authorization resolvido.
  const headers = new Headers(req.headers)
  headers.delete('host')
  headers.delete('content-length')
  headers.set('authorization', tokenToForward)

  let upstream: Response
  try {
    upstream = await fetch(`${UPSTREAM}/canais/${canalId}/upload-midia`, {
      method: 'POST',
      headers,
      body: req.body,
      duplex: 'half',
    } as RequestInit)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch failed'
    return NextResponse.json(
      { detail: 'Upstream API unavailable', error: message },
      { status: 503 },
    )
  }

  const resHeaders = new Headers(upstream.headers)
  resHeaders.delete('content-encoding')
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  })
}
