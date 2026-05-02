'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Search, Plus, Shield, Building2, Mail, Phone, Loader2, ArrowLeft } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'

interface UsuarioRow {
  id: string
  email: string
  nome: string | null
  nivel: number
  cargo: string | null
  telefone: string | null
  user_status: string
  perfil_status: string
  org_nome: string | null
  org_slug: string | null
  created_at: string
  last_login_at: string | null
}

const NIVEL_LABELS: Record<number, string> = {
  0: 'Super Admin',
  1: 'Admin',
  2: 'Gerente',
  3: 'Estrategista',
  4: 'Basico',
  99: 'Padrao',
}

const NIVEL_COLORS: Record<number, string> = {
  0: '#3E5BFF',
  1: '#7A5AF8',
  2: '#00F5FF',
  3: '#c9a84c',
  4: '#888',
}

export default function UsuariosAdminPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()

  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!authLoading && user && user.level !== 0) {
      router.push('/')
    }
  }, [authLoading, user, router])

  useEffect(() => {
    if (user?.level === 0) {
      loadUsuarios()
    }
  }, [user])

  async function loadUsuarios() {
    setCarregando(true)
    try {
      const data = await apiGet<UsuarioRow[]>('/admin/usuarios')
      setUsuarios(data)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar usuarios')
    } finally {
      setCarregando(false)
    }
  }

  const filtrados = usuarios.filter(u => {
    const termo = busca.toLowerCase()
    return (
      u.email.toLowerCase().includes(termo) ||
      (u.nome?.toLowerCase() || '').includes(termo) ||
      (u.org_nome?.toLowerCase() || '').includes(termo)
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
              Usuarios
            </h1>
            <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '4px 0 0 0' }}>
              Gerencie acessos e permissoes da plataforma
            </p>
          </div>
        </div>
        <button 
          onClick={() => router.push('/admin/usuarios/novo')}
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
          Novo Usuario
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
          placeholder="Buscar por nome, email ou organizacao..."
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
            <p style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 12 }}>Carregando usuarios...</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Users size={32} style={{ color: 'var(--ws-text-3)', marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: 'var(--ws-text-2)' }}>Nenhum usuario encontrado</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--ws-glass-border)' }}>
                {['Usuario', 'Nivel', 'Organizacao', 'Status', 'Criado em'].map(h => (
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
              {filtrados.map(u => (
                <tr key={u.id} style={{
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
                        background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 600, color: 'white',
                      }}>
                        {(u.nome?.[0] || u.email[0]).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ws-text-1)' }}>
                          {u.nome || '-'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ws-text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Mail size={10} />
                          {u.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                      background: `${NIVEL_COLORS[u.nivel] || '#888'}20`,
                      color: NIVEL_COLORS[u.nivel] || '#888',
                    }}>
                      <Shield size={12} />
                      {NIVEL_LABELS[u.nivel] || `Nivel ${u.nivel}`}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ws-text-1)' }}>
                      <Building2 size={13} style={{ color: 'var(--ws-text-3)' }} />
                      {u.org_nome || 'Sem org'}
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: u.perfil_status === 'ativo' ? 'rgba(15,168,86,0.15)' : 'rgba(239,68,68,0.15)',
                      color: u.perfil_status === 'ativo' ? '#0fa856' : '#ef4444',
                    }}>
                      {u.perfil_status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: 12, color: 'var(--ws-text-3)' }}>
                    {new Date(u.created_at).toLocaleDateString('pt-BR')}
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
