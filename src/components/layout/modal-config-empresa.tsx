'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X, Building2, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useWorkspace } from '@/lib/workspace-context'

interface ModalConfigEmpresaProps {
  aberto: boolean
  onFechar: () => void
}

const ROLE_LABEL: Record<string, string> = {
  platform_admin: 'Admin da Plataforma',
  network_admin: 'Admin da Rede',
  network_viewer: 'Visualizador da Rede',
  company_admin: 'Admin da Empresa',
  company_agent: 'Agente',
}

const BRAND_PRIMARY = '#3E5BFF'

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABEL[role] ?? role
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px',
      borderRadius: 9999,
      background: 'rgba(62,91,255,0.12)',
      border: '1px solid rgba(62,91,255,0.25)',
      color: '#7A9FFF',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

export function ModalConfigEmpresa({ aberto, onFechar }: ModalConfigEmpresaProps) {
  const { user } = useAuth()
  const { workspaces } = useWorkspace()

  return (
    <Dialog.Root open={aberto} onOpenChange={open => { if (!open) onFechar() }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.60)',
          backdropFilter: 'blur(4px)',
          animation: 'fadeIn 150ms ease',
        }} />
        <Dialog.Content style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
          width: '100%', maxWidth: 440,
          background: 'linear-gradient(160deg, #0d1b36 0%, #0a1228 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 14,
          padding: '24px 24px 28px',
          outline: 'none',
          boxShadow: '0 20px 60px rgba(0,0,0,0.50)',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <Dialog.Title style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>
              Config. da empresa
            </Dialog.Title>
            <Dialog.Close asChild>
              <button style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.40)', padding: 4, borderRadius: 6,
                display: 'flex', alignItems: 'center',
              }}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* Seção: Meu acesso */}
          <section style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <ShieldCheck size={13} style={{ color: BRAND_PRIMARY }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Meu acesso
              </span>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Nome</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{user?.nome ?? '—'}</span>
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>E-mail</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.70)' }}>{user?.email ?? '—'}</span>
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Perfil</span>
                <RoleBadge role={user?.role ?? ''} />
              </div>
            </div>
          </section>

          {/* Seção: Empresas vinculadas */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <Building2 size={13} style={{ color: BRAND_PRIMARY }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Empresas vinculadas
              </span>
            </div>

            {workspaces.length === 0 ? (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '16px 0' }}>
                Nenhuma empresa vinculada
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {workspaces.map(ws => (
                  <div key={ws.workspace_id} style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>
                        {ws.workspace_nome ?? 'Empresa sem nome'}
                      </span>
                      <RoleBadge role={ws.role} />
                    </div>
                    {ws.padrao && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 7px',
                        borderRadius: 9999,
                        background: 'rgba(15,168,86,0.12)',
                        border: '1px solid rgba(15,168,86,0.25)',
                        color: '#4ade80',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                      }}>
                        padrão
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
