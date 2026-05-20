'use client'

import { useState, useEffect } from 'react'
import { BarraLateral } from '@/components/layout/barra-lateral'
import { PainelChat } from '@/components/layout/painel-chat'
import { ProvedorLayout } from '@/lib/contexto-layout'
import { AuthProvider } from '@/lib/auth-provider'
import { WorkspaceProvider } from '@/lib/workspace-context'

export default function LayoutPlataforma({
  children,
}: {
  children: React.ReactNode
}) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <AuthProvider>
      <WorkspaceProvider>
      <ProvedorLayout>
        <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          height: '100dvh',
          minHeight: 0,
          overflow: 'hidden',
          fontFamily: 'var(--font-plus-jakarta-sans)',
          background: 'var(--bg)',
        }}
      >
        <BarraLateral />
        <main
          style={{
            flex: 1,
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            minHeight: 0,
            minWidth: 0,
            background: 'var(--bg)',
            position: 'relative',
            paddingBottom: isMobile ? 80 : 0,
          }}
        >
          {children}
        </main>
      </div>
        <PainelChat />
      </ProvedorLayout>
      </WorkspaceProvider>
    </AuthProvider>
  )
}
