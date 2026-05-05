import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/api-auth'

const WHATSAPP_WEBHOOK_BASE_URL = process.env.WHATSAPP_WEBHOOK_URL || 'https://agente-odontocompany.qozt.com.br'

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return unauthorized()

    const payload = await request.json()
    const number = payload?.number
    const text = payload?.text

    if (!number || !text) {
      return NextResponse.json(
        { error: 'number e text são obrigatórios' },
        { status: 400 }
      )
    }

    const response = await fetch(`${WHATSAPP_WEBHOOK_BASE_URL}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number, text }),
      cache: 'no-store',
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Falha ao enviar mensagem via Evolution',
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
