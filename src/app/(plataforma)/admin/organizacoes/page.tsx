'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Search, Plus, Users, CircleDot, Loader2, ArrowLeft } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'

interface OrgRow {
  id: string
  nome: string
  slug: string
  cnpj: string | null
  status: string
  nivel_plano: string
  total_usuarios: number
  created_at: string
}

const PLANO_LABELS: Record<string, string> = {
  basico: 'Basico',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

const PLANO_COLORS: Record<string, string> = {
  basico: '#888',
  pro: '#3E5BFF',
  enterprise: '#c9a84c',
}

export default function OrganizacoesAdminPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()

  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!authLoading && user && user.level !== 0) {
      router.push('/')
    }
  }, [authLoading, user, router])

  useEffect(() => {
    if (user?.level === 0) {
      loadOrgs()
    }
  }, [user])

  async function loadOrgs() {
    setCarregando(true)
    try {
      const data = await apiGet<OrgRow[]>('/admin/organizacoes')
      setOrgs(data)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar organizacoes')
    } finally {
      setCarregando(false)
    }
  }

  const filtrados = orgs.filter(o => {
    const termo = busca.toLowerCase()
    return (
      o.nome.toLowerCase().includes(termo) ||
      o.slug.toLowerCase().includes(termo) ||
      (o.cnpj || '').includes(termo)
    )
  })

  if (authLoading || (!user || user.level !== 0)) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '60vh', gap: 16,
      }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue, #3E5BFF)' }} />
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Verificando permissoes...</span>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button 
            onClick={() => router.back()}
            style={{
              background: 'var(--ws-glass-bg)',
              border: '1px solid var(--ws-glass-border)',
              borderRadius: '10px',
              width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', outline: 'none',
              backdropFilter: 'blur(10px)',
              color: 'var(--ws-text-1)'
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>
              Organizacoes
            </h1>
            <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '4px 0 0 0' }}>
              Gerencie clientes e resellers da plataforma
            </p>
          </div>
        </div>
        <button 
          onClick={() => router.push('/admin/organizacoes/nova')}
          style={{
            background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
            border: 'none',
            padding: '0 20px', height: 42, borderRadius: 10,
            fontSize: 13, fontWeight: 600, color: 'white',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 12px rgba(62,91,255,0.3)',
          }}
        >
          <Plus size={16} />
          Nova Organizacao
        </button>
      </div>

      {/* Busca */}
      <div style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: '12px',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 24,
        backdropFilter: 'blur(10px)',
      }}>
        <Search size={16} style={{ color: 'var(--ws-text-3)' }} />
        <input 
          type="text"
          placeholder="Buscar por nome, slug ou CNPJ..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            fontSize: 14, color: 'var(--ws-text-1)', outline: 'none'
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--ws-text-3)' }}>{filtrados.length} resultados</span>
      </div>

      {/* Tabela */}
      <div style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: '14px',
        overflow: 'hidden',
        backdropFilter: 'blur(16px)',
      }}>
        {carregando ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
            <p style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 12 }}>Carregando organizacoes...</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Building2 size={32} style={{ color: 'var(--ws-text-3)', marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: 'var(--ws-text-2)' }}>Nenhuma organizacao encontrada</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--ws-glass-border)' }}>
                {['Organizacao', 'Plano', 'Usuarios', 'Status', 'Criada em'].map(h => (
                  <th key={h} style={{
                    padding: '14px 18px', fontSize: 11, fontWeight: 600,
                    color: 'var(--ws-text-2)', textAlign: 'left',
                    textTransform: 'uppercase', letterSpacing: '0.04em'
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(o => (
                <tr key={o.id} style={{
                  borderBottom: '1px solid var(--ws-glass-border)',
                  transition: 'background 0.15s',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--ws-glass-bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #3E5BFF, #00F5FF)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Building2 size={16} color="white" />
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ws-text-1)' }}>
                          {o.nome}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ws-text-3)' }}>
                          @{o.slug}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                      background: `${PLANO_COLORS[o.nivel_plano] || '#888'}20`,
                      color: PLANO_COLORS[o.nivel_plano] || '#888',
                    }}>
                      <CircleDot size={12} />
                      {PLANO_LABELS[o.nivel_plano] || o.nivel_plano}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ws-text-1)' }}>
                      <Users size={13} style={{ color: 'var(--ws-text-3)' }} />
                      {o.total_usuarios}
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: o.status === 'ativo' ? 'rgba(15,168,86,0.15)' : 'rgba(239,68,68,0.15)',
                      color: o.status === 'ativo' ? '#0fa856' : '#ef4444',
                    }}>
                      {o.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: 12, color: 'var(--ws-text-3)' }}>
                    {new Date(o.created_at).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
