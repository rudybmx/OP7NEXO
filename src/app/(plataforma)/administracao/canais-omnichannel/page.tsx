'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Search, Link2, Smartphone, Calendar, Pencil, Trash2, PowerOff } from 'lucide-react'
import { AlertDialog } from 'radix-ui'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import api from '@/lib/api-client'
import { getCanalProviderLabel } from '@/lib/whatsapp-canal'
import { formatarTelefoneBR } from '@/lib/formatar'
import { EditarCanalDialog, type EditCanalForm } from '@/components/administracao/canais/editar-canal-dialog'
import { NovoCanalDialog } from '@/components/administracao/canais/novo-canal-dialog'
import { sanitizeCanalConfigForEdit } from '@/components/administracao/canais/webhook-config'
import {
  TIPOS, WEBHOOK_BASE, emptyForm, tipoInfo,
  type Canal, type TipoCanal, type Workspace,
} from '@/components/administracao/canais/canal-shared'

const FILTROS: { id: TipoCanal; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  ...TIPOS.map(t => ({ id: t.id, label: t.label })),
]

const CONN_BADGE: Record<string, { label: string; bg: string; color: string; hint?: string }> = {
  connected:    { label: 'Conectado',    bg: 'rgba(15,168,86,0.15)',  color: 'var(--ws-green)' },
  connecting:   { label: 'Conectando',   bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  disconnected: { label: 'Desconectado', bg: 'rgba(163,45,45,0.15)',  color: '#a32d2d' },
  failed:       { label: 'Falha / Conflito', bg: 'rgba(163,45,45,0.18)', color: '#a32d2d',
    hint: 'A sessão caiu após estar conectada. Causa provável: o número está vinculado em outra ferramenta de WhatsApp (conflito) ou foi desconectado no celular. Reconecte pelo QR; se cair de novo, verifique vínculos externos do número.' },
}

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  ativo:   { label: 'Ativo',   bg: 'rgba(15,168,86,0.15)', color: 'var(--ws-green)' },
  inativo: { label: 'Inativo', bg: 'rgba(163,45,45,0.15)', color: '#a32d2d' },
  erro:    { label: 'Erro',    bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
}

function isDark() {
  if (typeof window === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

function emptyEditForm(): EditCanalForm {
  return {
    nome: '',
    mensagem_boas_vindas: '',
    status: 'inativo',
    config: {},
  }
}

function getChannelBadge(canal: Canal) {
  if (canal.tipo === 'webhook') {
    return STATUS_BADGE[(canal.status || 'inativo').toLowerCase()] ?? STATUS_BADGE.inativo
  }

  return CONN_BADGE[(canal.connection_status || 'disconnected').toLowerCase()] ?? CONN_BADGE.disconnected
}

function defaultNewChannelStatus(tipo: TipoCanal): string {
  return tipo === 'webhook' ? 'ativo' : 'inativo'
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err.trim()) return err
  return fallback
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
  const [editForm, setEditForm] = useState<EditCanalForm>(emptyEditForm())
  const [editSalvando, setEditSalvando] = useState(false)

  // QR Code / Conexão
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [conectando, setConectando] = useState(false)
  const [pollingId, setPollingId] = useState<ReturnType<typeof setInterval> | null>(null)

  // Exclusão / Inativação
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [inativandoId, setInativandoId] = useState<string | null>(null)
  const [gerandoLinkId, setGerandoLinkId] = useState<string | null>(null)
  const [confirmExcluir, setConfirmExcluir] = useState<Canal | null>(null)
  const [confirmInativar, setConfirmInativar] = useState<Canal | null>(null)

  useEffect(() => {
    if (!authLoading && user && user.role !== 'platform_admin') router.push('/')
  }, [authLoading, user, router])

  const loadCanais = useCallback(async () => {
    setCarregando(true)
    try {
      const data = await api.get<Canal[]>('/canais?validate_waha=1')
      setCanais(data)
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Erro ao carregar canais'))
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
    if (user?.role !== 'platform_admin') return
    void Promise.resolve().then(() => {
      loadCanais()
      loadWorkspaces()
    })
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
        status: defaultNewChannelStatus(form.tipo),
      })
      setCanais(prev => [criado, ...prev])
      if (form.tipo === 'whatsapp_waha') {
        fecharDrawer()
        abrirEdicao(criado)
        setTimeout(() => conectarEvolution(), 50)
      } else if ((form.tipo === 'webhook' || form.tipo === 'whatsapp_oficial' || form.tipo === 'instagram') && criado.webhook_token) {
        setCanalCriado(criado)
      } else {
        fecharDrawer()
        toast.success('Canal criado com sucesso!')
      }
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Erro ao criar canal'))
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
    const path = canalCriado.tipo === 'whatsapp_oficial' ? 'meta/' : canalCriado.tipo === 'instagram' ? 'instagram/' : ''
    navigator.clipboard.writeText(`${WEBHOOK_BASE}/${path}${canalCriado.webhook_token}`)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  // ── Edição ─────────────────────────────────────────────────────────

  function abrirEdicao(canal: Canal) {
    setCanalEditando(canal)
    setEditForm({
      nome: canal.nome,
      mensagem_boas_vindas: canal.mensagem_boas_vindas ?? '',
      status: canal.status,
      config: sanitizeCanalConfigForEdit(canal.config),
    })
    setQrCode(null)
    setPairingCode(null)
    setConectando(false)
    setEditDrawerAberto(true)
  }

  function fecharEdicao() {
    setEditDrawerAberto(false)
    setCanalEditando(null)
    setEditForm(emptyEditForm())
    setQrCode(null)
    setPairingCode(null)
    setConectando(false)
    if (pollingId) {
      clearInterval(pollingId)
      setPollingId(null)
    }
  }

  async function excluirCanalConfirmado(canal: Canal) {
    setConfirmExcluir(null)
    setExcluindoId(canal.id)
    try {
      await api.delete(`/canais/${canal.id}`)
      setCanais(prev => prev.filter(c => c.id !== canal.id))
      toast.success('Canal excluído com sucesso')
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Erro ao excluir canal'))
    } finally {
      setExcluindoId(null)
    }
  }

  async function inativarCanalConfirmado(canal: Canal) {
    setConfirmInativar(null)
    setInativandoId(canal.id)
    try {
      await api.post(`/canais/${canal.id}/desconectar`)
      setCanais(prev => prev.map(c =>
        c.id === canal.id ? { ...c, connection_status: 'disconnected', status: 'inativo', numero_telefone: null } : c
      ))
      toast.success('Canal inativado com sucesso')
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Erro ao inativar canal'))
    } finally {
      setInativandoId(null)
    }
  }

  async function gerarLinkConexao(canal: Canal) {
    setGerandoLinkId(canal.id)
    try {
      const resp = await api.post<{ token: string; link: string; expira_em: string }>(
        `/canais/${canal.id}/link-conexao`,
      )
      await navigator.clipboard.writeText(resp.link).catch(() => {})
      toast.success('Link de conexão copiado!', { description: resp.link })
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Erro ao gerar link de conexão'))
    } finally {
      setGerandoLinkId(null)
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
        status: editForm.status,
      })
      setCanais(prev => prev.map(c => c.id === atualizado.id ? atualizado : c))
      setCanalEditando(atualizado)
      toast.success('Canal atualizado')
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Erro ao atualizar canal'))
    } finally {
      setEditSalvando(false)
    }
  }

  async function conectarEvolution() {
    if (!canalEditando || !['whatsapp_evolution', 'whatsapp_waha', 'whatsapp_oficial', 'instagram'].includes(canalEditando.tipo)) return
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
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Erro ao conectar'))
      setConectando(false)
    }
  }

  async function desconectarEvolution() {
    if (!canalEditando || !['whatsapp_evolution', 'whatsapp_waha', 'whatsapp_oficial', 'instagram'].includes(canalEditando.tipo)) return
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
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Erro ao desconectar'))
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
                Clique em &quot;Novo Canal&quot; para começar
              </p>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
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
                const badge = getChannelBadge(c)
                const tel = formatarTelefoneBR(c.numero_telefone) ?? c.numero_telefone
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
                          {info.emoji} {getCanalProviderLabel({ provider_label: c.provider_label, tipo: c.tipo })}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--ws-text-2)' }}>
                      {workspaceNome(c.workspace_id)}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {tel ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ws-text-1)' }}>
                          <Smartphone size={13} style={{ color: 'var(--ws-green)' }} />
                          {tel}
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
                      <span
                        title={('hint' in badge ? (badge as { hint?: string }).hint : undefined) || undefined}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: 6,
                          background: badge.bg, color: badge.color,
                          fontSize: 12, fontWeight: 600,
                          cursor: ('hint' in badge && (badge as { hint?: string }).hint) ? 'help' : 'default',
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.color, flexShrink: 0 }} />
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {['connected', 'connecting'].includes(c.connection_status ?? '') ? (
                          <button
                            onClick={() => setConfirmInativar(c)}
                            disabled={inativandoId === c.id}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(163,45,45,0.35)',
                              borderRadius: 6, padding: '4px 12px',
                              fontSize: 12, color: '#a32d2d', cursor: inativandoId === c.id ? 'not-allowed' : 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              opacity: inativandoId === c.id ? 0.6 : 1,
                            }}
                          >
                            {inativandoId === c.id ? <Loader2 size={12} className="animate-spin" /> : <PowerOff size={12} />}
                            Inativar
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmExcluir(c)}
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
                        )}
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
                        {['whatsapp_evolution', 'whatsapp_waha'].includes(c.tipo) && (
                          <button
                            onClick={() => gerarLinkConexao(c)}
                            disabled={gerandoLinkId === c.id}
                            title="Gerar link para o cliente conectar"
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--ws-glass-border)',
                              borderRadius: 6, padding: '4px 12px',
                              fontSize: 12, color: 'var(--ws-text-2)',
                              cursor: gerandoLinkId === c.id ? 'not-allowed' : 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              opacity: gerandoLinkId === c.id ? 0.6 : 1,
                            }}
                          >
                            {gerandoLinkId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                            Link
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Modal central Novo Canal */}
      <NovoCanalDialog
        open={drawerAberto}
        onClose={fecharDrawer}
        workspaces={workspaces}
        form={form}
        setForm={setForm}
        setConfig={setConfig}
        salvar={salvar}
        salvando={salvando}
        canalCriado={canalCriado}
        copiarWebhook={copiarWebhook}
        copiado={copiado}
      />

      <EditarCanalDialog
        open={editDrawerAberto}
        onClose={fecharEdicao}
        canal={canalEditando}
        form={editForm}
        setForm={setEditForm}
        salvar={salvarEdicao}
        salvando={editSalvando}
        qrCode={qrCode}
        pairingCode={pairingCode}
        conectando={conectando}
        onConectar={conectarEvolution}
        onDesconectar={desconectarEvolution}
      />

      {/* Dialog: Confirmar Inativar */}
      <AlertDialog.Root open={!!confirmInativar} onOpenChange={open => { if (!open) setConfirmInativar(null) }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} />
          <AlertDialog.Content style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--card)', border: '1px solid var(--ws-glass-border)',
            borderRadius: 12, padding: 24, zIndex: 1001, maxWidth: 440, width: '90vw',
          }}>
            <AlertDialog.Title style={{ margin: 0, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Inativar canal
            </AlertDialog.Title>
            <AlertDialog.Description style={{ margin: 0, fontSize: 14, color: 'var(--ws-text-2)', marginBottom: 20 }}>
              Tem certeza que deseja inativar <strong>{confirmInativar?.nome}</strong>?
              A instância será desconectada no WAHA/Evolution. Você poderá excluir o canal em seguida.
            </AlertDialog.Description>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <AlertDialog.Cancel asChild>
                <button style={{
                  background: 'transparent', border: '1px solid var(--ws-glass-border)',
                  borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer',
                }}>Cancelar</button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  onClick={() => confirmInativar && inativarCanalConfirmado(confirmInativar)}
                  style={{
                    background: '#a32d2d', border: 'none', color: '#fff',
                    borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer',
                  }}
                >Inativar</button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* Dialog: Confirmar Excluir */}
      <AlertDialog.Root open={!!confirmExcluir} onOpenChange={open => { if (!open) setConfirmExcluir(null) }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }} />
          <AlertDialog.Content style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--card)', border: '1px solid var(--ws-glass-border)',
            borderRadius: 12, padding: 24, zIndex: 1001, maxWidth: 440, width: '90vw',
          }}>
            <AlertDialog.Title style={{ margin: 0, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Excluir canal permanentemente
            </AlertDialog.Title>
            <AlertDialog.Description style={{ margin: 0, fontSize: 14, color: 'var(--ws-text-2)', marginBottom: 20 }}>
              Tem certeza que deseja excluir <strong>{confirmExcluir?.nome}</strong>?
              Isso removerá o canal do banco de dados e a instância nas ferramentas. Esta ação não pode ser desfeita.
            </AlertDialog.Description>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <AlertDialog.Cancel asChild>
                <button style={{
                  background: 'transparent', border: '1px solid var(--ws-glass-border)',
                  borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer',
                }}>Cancelar</button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  onClick={() => confirmExcluir && excluirCanalConfirmado(confirmExcluir)}
                  style={{
                    background: '#a32d2d', border: 'none', color: '#fff',
                    borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer',
                  }}
                >Excluir</button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  )
}
