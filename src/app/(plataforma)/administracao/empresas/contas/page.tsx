'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  CreditCard,
  Loader2,
  Pencil,
  Plus,
  Search,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { WSTableShell, WSTable } from '@/components/ui/ws-table'
import { useAuth } from '@/hooks/use-auth'
import api from '@/lib/api-client'

interface Workspace {
  id: string
  nome: string
  razao_social: string | null
  cnpj: string | null
  ativo: boolean
  modulos: string[]
}

const MODULOS = [
  { id: 'marketing', label: 'Marketing' },
  { id: 'crm', label: 'CRM' },
  { id: 'gestao', label: 'Gestão' },
  { id: 'performance', label: 'Performance' },
]

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

const thStyle = { padding: '10px 14px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--ws-glass-border)', textAlign: 'left' } as const
const tdStyle = { padding: '10px 14px', borderBottom: '1px solid var(--ws-glass-border)', verticalAlign: 'middle' } as const

export default function ClientesPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()

  const [clientes, setClientes] = useState<Workspace[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (!authLoading && user && user.role !== 'platform_admin') router.push('/')
  }, [authLoading, user, router])

  const refreshClientes = useCallback(async () => {
    const data = await api.get<Workspace[]>('/workspaces')
    setClientes(data)
    return data
  }, [])

  useEffect(() => {
    if (user?.role !== 'platform_admin') return

    let ativo = true

    const carregar = async () => {
      setCarregando(true)
      try {
        await refreshClientes()
      } catch (err: unknown) {
        if (ativo) {
          toast.error(getErrorMessage(err, 'Erro ao carregar clientes'))
        }
      } finally {
        if (ativo) {
          setCarregando(false)
        }
      }
    }

    void carregar()

    return () => {
      ativo = false
    }
  }, [user, refreshClientes])

  const filtrados = clientes.filter(c => {
    const t = busca.toLowerCase()
    return (
      c.nome.toLowerCase().includes(t) ||
      (c.cnpj || '').includes(t) ||
      (c.razao_social?.toLowerCase() || '').includes(t)
    )
  })

  if (authLoading || !user || user.role !== 'platform_admin') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>
            Clientes
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
            Gerencie os workspaces e suas configurações
          </p>
        </div>
        <button
          onClick={() => router.push('/administracao/empresas/contas/novo')}
          style={{
            background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
            border: 'none', padding: '0 20px', height: 42, borderRadius: 10,
            fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 12px rgba(62,91,255,0.30)',
          }}
        >
          <Plus size={16} />
          Novo Cliente
        </button>
      </div>

      {/* Busca */}
      <div style={{
        background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
        borderRadius: 12, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 24, backdropFilter: 'blur(10px)',
      }}>
        <Search size={16} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Buscar por nome, CNPJ ou razão social..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 14, color: 'var(--ws-text-1)', outline: 'none' }}
        />
        <span style={{ fontSize: 12, color: 'var(--ws-text-3)', flexShrink: 0 }}>
          {filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tabela */}
      {carregando ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 12 }}>Carregando clientes...</p>
        </div>
      ) : (
        <WSTableShell>
          <WSTable minWidth={700}>
            <thead>
              <tr>
                <th className="ds-table-th" style={thStyle}>Nome</th>
                <th className="ds-table-th" style={thStyle}>CNPJ</th>
                <th className="ds-table-th" style={thStyle}>Módulos</th>
                <th className="ds-table-th" style={thStyle}>Status</th>
                <th className="ds-table-th" style={thStyle}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="ds-table-td" style={{ ...tdStyle, textAlign: 'center', color: 'var(--ws-text-3)' }}>
                    <Building2 size={28} style={{ color: 'var(--ws-text-3)', marginBottom: 10 }} />
                    <p style={{ fontSize: 13, color: 'var(--ws-text-2)' }}>
                      {busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
                    </p>
                    {!busca && (
                      <p style={{ fontSize: 12, color: 'var(--ws-text-3)', marginTop: 4 }}>
                        Clique em &ldquo;Novo Cliente&rdquo; para começar
                      </p>
                    )}
                  </td>
                </tr>
              ) : filtrados.map(c => (
                <tr key={c.id}>
                  <td className="ds-table-td" style={tdStyle}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)' }}>{c.nome}</div>
                      {c.razao_social && (
                        <div style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{c.razao_social}</div>
                      )}
                    </div>
                  </td>
                  <td className="ds-table-td" style={tdStyle}>
                    <span style={{ fontSize: 13, color: 'var(--ws-text-2)' }}>{c.cnpj || '—'}</span>
                  </td>
                  <td className="ds-table-td" style={tdStyle}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(c.modulos || []).length === 0 ? (
                        <span style={{ fontSize: 12, color: 'var(--ws-text-3)' }}>—</span>
                      ) : (c.modulos || []).map(m => (
                        <Badge key={m} variant="secondary">
                          {MODULOS.find(x => x.id === m)?.label || m}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="ds-table-td" style={tdStyle}>
                    <Badge variant="secondary" style={{ background: c.ativo ? 'rgba(15,168,86,0.12)' : 'rgba(163,45,45,0.12)', color: c.ativo ? '#0fa856' : '#a32d2d', border: 'none' }}>
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="ds-table-td" style={tdStyle}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <Button size="icon-sm" variant="ghost" onClick={() => router.push(`/administracao/empresas/contas/${c.id}/editar`)}>
                        <Pencil size={14} />
                      </Button>
                      <Button size="icon-sm" variant="ghost" disabled>
                        <CreditCard size={14} />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => router.push(`/administracao/usuarios?workspace_id=${c.id}`)}>
                        <Users size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </WSTable>
        </WSTableShell>
      )}
    </div>
  )
}
