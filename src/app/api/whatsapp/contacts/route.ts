import { NextResponse } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'
import type { NextRequest } from 'next/server'

const API_BASE_URL = 'http://op7nexo-api:8000'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return unauthorized()

    const url = new URL(request.url)
    const limitParam = Number(url.searchParams.get('limit') || '80')
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 80, 1), 200)
    const offset = Number(url.searchParams.get('offset') || '0')
    const busca = url.searchParams.get('busca')
    const origem = url.searchParams.get('origem')
    const etapa = url.searchParams.get('etapa_funil')
    const responsavelId = url.searchParams.get('responsavel_id')
    const tag = url.searchParams.get('tag')

    const backendUrl = new URL(`${API_BASE_URL}/contatos`)
    backendUrl.searchParams.set('limit', String(limit))
    backendUrl.searchParams.set('offset', String(offset))
    if (busca) backendUrl.searchParams.set('busca', busca)
    if (origem) backendUrl.searchParams.set('origem', origem)
    if (etapa) backendUrl.searchParams.set('etapa_funil', etapa)
    if (responsavelId) backendUrl.searchParams.set('responsavel_id', responsavelId)
    if (tag) backendUrl.searchParams.set('tag', tag)

    const authHeader = request.headers.get('authorization') || ''
    const cookieToken = request.cookies.get('ws-session')?.value
    const tokenToForward = authHeader || (cookieToken ? `Bearer ${cookieToken}` : '')

    const response = await fetch(backendUrl.toString(), {
      headers: { Authorization: tokenToForward },
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      return NextResponse.json(
        { error: errorData?.detail || 'Erro ao buscar contatos' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(
      { contacts: Array.isArray(data) ? data : [], source: 'api' },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    console.error('[API /whatsapp/contacts] erro:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
