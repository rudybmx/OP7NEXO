import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE = 'ws-session'
const LOGIN_PATH = '/login'

function getUserLevelFromToken(cookieValue: string): number | null {
  try {
    const parts = cookieValue.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    return payload.level ?? null
  } catch {
    return null
  }
}

export function middleware(request: NextRequest) {
  // BYPASS AUTH FOR DEVELOPMENT
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
