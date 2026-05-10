import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cnpj: string }> }
) {
  const { cnpj } = await params
  const digits = cnpj.replace(/\D/g, '')
  try {
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${digits}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 0 },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ message: 'Erro ao consultar CNPJ' }, { status: 502 })
  }
}
