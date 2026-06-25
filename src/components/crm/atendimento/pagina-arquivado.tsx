'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { WSTableShell, WSTable } from '@/components/ui/ws-table'
import { Archive, Search, RefreshCw, CheckCircle2, XCircle, X, Loader2 } from 'lucide-react'
import { useWorkspace } from '@/lib/workspace-context'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ConversaArquivada {
  id: string
  created_at: string | null
  updated_at: string | null
  ultima_mensagem: string | null
  lead_status: string | null
  contato_nome: string | null
  contato_telefone: string | null
  resolucao: string | null
  observacao: string | null
  responsavel_fechamento: string | null
}

interface Kpis { total: number; ganho: number; perdido: number }
type FiltroTab = 'todos' | 'ganho' | 'perdido'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatarData(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function normalizarResolucao(val: string | null): 'ganho' | 'perdido' | null {
  if (!val) return null
  const l = val.toLowerCase()
  if (l === 'ganho') return 'ganho'
  if (l === 'perdido') return 'perdido'
  return null
}

const thStyle = { padding: '10px 14px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--ws-glass-border)', textAlign: 'left' } as const
const tdStyle = { padding: '10px 14px', borderBottom: '1px solid var(--ws-glass-border)', verticalAlign: 'middle' } as const

// ─── Modal de Edição ──────────────────────────────────────────────────────────

function ModalEditar({
  conversa,
  onSalvar,
  onFechar,
}: {
  conversa: ConversaArquivada
  onSalvar: (id: string, resolucao: string, observacao: string) => Promise<void>
  onFechar: () => void
}) {
  const [resolucao, setResolucao] = useState<'ganho' | 'perdido'>(
    normalizarResolucao(conversa.resolucao) ?? 'ganho'
  )
  const [observacao, setObservacao] = useState(conversa.observacao ?? '')
  const [salvando, setSalvando] = useState(false)

  async function handleSalvar() {
    setSalvando(true)
    await onSalvar(conversa.id, resolucao, observacao)
    setSalvando(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(5,8,22,0.7)',
      backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000, padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
        borderRadius: 16, boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid var(--ws-glass-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ws-text-1)' }}>
              Editar desfecho
            </div>
            <div style={{ fontSize: 12, color: 'var(--ws-text-3)', marginTop: 2 }}>
              {conversa.contato_nome ?? '—'}
            </div>
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', color: 'var(--ws-text-3)', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-2)', marginBottom: 10 }}>
              Resultado *
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['ganho', 'perdido'] as const).map(op => (
                <button
                  key={op}
                  onClick={() => setResolucao(op)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s',
                    border: resolucao === op
                      ? `2px solid ${op === 'ganho' ? '#0fa856' : '#a32d2d'}`
                      : '2px solid var(--ws-glass-border)',
                    background: resolucao === op
                      ? op === 'ganho' ? 'rgba(15,168,86,0.12)' : 'rgba(163,45,45,0.12)'
                      : 'transparent',
                    color: resolucao === op
                      ? op === 'ganho' ? '#0fa856' : '#a32d2d'
                      : 'var(--ws-text-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {op === 'ganho' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                  {op === 'ganho' ? 'Ganho' : 'Perdido'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-2)', marginBottom: 8 }}>
              Observação (opcional)
            </div>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="Motivo ou detalhes..."
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13,
                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ws-glass-border)',
                color: 'var(--ws-text-1)', outline: 'none', resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Button variant="outline" onClick={onFechar} style={{ flex: 1 }} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvar}
              disabled={salvando}
              style={{
                flex: 1.5,
                background: resolucao === 'ganho' ? '#0fa856' : '#a32d2d',
                color: 'white',
              }}
            >
              {salvando && <Loader2 size={14} className="animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function PaginaArquivado() {
  const { workspaceAtual, loading: workspaceLoading } = useWorkspace()
  const workspaceResolvido = !workspaceLoading && workspaceAtual !== null

  const [conversas, setConversas] = useState<ConversaArquivada[]>([])
  const [kpis, setKpis] = useState<Kpis>({ total: 0, ganho: 0, perdido: 0 })
  const [filtroTab, setFiltroTab] = useState<FiltroTab>('todos')
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<ConversaArquivada | null>(null)

  const carregar = useCallback(async (tab: FiltroTab) => {
    if (!workspaceAtual) return
    try {
      setCarregando(true)
      setErro(null)
      const res = await fetch(
        `/api/whatsapp/conversations/arquivadas?resolucao=${tab}&workspace_id=${workspaceAtual}`
      )
      if (!res.ok) throw new Error('Erro ao carregar conversas arquivadas')
      const data = await res.json()
      setConversas(data.conversas ?? [])
      setKpis(data.kpis ?? { total: 0, ganho: 0, perdido: 0 })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setCarregando(false)
    }
  }, [workspaceAtual])

  useEffect(() => {
    if (workspaceResolvido) carregar(filtroTab)
  }, [filtroTab, carregar, workspaceResolvido])

  function handleTab(tab: FiltroTab) {
    setFiltroTab(tab)
    setBusca('')
  }

  async function handleSalvarEditar(id: string, resolucao: string, observacao: string) {
    const res = await fetch(`/api/whatsapp/conversations/arquivadas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolucao, observacao }),
    })
    if (res.ok) {
      setEditando(null)
      await carregar(filtroTab)
    }
  }

  const conversasFiltradas = busca.trim()
    ? conversas.filter(c =>
        (c.contato_nome ?? '').toLowerCase().includes(busca.toLowerCase()) ||
        (c.contato_telefone ?? '').includes(busca) ||
        (c.responsavel_fechamento ?? '').toLowerCase().includes(busca.toLowerCase())
      )
    : conversas

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Archive size={22} style={{ color: 'var(--ws-blue)' }} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ws-text-1)', margin: 0 }}>Arquivado</h1>
            <p style={{ fontSize: 13, color: 'var(--ws-text-3)', margin: 0 }}>Conversas encerradas — Ganho e Perdido</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => carregar(filtroTab)}
          disabled={carregando}
        >
          {carregando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Atualizar
        </Button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { label: 'TOTAL', value: kpis.total, color: 'var(--ws-blue)', bg: 'rgba(62,91,255,0.08)', icon: <Archive size={18} /> },
          { label: 'GANHO', value: kpis.ganho, color: '#0fa856', bg: 'rgba(15,168,86,0.08)', icon: <CheckCircle2 size={18} /> },
          { label: 'PERDIDO', value: kpis.perdido, color: '#a32d2d', bg: 'rgba(163,45,45,0.08)', icon: <XCircle size={18} /> },
        ].map(kpi => (
          <div key={kpi.label} style={{
            background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
            borderRadius: 14, padding: '16px 20px', backdropFilter: 'blur(16px)',
            boxShadow: 'var(--ws-glass-shadow)', display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: kpi.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: kpi.color, flexShrink: 0,
            }}>
              {kpi.icon}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ws-text-3)' }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color, lineHeight: 1.1 }}>
                {carregando ? '—' : kpi.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs + Busca */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', borderRadius: 10, padding: 4 }}>
          {(['todos', 'ganho', 'perdido'] as FiltroTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => handleTab(tab)}
              style={{
                padding: '6px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500,
                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: filtroTab === tab
                  ? tab === 'ganho' ? 'rgba(15,168,86,0.15)' : tab === 'perdido' ? 'rgba(163,45,45,0.15)' : 'rgba(62,91,255,0.12)'
                  : 'transparent',
                color: filtroTab === tab
                  ? tab === 'ganho' ? '#0fa856' : tab === 'perdido' ? '#a32d2d' : 'var(--ws-blue)'
                  : 'var(--ws-text-3)',
              }}
            >
              {tab === 'todos' ? 'Todos' : tab === 'ganho' ? '✓ Ganho' : '✗ Perdido'}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', flex: '0 1 280px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-3)' }} />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone..."
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, fontSize: 13,
              background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
              color: 'var(--ws-text-1)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Tabela HeroUI */}
      {erro ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#a32d2d', fontSize: 14 }}>
          Erro ao carregar dados: {erro}
        </div>
      ) : (
        <WSTableShell>
          <WSTable minWidth={900}>
            <thead>
              <tr>
                <th className="ds-table-th" style={thStyle}>Data Entrada</th>
                <th className="ds-table-th" style={thStyle}>Últ. Atualização</th>
                <th className="ds-table-th" style={thStyle}>Nome</th>
                <th className="ds-table-th" style={thStyle}>Telefone</th>
                <th className="ds-table-th" style={thStyle}>Responsável Fechamento</th>
                <th className="ds-table-th" style={thStyle}>Resumo da Conversa</th>
                <th className="ds-table-th" style={thStyle}>Status</th>
                <th className="ds-table-th" style={thStyle}>Fase Lead</th>
                <th className="ds-table-th" style={thStyle}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {conversasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="ds-table-td" style={{ ...tdStyle, textAlign: 'center', color: 'var(--ws-text-3)' }}>
                    {carregando ? 'Carregando...' : 'Nenhuma conversa arquivada encontrada'}
                  </td>
                </tr>
              ) : conversasFiltradas.map(c => {
                const tipo = normalizarResolucao(c.resolucao)
                return (
                  <tr key={c.id}>
                    <td className="ds-table-td" style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--ws-text-2)', whiteSpace: 'nowrap' }}>
                        {formatarData(c.created_at)}
                      </span>
                    </td>
                    <td className="ds-table-td" style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--ws-text-2)', whiteSpace: 'nowrap' }}>
                        {formatarData(c.updated_at)}
                      </span>
                    </td>
                    <td className="ds-table-td" style={tdStyle}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{c.contato_nome ?? '—'}</span>
                    </td>
                    <td className="ds-table-td" style={tdStyle}>
                      <span style={{ fontSize: 12, color: 'var(--ws-text-2)' }}>{c.contato_telefone ?? '—'}</span>
                    </td>
                    <td className="ds-table-td" style={tdStyle}>
                      <span style={{ fontSize: 13, color: 'var(--ws-text-2)' }}>{c.responsavel_fechamento ?? '—'}</span>
                    </td>
                    <td className="ds-table-td" style={tdStyle}>
                      <span style={{
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        fontSize: 12, color: 'var(--ws-text-2)', maxWidth: 220,
                      }}>
                        {c.observacao || c.ultima_mensagem || '—'}
                      </span>
                    </td>
                    <td className="ds-table-td" style={tdStyle}>
                      {tipo ? (
                        <Badge variant="secondary" style={{ background: tipo === 'ganho' ? 'rgba(15,168,86,0.12)' : 'rgba(163,45,45,0.12)', color: tipo === 'ganho' ? '#0fa856' : '#a32d2d', border: 'none' }}>
                          {tipo === 'ganho' ? 'Ganho' : 'Perdido'}
                        </Badge>
                      ) : (
                        <span style={{ color: 'var(--ws-text-3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td className="ds-table-td" style={tdStyle}>
                      {c.lead_status ? (
                        <Badge variant="secondary" style={{ background: 'rgba(107,114,128,0.16)', color: 'var(--ws-text-2)', border: 'none' }}>{c.lead_status}</Badge>
                      ) : (
                        <span style={{ color: 'var(--ws-text-3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td className="ds-table-td" style={tdStyle}>
                      <Button size="sm" variant="ghost" onClick={() => setEditando(c)}>
                        Editar
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </WSTable>
        </WSTableShell>
      )}

      {/* Rodapé */}
      {!carregando && !erro && (
        <div style={{ fontSize: 12, color: 'var(--ws-text-3)', textAlign: 'right' }}>
          {conversasFiltradas.length} {conversasFiltradas.length === 1 ? 'conversa' : 'conversas'} exibida{conversasFiltradas.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Modal de edição */}
      {editando && (
        <ModalEditar
          conversa={editando}
          onSalvar={handleSalvarEditar}
          onFechar={() => setEditando(null)}
        />
      )}
    </div>
  )
}
