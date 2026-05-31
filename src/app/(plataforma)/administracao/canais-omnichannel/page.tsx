'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Search, X, Copy, Check, Link2, Smartphone, Calendar, QrCode, Power, PowerOff, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { wsSheetCreamCloseButtonStyle, wsSheetCreamInputStyle, wsSheetCreamStyle, wsSheetCreamTokens } from '@/components/ui/ws-sheet'
import { useAuth } from '@/hooks/use-auth'
import api from '@/lib/api-client'

interface Workspace {
  id: string
  nome: string
}

interface Canal {
  id: string
  workspace_id: string
  tipo: TipoCanal
  nome: string
  provider?: string
  provider_label?: string
  config: Record<string, string>
  mensagem_boas_vindas: string | null
  webhook_token: string | null
  status: string
  numero_telefone: string | null
  conectado_em: string | null
  evolution_instance_id: string | null
  connection_status: string | null
}

type TipoCanal =
  | 'whatsapp_evolution'
  | 'whatsapp_oficial'
  | 'instagram'
  | 'facebook'
  | 'webhook'
  | 'todos'

const TIPOS: { id: Exclude<TipoCanal, 'todos'>; label: string; emoji: string; cor: string; corBg: string }[] = [
  { id: 'whatsapp_evolution', label: 'WhatsApp Evolution', emoji: '📱', cor: '#25D366', corBg: 'rgba(37,211,102,0.15)' },
  { id: 'whatsapp_oficial',   label: 'WhatsApp Oficial',   emoji: '💬', cor: '#075E54', corBg: 'rgba(7,94,84,0.18)' },
  { id: 'instagram',          label: 'Instagram',          emoji: '📷', cor: '#E1306C', corBg: 'rgba(225,48,108,0.15)' },
  { id: 'facebook',           label: 'Facebook',           emoji: '👤', cor: '#1877F2', corBg: 'rgba(24,119,242,0.15)' },
  { id: 'webhook',            label: 'Webhook/API',        emoji: '🔗', cor: '#F59E0B', corBg: 'rgba(245,158,11,0.15)' },
]

const FILTROS: { id: TipoCanal; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  ...TIPOS.map(t => ({ id: t.id, label: t.label })),
]

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  ativo:   { label: 'Ativo',   bg: 'rgba(15,168,86,0.15)',  color: 'var(--ws-green)' },
  inativo: { label: 'Inativo', bg: 'rgba(255,255,255,0.08)', color: 'var(--ws-text-2)' },
  erro:    { label: 'Erro',    bg: 'rgba(255,92,141,0.15)', color: 'var(--ws-coral)' },
}

const CONN_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  connected:    { label: 'Conectado',    bg: 'rgba(15,168,86,0.15)',  color: 'var(--ws-green)' },
  connecting:   { label: 'Conectando',   bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  disconnected: { label: 'Desconectado', bg: 'rgba(163,45,45,0.15)',  color: '#a32d2d' },
}

const WEBHOOK_BASE = 'https://api.op7franquia.com.br/webhook'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  ...wsSheetCreamInputStyle,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ws-text-2)',
  display: 'block',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

function isDark() {
  if (typeof window === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

function emptyForm() {
  return {
    workspace_id: '',
    tipo: 'whatsapp_evolution' as Exclude<TipoCanal, 'todos'>,
    nome: '',
    mensagem_boas_vindas: '',
    config: {} as Record<string, string>,
  }
}

function tipoInfo(id: string) {
  return TIPOS.find(t => t.id === id)
}

export default function CanaisOmnichannelPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()

  const [canais, setCanais] = useState<Canal[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<TipoCanal>('todos')
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [canalCriado, setCanalCriado] = useState<Canal | null>(null)
  const [copiado, setCopiado] = useState(false)

  // Edição
  const [editDrawerAberto, setEditDrawerAberto] = useState(false)
  const [canalEditando, setCanalEditando] = useState<Canal | null>(null)
  const [editForm, setEditForm] = useState({ nome: '', mensagem_boas_vindas: '', config: {} as Record<string, string> })
  const [editSalvando, setEditSalvando] = useState(false)

  // QR Code / Conexão
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [conectando, setConectando] = useState(false)
  const [pollingId, setPollingId] = useState<ReturnType<typeof setInterval> | null>(null)

  // Exclusão
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && user && user.role !== 'platform_admin') router.push('/')
  }, [authLoading, user, router])

  const loadCanais = useCallback(async () => {
    setCarregando(true)
    try {
      const data = await api.get<Canal[]>('/canais')
      setCanais(data)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar canais')
    } finally {
      setCarregando(false)
    }
  }, [])

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await api.get<Workspace[]>('/workspaces')
      setWorkspaces(data)
    } catch {
      // non-blocking
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'platform_admin') {
      loadCanais()
      loadWorkspaces()
    }
  }, [user, loadCanais, loadWorkspaces])

  const workspaceNome = (id: string) => workspaces.find(w => w.id === id)?.nome ?? '—'

  async function salvar() {
    if (!form.workspace_id) { toast.error('Selecione um cliente'); return }
    if (!form.nome.trim()) { toast.error('Nome do canal é obrigatório'); return }
    setSalvando(true)
    try {
      const criado = await api.post<Canal>(`/workspaces/${form.workspace_id}/canais`, {
        tipo: form.tipo,
        nome: form.nome.trim(),
        mensagem_boas_vindas: form.mensagem_boas_vindas.trim() || null,
        config: form.config,
        status: 'inativo',
      })
      setCanais(prev => [criado, ...prev])
      if (form.tipo === 'webhook' && criado.webhook_token) {
        setCanalCriado(criado)
      } else {
        fecharDrawer()
        toast.success('Canal criado com sucesso!')
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar canal')
    } finally {
      setSalvando(false)
    }
  }

  function fecharDrawer() {
    setDrawerAberto(false)
    setForm(emptyForm())
    setCanalCriado(null)
    setCopiado(false)
  }

  function setConfig(key: string, value: string) {
    setForm(prev => ({ ...prev, config: { ...prev.config, [key]: value } }))
  }

  function copiarWebhook() {
    if (!canalCriado?.webhook_token) return
    navigator.clipboard.writeText(`${WEBHOOK_BASE}/${canalCriado.webhook_token}`)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  // ── Edição ─────────────────────────────────────────────────────────

  function abrirEdicao(canal: Canal) {
    setCanalEditando(canal)
    setEditForm({
      nome: canal.nome,
      mensagem_boas_vindas: canal.mensagem_boas_vindas ?? '',
      config: canal.config ?? {},
    })
    setQrCode(null)
    setPairingCode(null)
    setConectando(false)
    setEditDrawerAberto(true)
  }

  function fecharEdicao() {
    setEditDrawerAberto(false)
    setCanalEditando(null)
    setEditForm({ nome: '', mensagem_boas_vindas: '', config: {} })
    setQrCode(null)
    setPairingCode(null)
    setConectando(false)
    if (pollingId) {
      clearInterval(pollingId)
      setPollingId(null)
    }
  }

  async function excluirCanal(canal: Canal) {
    const confirmar = window.confirm(`Tem certeza que deseja excluir o canal "${canal.nome}"? Esta ação também removerá a instância na Evolution e não poderá ser desfeita.`)
    if (!confirmar) return

    setExcluindoId(canal.id)
    try {
      await api.delete(`/canais/${canal.id}`)
      setCanais(prev => prev.filter(c => c.id !== canal.id))
      toast.success('Canal excluído com sucesso')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir canal')
    } finally {
      setExcluindoId(null)
    }
  }

  async function salvarEdicao() {
    if (!canalEditando) return
    if (!editForm.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setEditSalvando(true)
    try {
      const atualizado = await api.put<Canal>(`/canais/${canalEditando.id}`, {
        nome: editForm.nome.trim(),
        config: editForm.config,
        mensagem_boas_vindas: editForm.mensagem_boas_vindas.trim() || null,
        status: canalEditando.status,
      })
      setCanais(prev => prev.map(c => c.id === atualizado.id ? atualizado : c))
      setCanalEditando(atualizado)
      toast.success('Canal atualizado')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar canal')
    } finally {
      setEditSalvando(false)
    }
  }

  async function conectarEvolution() {
    if (!canalEditando || canalEditando.tipo !== 'whatsapp_evolution') return
    if (pollingId) {
      clearInterval(pollingId)
      setPollingId(null)
    }
    setConectando(true)
    setQrCode(null)
    setPairingCode(null)
    try {
      const resp = await api.post<{
        qr_code: string | null
        pairing_code: string | null
        connection_status: string
        instance_id: string | null
        message: string
      }>(`/canais/${canalEditando.id}/conectar`)

      setCanalEditando(prev => prev ? { ...prev, connection_status: resp.connection_status } : prev)

      if (resp.qr_code || resp.pairing_code || resp.connection_status === 'connecting') {
        if (resp.qr_code) setQrCode(resp.qr_code)
        if (resp.pairing_code) setPairingCode(resp.pairing_code)
        const id = setInterval(async () => {
          try {
            const status = await api.get<{
              connection_status: string
              evolution_state: string
              numero_telefone: string | null
              conectado_em: string | null
              qr_code: string | null
              pairing_code: string | null
              instance_id: string | null
            }>(`/canais/${canalEditando.id}/status-evolution`)
            if (status.connection_status === 'connected') {
              const canalAtualizado = await api.get<Canal>(`/canais/${canalEditando.id}`)
              setCanais(prev => prev.map(c => c.id === canalAtualizado.id ? canalAtualizado : c))
              setCanalEditando(canalAtualizado)
              setQrCode(null)
              setPairingCode(null)
              setConectando(false)
              clearInterval(id)
              setPollingId(null)
              toast.success('WhatsApp conectado!')
            }
          } catch {
            // ignore polling errors
          }
        }, 3000)
        setPollingId(id)
      } else if (resp.connection_status === 'connected') {
        const canalAtualizado = await api.get<Canal>(`/canais/${canalEditando.id}`)
        setCanais(prev => prev.map(c => c.id === canalAtualizado.id ? canalAtualizado : c))
        setCanalEditando(canalAtualizado)
        setQrCode(null)
        setPairingCode(null)
        setConectando(false)
        toast.success('WhatsApp conectado!')
      } else {
        setConectando(false)
        toast.info(resp.message)
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao conectar')
      setConectando(false)
    }
  }

  async function desconectarEvolution() {
    if (!canalEditando || canalEditando.tipo !== 'whatsapp_evolution') return
    try {
      if (pollingId) {
        clearInterval(pollingId)
        setPollingId(null)
      }
      await api.post(`/canais/${canalEditando.id}/desconectar`)
      const atualizado = { ...canalEditando, connection_status: 'disconnected', numero_telefone: null, conectado_em: null }
      setCanais(prev => prev.map(c => c.id === atualizado.id ? atualizado : c))
      setCanalEditando(atualizado)
      setQrCode(null)
      setPairingCode(null)
      toast.success('Desconectado')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao desconectar')
    }
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingId) clearInterval(pollingId)
    }
  }, [pollingId])

  const filtrados = canais.filter(c => {
    const t = busca.toLowerCase()
    const matchBusca = c.nome.toLowerCase().includes(t) || workspaceNome(c.workspace_id).toLowerCase().includes(t)
    const matchTipo = filtroTipo === 'todos' || c.tipo === filtroTipo
    return matchBusca && matchTipo
  })

  const contagemPorTipo = TIPOS.reduce<Record<string, number>>((acc, t) => {
    acc[t.id] = canais.filter(c => c.tipo === t.id).length
    return acc
  }, {})

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>
            Canais Omnichannel
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
            Gerencie canais de entrada de leads e atendimento
          </p>
        </div>
        <button
          onClick={() => setDrawerAberto(true)}
          style={{
            background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
            border: 'none', padding: '0 20px', height: 42, borderRadius: 10,
            fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 12px rgba(62,91,255,0.30)',
          }}
        >
          <Plus size={16} />
          Novo Canal
        </button>
      </div>

      {/* Cards de tipo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 28 }}>
        {TIPOS.map(t => (
          <div
            key={t.id}
            onClick={() => setFiltroTipo(prev => prev === t.id ? 'todos' : t.id)}
            style={{
              background: filtroTipo === t.id ? t.corBg : 'var(--ws-glass-bg)',
              border: filtroTipo === t.id ? `1px solid ${t.cor}` : '1px solid rgba(15,39,68,0.12)',
              borderRadius: 12, padding: '16px 14px',
              cursor: 'pointer', backdropFilter: 'blur(12px)',
              transition: 'all 0.15s',
              boxShadow: filtroTipo === t.id ? `0 2px 8px ${t.corBg}` : '0 1px 3px rgba(14,20,42,0.04)',
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 8 }}>{t.emoji}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: filtroTipo === t.id ? t.cor : 'var(--ws-text-2)', marginBottom: 4, lineHeight: 1.3 }}>
              {t.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: filtroTipo === t.id ? t.cor : 'var(--ws-text-1)' }}>
              {contagemPorTipo[t.id] ?? 0}
            </div>
          </div>
        ))}
      </div>

      {/* Filtro + busca */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTROS.map(f => {
          const info = tipoInfo(f.id)
          const cor = info?.cor ?? 'var(--ws-blue)'
          const ativo = filtroTipo === f.id
          return (
            <button
              key={f.id}
              onClick={() => setFiltroTipo(f.id)}
              style={{
                padding: '6px 16px', borderRadius: 20,
                fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                border: ativo ? `0.5px solid ${cor}` : '1px solid var(--ws-glass-border)',
                background: ativo ? `${info?.corBg ?? 'rgba(62,91,255,0.12)'}` : 'var(--ws-glass-bg)',
                color: ativo ? cor : 'var(--ws-text-2)',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <div style={{
        background: 'var(--ws-glass-bg)', border: '1px solid rgba(15,39,68,0.12)',
        borderRadius: 12, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 24, backdropFilter: 'blur(10px)',
        boxShadow: '0 1px 3px rgba(14,20,42,0.04)',
      }}>
        <Search size={16} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Buscar por nome ou cliente..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 14, color: 'var(--ws-text-1)', outline: 'none' }}
        />
        <span style={{ fontSize: 12, color: 'var(--ws-text-3)', flexShrink: 0 }}>
          {filtrados.length} canal{filtrados.length !== 1 ? 'is' : ''}
        </span>
      </div>

      {/* Tabela */}
      <div style={{
        background: 'var(--ws-glass-bg)', border: '0.5px solid rgba(15,39,68,0.10)',
        borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(16px)',
        boxShadow: '0 2px 8px rgba(14,20,42,0.06)',
      }}>
        {carregando ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
            <p style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 12 }}>Carregando canais...</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Link2 size={32} style={{ color: 'var(--ws-text-3)', marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: 'var(--ws-text-2)' }}>
              {busca || filtroTipo !== 'todos' ? 'Nenhum canal encontrado' : 'Nenhum canal cadastrado'}
            </p>
            {!busca && filtroTipo === 'todos' && (
              <p style={{ fontSize: 12, color: 'var(--ws-text-3)', marginTop: 4 }}>
                Clique em "Novo Canal" para começar
              </p>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(15,39,68,0.10)', background: 'rgba(62,91,255,0.04)' }}>
                {['Nome', 'Tipo', 'Cliente', 'Número', 'Conectado em', 'Status', 'Ações'].map(h => (
                  <th key={h} style={{
                    padding: '14px 18px', fontSize: 11, fontWeight: 600,
                    color: 'var(--ws-text-2)', textAlign: 'left',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(c => {
                const info = tipoInfo(c.tipo)
                const stat = STATUS_BADGE[c.status] ?? STATUS_BADGE.inativo
                const conn = CONN_BADGE[c.connection_status ?? 'disconnected'] ?? CONN_BADGE.disconnected
                return (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid rgba(15,39,68,0.08)', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = isDark() ? 'rgba(255,255,255,0.04)' : 'rgba(62,91,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--ws-text-1)', fontWeight: 500 }}>
                      {c.nome}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {info && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: 6,
                          background: info.corBg, color: info.cor,
                          fontSize: 12, fontWeight: 600,
                        }}>
                          {info.emoji} {info.label}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--ws-text-2)' }}>
                      {workspaceNome(c.workspace_id)}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {c.numero_telefone ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ws-text-1)' }}>
                          <Smartphone size={13} style={{ color: 'var(--ws-green)' }} />
                          {c.numero_telefone}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--ws-text-3)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {c.conectado_em ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ws-text-2)' }}>
                          <Calendar size={12} style={{ color: 'var(--ws-text-3)' }} />
                          {new Date(c.conectado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--ws-text-3)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 6,
                        background: conn.bg, color: conn.color,
                        fontSize: 12, fontWeight: 600,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: conn.color, flexShrink: 0 }} />
                        {conn.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          onClick={() => excluirCanal(c)}
                          disabled={excluindoId === c.id}
                          style={{
                            background: 'transparent',
                            border: '1px solid rgba(163,45,45,0.35)',
                            borderRadius: 6, padding: '4px 12px',
                            fontSize: 12, color: '#a32d2d', cursor: excluindoId === c.id ? 'not-allowed' : 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            opacity: excluindoId === c.id ? 0.6 : 1,
                          }}
                        >
                          {excluindoId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          Excluir
                        </button>
                        <button
                          onClick={() => abrirEdicao(c)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--ws-glass-border)',
                            borderRadius: 6, padding: '4px 12px',
                            fontSize: 12, color: 'var(--ws-text-2)', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                          }}
                        >
                          <Pencil size={12} />
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer Novo Canal */}
      <Sheet open={drawerAberto} onOpenChange={open => !open && fecharDrawer()}>
        <SheetContent
          side="right"
          style={{
            width: 500,
            ...wsSheetCreamStyle,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '24px 28px 20px',
            borderBottom: '1px solid var(--ws-glass-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)' }}>
                {canalCriado ? 'Canal criado!' : 'Novo Canal'}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
                {canalCriado ? 'Guarde a URL do webhook abaixo' : 'Configure um novo canal de entrada'}
              </p>
            </div>
            <button
              onClick={fecharDrawer}
              style={{
                ...wsSheetCreamCloseButtonStyle,
                borderRadius: 8, width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--ws-text-2)',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

            {/* Webhook criado — exibe URL */}
            {canalCriado ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{
                  background: 'rgba(37,211,102,0.08)',
                  border: '1px solid rgba(37,211,102,0.25)',
                  borderRadius: 12, padding: '16px 18px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ fontSize: 28 }}>✅</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-green)' }}>
                      Canal "{canalCriado.nome}" criado
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ws-text-2)', marginTop: 2 }}>
                      Tipo: Webhook/API
                    </div>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>URL do Webhook</label>
                  <div style={{
                    background: wsSheetCreamTokens.surface,
                    border: `1px solid ${wsSheetCreamTokens.border}`,
                    borderRadius: 10, padding: '12px 14px',
                  }}>
                    <code style={{ fontSize: 11, color: 'var(--ws-text-1)', wordBreak: 'break-all', lineHeight: 1.6, display: 'block' }}>
                      {WEBHOOK_BASE}/{canalCriado.webhook_token}
                    </code>
                  </div>
                  <button
                    onClick={copiarWebhook}
                    style={{
                      marginTop: 10, width: '100%', height: 40,
                      borderRadius: 10,
                      background: copiado ? 'rgba(15,168,86,0.15)' : 'rgba(62,91,255,0.12)',
                      border: copiado ? '1px solid var(--ws-green)' : '1px solid rgba(62,91,255,0.3)',
                      fontSize: 13, fontWeight: 600,
                      color: copiado ? 'var(--ws-green)' : 'var(--ws-blue)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      transition: 'all 0.2s',
                    }}
                  >
                    {copiado ? <Check size={15} /> : <Copy size={15} />}
                    {copiado ? 'Copiado!' : 'Copiar URL'}
                  </button>
                </div>

                <p style={{ fontSize: 12, color: 'var(--ws-text-3)', margin: 0 }}>
                  Configure esta URL como destino de webhook no sistema externo. O token é único e não poderá ser recuperado.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Cliente */}
                <div>
                  <label style={labelStyle}>Cliente *</label>
                  <select
                    value={form.workspace_id}
                    onChange={e => setForm(prev => ({ ...prev, workspace_id: e.target.value }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">Selecione um cliente...</option>
                    {workspaces.map(w => (
                      <option key={w.id} value={w.id}>{w.nome}</option>
                    ))}
                  </select>
                </div>

                {/* Tipo — seletor visual */}
                <div>
                  <label style={labelStyle}>Tipo *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {TIPOS.map(t => {
                      const sel = form.tipo === t.id
                      return (
                        <button
                          key={t.id}
                          onClick={() => setForm(prev => ({ ...prev, tipo: t.id, config: {} }))}
                          style={{
                            padding: '12px 10px',
                            borderRadius: 10,
                            border: sel ? `1px solid ${t.cor}` : '1px solid var(--ws-glass-border)',
                            background: sel ? t.corBg : 'transparent',
                            cursor: 'pointer', transition: 'all 0.15s',
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                          }}
                        >
                          <span style={{ fontSize: 18 }}>{t.emoji}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: sel ? t.cor : 'var(--ws-text-2)', lineHeight: 1.3 }}>
                            {t.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Nome */}
                <div>
                  <label style={labelStyle}>Nome do Canal *</label>
                  <input
                    type="text"
                    placeholder="Nome identificador do canal"
                    value={form.nome}
                    onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                {/* Mensagem de boas-vindas */}
                <div>
                  <label style={labelStyle}>Mensagem de Boas-Vindas</label>
                  <textarea
                    placeholder="Mensagem enviada automaticamente ao novo contato..."
                    value={form.mensagem_boas_vindas}
                    onChange={e => setForm(prev => ({ ...prev, mensagem_boas_vindas: e.target.value }))}
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                {/* Config por tipo */}
                {form.tipo === 'whatsapp_evolution' && (
                  <div>
                    <label style={labelStyle}>Nome da Instância Evolution</label>
                    <input
                      type="text"
                      placeholder="ex: minha-instancia"
                      value={form.config.instancia ?? ''}
                      onChange={e => setConfig('instancia', e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                )}

                {form.tipo === 'whatsapp_oficial' && (
                  <>
                    <div>
                      <label style={labelStyle}>Número</label>
                      <input
                        type="text"
                        placeholder="ex: 5511999999999"
                        value={form.config.numero ?? ''}
                        onChange={e => setConfig('numero', e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Token Meta</label>
                      <input
                        type="text"
                        placeholder="Token de acesso Meta"
                        value={form.config.token_meta ?? ''}
                        onChange={e => setConfig('token_meta', e.target.value)}
                        style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }}
                      />
                    </div>
                  </>
                )}

                {(form.tipo === 'instagram' || form.tipo === 'facebook') && (
                  <>
                    <div>
                      <label style={labelStyle}>Page ID</label>
                      <input
                        type="text"
                        placeholder="ID da página"
                        value={form.config.page_id ?? ''}
                        onChange={e => setConfig('page_id', e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Token</label>
                      <input
                        type="text"
                        placeholder="Token de acesso"
                        value={form.config.token ?? ''}
                        onChange={e => setConfig('token', e.target.value)}
                        style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }}
                      />
                    </div>
                  </>
                )}

                {form.tipo === 'webhook' && (
                  <div style={{
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.25)',
                    borderRadius: 10, padding: '14px 16px',
                  }}>
                    <p style={{ margin: 0, fontSize: 12, color: '#F59E0B', lineHeight: 1.5 }}>
                      🔗 Um token único será gerado automaticamente ao salvar. Você receberá a URL completa para configurar no sistema externo.
                    </p>
                  </div>
                )}

              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '20px 28px',
            borderTop: '1px solid var(--ws-glass-border)',
            display: 'flex', gap: 12,
          }}>
            <button
              onClick={fecharDrawer}
              style={{
                flex: 1, height: 42, borderRadius: 10,
                background: 'transparent',
                border: '1px solid var(--ws-glass-border)',
                fontSize: 14, fontWeight: 500,
                color: 'var(--ws-text-2)', cursor: 'pointer',
              }}
            >
              {canalCriado ? 'Fechar' : 'Cancelar'}
            </button>
            {!canalCriado && (
              <button
                onClick={salvar}
                disabled={salvando}
                style={{
                  flex: 2, height: 42, borderRadius: 10,
                  background: salvando ? 'rgba(62,91,255,0.5)' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
                  border: 'none',
                  fontSize: 14, fontWeight: 600,
                  color: 'white', cursor: salvando ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: salvando ? 'none' : '0 4px 12px rgba(62,91,255,0.30)',
                }}
              >
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {salvando ? 'Salvando...' : 'Salvar Canal'}
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Drawer Editar Canal */}
      <Sheet open={editDrawerAberto} onOpenChange={open => !open && fecharEdicao()}>
        <SheetContent
          side="right"
          style={{
            width: 500,
            ...wsSheetCreamStyle,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '24px 28px 20px',
            borderBottom: '1px solid var(--ws-glass-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)' }}>
                Editar Canal
              </h2>
              <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
                {canalEditando?.nome}
              </p>
            </div>
            <button
              onClick={fecharEdicao}
              style={{
                ...wsSheetCreamCloseButtonStyle,
                borderRadius: 8, width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--ws-text-2)',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Nome */}
              <div>
                <label style={labelStyle}>Nome do Canal *</label>
                <input
                  type="text"
                  value={editForm.nome}
                  onChange={e => setEditForm(prev => ({ ...prev, nome: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              {/* Mensagem de boas-vindas */}
              <div>
                <label style={labelStyle}>Mensagem de Boas-Vindas</label>
                <textarea
                  value={editForm.mensagem_boas_vindas}
                  onChange={e => setEditForm(prev => ({ ...prev, mensagem_boas_vindas: e.target.value }))}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Status de conexão (Evolution apenas) */}
              {canalEditando?.tipo === 'whatsapp_evolution' && (
                <div style={{
                  background: 'rgba(37,211,102,0.06)',
                  border: '1px solid rgba(37,211,102,0.20)',
                  borderRadius: 12, padding: '16px 18px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>📱</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                          WhatsApp Evolution
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ws-text-3)', marginTop: 2 }}>
                          {canalEditando.numero_telefone ?? 'Nenhum número conectado'}
                        </div>
                      </div>
                    </div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 10px', borderRadius: 6,
                      background: CONN_BADGE[canalEditando.connection_status ?? 'disconnected']?.bg,
                      color: CONN_BADGE[canalEditando.connection_status ?? 'disconnected']?.color,
                      fontSize: 11, fontWeight: 600,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: CONN_BADGE[canalEditando.connection_status ?? 'disconnected']?.color }} />
                      {CONN_BADGE[canalEditando.connection_status ?? 'disconnected']?.label ?? 'Desconectado'}
                    </span>
                  </div>

                  {/* QR Code */}
                  {qrCode && (
                    <div style={{ textAlign: 'center', marginBottom: 12 }}>
                      <img
                        src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                        alt="QR Code WhatsApp"
                        style={{ width: 200, height: 200, borderRadius: 8, border: '1px solid var(--ws-glass-border)' }}
                      />
                      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 6 }}>
                        Escaneie com seu WhatsApp
                      </p>
                    </div>
                  )}

                  {!qrCode && pairingCode && (
                    <div style={{
                      textAlign: 'center',
                      marginBottom: 12,
                      padding: '14px 16px',
                      borderRadius: 10,
                      border: '1px solid rgba(37,211,102,0.22)',
                      background: 'rgba(37,211,102,0.06)',
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginBottom: 8 }}>
                        Código de pareamento
                      </div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          letterSpacing: '0.16em',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          color: 'var(--ws-text-1)',
                          wordBreak: 'break-word',
                        }}
                      >
                        {pairingCode}
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 8 }}>
                        Digite esse código no WhatsApp para concluir a conexão
                      </p>
                    </div>
                  )}

                  {/* Botões Conectar / Desconectar */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {canalEditando.connection_status === 'connected' ? (
                      <button
                        onClick={desconectarEvolution}
                        style={{
                          flex: 1, height: 38, borderRadius: 8,
                          background: 'rgba(163,45,45,0.12)',
                          border: '1px solid rgba(163,45,45,0.30)',
                          fontSize: 13, fontWeight: 600,
                          color: '#a32d2d', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        <PowerOff size={14} />
                        Desconectar
                      </button>
                    ) : (
                      <button
                        onClick={conectarEvolution}
                        disabled={conectando}
                        style={{
                          flex: 1, height: 38, borderRadius: 8,
                          background: conectando ? 'rgba(37,211,102,0.30)' : 'rgba(37,211,102,0.15)',
                          border: '1px solid rgba(37,211,102,0.40)',
                          fontSize: 13, fontWeight: 600,
                          color: '#25D366', cursor: conectando ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        {conectando ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                        {conectando ? 'Conectando...' : 'Conectar'}
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '20px 28px',
            borderTop: '1px solid var(--ws-glass-border)',
            display: 'flex', gap: 12,
          }}>
            <button
              onClick={fecharEdicao}
              style={{
                flex: 1, height: 42, borderRadius: 10,
                background: 'transparent',
                border: '1px solid var(--ws-glass-border)',
                fontSize: 14, fontWeight: 500,
                color: 'var(--ws-text-2)', cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={salvarEdicao}
              disabled={editSalvando}
              style={{
                flex: 2, height: 42, borderRadius: 10,
                background: editSalvando ? 'rgba(62,91,255,0.5)' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
                border: 'none',
                fontSize: 14, fontWeight: 600,
                color: 'white', cursor: editSalvando ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: editSalvando ? 'none' : '0 4px 12px rgba(62,91,255,0.30)',
              }}
            >
              {editSalvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {editSalvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
