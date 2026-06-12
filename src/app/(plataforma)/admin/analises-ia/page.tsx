'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { InsightsIaTabela } from '@/components/admin/InsightsIaTabela'

export default function AnalisesIaPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()

  React.useEffect(() => {
    if (!authLoading && user && user.role !== 'platform_admin') router.push('/')
  }, [authLoading, user, router])

  if (authLoading || !user || user.role !== 'platform_admin') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sparkles size={22} style={{ color: 'var(--ws-blue)' }} /> Análises de IA
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
          Insights de campanha gerados por IA, centralizados (tipo, modelo que gerou, workspace e conta)
        </p>
      </div>

      <InsightsIaTabela limit={100} />
    </div>
  )
}
