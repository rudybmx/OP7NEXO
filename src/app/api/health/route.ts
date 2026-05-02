import { NextResponse } from 'next/server'
import { healthCheck } from '@/lib/db'

export async function GET() {
  const dbOk = await healthCheck()
  return NextResponse.json({
    status: dbOk ? 'ok' : 'degraded',
    database: dbOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  })
}
