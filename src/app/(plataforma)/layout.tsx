'use client'

import { BarraLateral } from '@/components/layout/barra-lateral'
import { PainelChat } from '@/components/layout/painel-chat'
import { ProvedorLayout } from '@/lib/contexto-layout'
import { AuthProvider } from '@/lib/auth-provider'
import { WorkspaceProvider } from '@/lib/workspace-context'
import { useBreakpoint } from '@/hooks/use-mobile'

export default function LayoutPlataforma({
  children,
}: {
  children: React.ReactNode
}) {
  const { isMobile } = useBreakpoint()

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
          fontFamily: 'var(--font-sans-base)',
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
            paddingBottom: isMobile ? 'calc(64px + env(safe-area-inset-bottom))' : 0,
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
