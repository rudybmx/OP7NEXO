import { type NextRequest, NextResponse } from 'next/server'

const UPSTREAM = 'http://op7nexo-api:8000'

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const url = new URL(`/${path.join('/')}`, UPSTREAM)
  url.search = req.nextUrl.search

  const headers = new Headers(req.headers)
  headers.delete('host')

  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : req.body

  let upstream: Response
  try {
    upstream = await fetch(url.toString(), {
      method: req.method,
      headers,
      body,
      duplex: 'half',
    } as RequestInit)
  } catch (err: any) {
    return NextResponse.json(
      {
        detail: 'Upstream API unavailable',
        code: 'upstream_unavailable',
        path: `/${path.join('/')}`,
        error: err?.message ?? 'fetch failed',
      },
      { status: 503 }
    )
  }

  const resHeaders = new Headers(upstream.headers)
  resHeaders.delete('content-encoding')

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const HEAD = handler
export const OPTIONS = handler
