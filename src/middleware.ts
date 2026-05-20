import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE = 'ws-session'
const LOGIN_PATH = '/login'
const DASHBOARD_PATH = '/marketing/campanhas/meta-ads'
const PUBLIC_PATHS = ['/login', '/api/', '/graph.html']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(COOKIE)?.value

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  // Autenticado acessando login → manda pro dashboard
  if (isPublic && token && pathname.startsWith(LOGIN_PATH)) {
    return NextResponse.redirect(new URL(DASHBOARD_PATH, request.url))
  }

  if (isPublic) return NextResponse.next()

  // Não autenticado → login
  if (!token) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
