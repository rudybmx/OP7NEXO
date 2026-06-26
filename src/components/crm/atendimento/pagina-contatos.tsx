'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Search, Plus, Filter, ArrowUpDown, ChevronDown,
  X, Phone, Mail, Tag, User, Calendar, Check,
  MessageCircle, Globe,
  MessageSquare as Facebook,
  MessageCircle as Instagram,
  ChevronLeft, ChevronRight as ChevronRightIcon,
} from 'lucide-react'
import { useContatos, type ContatoApi } from '@/hooks/use-contatos'
import { formatarTelefoneBR } from '@/lib/formatar'
import { resolveAvatarSrc } from '@/lib/avatar-src'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Canal = 'whatsapp' | 'messenger' | 'instagram_dm' | 'lead_form_facebook' | 'lead_form_instagram' | 'organico'
type Stage = 'novo' | 'contato' | 'qualificado' | 'proposta' | 'fechado' | 'perdido'

interface Contato {
  id: string
  nome: string
  telefone: string
  email?: string
  avatarInitials: string
  avatarCor: string
  avatarUrl?: string | null
  canais: Canal[]
  campanhaOrigem?: string
  adNome?: string
  stage: Stage
  atribuidoA?: string
  tags: string[]
  primeiroContato: string
  ultimoContato: string
  notas?: string
  criadoEm: string
  nomeConfirmado?: boolean  // nome confirmado (cliente/humano) vs fallback push_name (WhatsApp); ausente nos mocks
  resumoIa?: string
  temperatura?: string      // quente | morno | frio (sentimento_ia)
  scoreLeadIa?: number
  interesse?: string        // de perfil_json.contexto_ia.interesse (análise da conversa)
  instagram?: string
  facebook?: string
}

// ─── Configs visuais ──────────────────────────────────────────────────────────

const CANAL_CONFIG: Record<Canal, { label: string; bg: string; cor: string; border: string; Icone: React.ElementType }> = {
  whatsapp:             { label: 'WA',  bg: 'rgba(37,211,102,0.12)',  cor: '#128C7E', border: 'rgba(37,211,102,0.30)', Icone: MessageCircle },
  messenger:            { label: 'FB',  bg: 'rgba(0,132,255,0.10)',   cor: '#0084FF', border: 'rgba(0,132,255,0.25)',  Icone: Facebook },
  instagram_dm:         { label: 'IG',  bg: 'rgba(225,48,108,0.10)',  cor: '#E1306C', border: 'rgba(225,48,108,0.25)', Icone: Instagram },
  lead_form_facebook:   { label: 'FB',  bg: 'rgba(0,132,255,0.10)',   cor: '#0084FF', border: 'rgba(0,132,255,0.25)',  Icone: Facebook },
  lead_form_instagram:  { label: 'IG',  bg: 'rgba(225,48,108,0.10)',  cor: '#E1306C', border: 'rgba(225,48,108,0.25)', Icone: Instagram },
  organico:             { label: 'ORG', bg: 'rgba(136,146,176,0.10)', cor: '#8892b0', border: 'rgba(136,146,176,0.20)', Icone: Globe },
}

const STAGE_CONFIG: Record<Stage, { label: string; bg: string; cor: string; border: string }> = {
  novo:        { label: 'Novo',        bg: 'rgba(136,146,176,0.10)', cor: '#8892b0', border: 'rgba(136,146,176,0.20)' },
  contato:     { label: 'Contato',     bg: 'rgba(62,91,255,0.10)',   cor: '#3E5BFF', border: 'rgba(62,91,255,0.25)' },
  qualificado: { label: 'Qualificado', bg: 'rgba(15,168,86,0.10)',   cor: '#0fa856', border: 'rgba(15,168,86,0.25)' },
  proposta:    { label: 'Proposta',    bg: 'rgba(239,159,39,0.10)',  cor: '#EF9F27', border: 'rgba(239,159,39,0.25)' },
  fechado:     { label: 'Fechado',     bg: 'rgba(15,168,86,0.12)',   cor: '#0a7a3e', border: 'rgba(15,168,86,0.30)' },
  perdido:     { label: 'Perdido',     bg: 'rgba(255,92,141,0.10)',  cor: '#FF5C8D', border: 'rgba(255,92,141,0.25)' },
}

const AGENTES = ['Ana Lima', 'Carlos Melo', 'Beatriz Costa', 'Fernanda N.', 'Rudy B.']

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CONTATOS: Contato[] = [
  {
    id: 'c1', nome: 'Maria Clara', telefone: '+55 41 99999-0001', email: 'maria@email.com',
    avatarInitials: 'MC', avatarCor: '#3E5BFF',
    canais: ['whatsapp'], campanhaOrigem: 'Oral Sin', adNome: '[IMPLANTE][CONCORRENTE][AMPLA]',
    stage: 'qualificado', atribuidoA: 'Fernanda N.',
    tags: ['Implante', 'VIP'], primeiroContato: '12 abr', ultimoContato: '18 abr',
    notas: 'Interesse em implante de titânio. Retornar semana que vem.',
    criadoEm: '2026-04-12',
  },
  {
    id: 'c2', nome: 'Rafael Silva', telefone: '+55 11 98888-0002',
    avatarInitials: 'RS', avatarCor: '#7A5AF8',
    canais: ['instagram_dm'], campanhaOrigem: 'ODC', adNome: '[LIMPEZA][GENERICO][FRASE]',
    stage: 'contato', atribuidoA: 'Carlos Melo',
    tags: ['Limpeza'], primeiroContato: '12 abr', ultimoContato: '15 abr',
    criadoEm: '2026-04-12',
  },
  {
    id: 'c3', nome: 'João Paulo', telefone: '+55 41 97777-0003',
    avatarInitials: 'JP', avatarCor: '#0fa856',
    canais: ['whatsapp', 'messenger'], campanhaOrigem: 'HS Promoção',
    stage: 'proposta', atribuidoA: 'Fernanda N.',
    tags: ['Ortodontia', 'Urgente'], primeiroContato: '10 abr', ultimoContato: '19 abr',
    criadoEm: '2026-04-10',
  },
  {
    id: 'c4', nome: 'Ana Lima', telefone: '+55 21 96666-0004', email: 'ana@gmail.com',
    avatarInitials: 'AL', avatarCor: '#EF9F27',
    canais: ['messenger'],
    stage: 'fechado', atribuidoA: 'Carlos Melo',
    tags: ['Clareamento'], primeiroContato: '08 abr', ultimoContato: '16 abr',
    criadoEm: '2026-04-08',
  },
  {
    id: 'c5', nome: 'Beatriz F.', telefone: '+55 41 94444-0006',
    avatarInitials: 'BF', avatarCor: '#FF5C8D',
    canais: ['instagram_dm', 'whatsapp'],
    stage: 'novo', atribuidoA: undefined,
    tags: [], primeiroContato: '12 abr', ultimoContato: '12 abr',
    criadoEm: '2026-04-12',
  },
  {
    id: 'c6', nome: 'Lucas Mendes', telefone: '+55 11 93333-0007',
    avatarInitials: 'LM', avatarCor: '#3E5BFF',
    canais: ['whatsapp'], campanhaOrigem: 'Implante Premium',
    stage: 'qualificado', atribuidoA: 'Ana Lima',
    tags: ['Implante'], primeiroContato: '11 abr', ultimoContato: '18 abr',
    criadoEm: '2026-04-11',
  },
  {
    id: 'c7', nome: 'Carla Souza', telefone: '+55 41 92222-0008', email: 'carla@email.com',
    avatarInitials: 'CS', avatarCor: '#7A5AF8',
    canais: ['lead_form_facebook'], campanhaOrigem: 'Limpeza Geral',
    stage: 'contato', atribuidoA: 'Beatriz Costa',
    tags: ['Limpeza', 'Primeira Consulta'], primeiroContato: '09 abr', ultimoContato: '14 abr',
    criadoEm: '2026-04-09',
  },
  {
    id: 'c8', nome: 'Pedro Alves', telefone: '+55 41 91111-0009',
    avatarInitials: 'PA', avatarCor: '#FF5C8D',
    canais: ['organico'],
    stage: 'perdido', atribuidoA: 'Carlos Melo',
    tags: [], primeiroContato: '05 abr', ultimoContato: '10 abr',
    criadoEm: '2026-04-05',
  },
]

const CORES_AVATAR_DETERMINISTICAS = ['#3E5BFF', '#7A5AF8', '#0fa856', '#FF5C8D', '#EF9F27', '#FF3B3B']

function corDoAvatar(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  const idx = Math.abs(hash) % CORES_AVATAR_DETERMINISTICAS.length
  return CORES_AVATAR_DETERMINISTICAS[idx]
}

function getIniciais(nome: string): string {
  const partes = nome.trim().split(' ').filter(Boolean)
  if (partes.length >= 2) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
  return (partes[0]?.[0] ?? '?').toUpperCase()
}

function formatarDataCurta(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function origemParaCanais(origem?: string | null, jid?: string): Canal[] {
  if (jid?.includes('@g.us')) return ['whatsapp']
  switch (origem) {
    case 'evolution': return ['whatsapp']
    case 'grupo':     return ['whatsapp']
    case 'webhook':   return ['lead_form_facebook']
    case 'manual':    return ['organico']
    default: {
      if (!origem) return ['organico']
      const o = origem.toLowerCase()
      if (o.includes('whatsapp')) return ['whatsapp']
      if (o.includes('instagram')) return ['instagram_dm']
      if (o.includes('facebook') || o.includes('meta')) return ['lead_form_facebook']
      return ['organico']
    }
  }
}

function etapaParaStage(etapa?: string | null): Stage {
  const map: Record<string, Stage> = {
    'novo':        'novo',
    'contato':     'contato',
    'qualificado': 'qualificado',
    'proposta':    'proposta',
    'fechado':     'fechado',
    'perdido':     'perdido',
    // legado (valores antigos de Conversa.etapa_funil)
    'nova':           'novo',
    'em_atendimento': 'contato',
    'aguardando':     'qualificado',
    'resgate':        'proposta',
    'resolvido':      'fechado',
    'arquivada':      'perdido',
  }
  return map[etapa || ''] ?? 'novo'
}

function extractTelefone(c: ContatoApi): string {
  const jid = c.jid
  if (jid.includes('@g.us')) return ''
  if (c.telefone) {
    if (jid.includes('@lid')) {
      const digits = c.telefone.replace(/\D/g, '')
      const national = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
      if (national.length > 11) return ''
    }
    return c.telefone
  }
  if (!jid.startsWith('webhook:') && !jid.includes('@lid')) {
    const prefix = jid.split('@')[0]
    if (/^\d{10,13}$/.test(prefix)) return prefix
  }
  return ''
}

function mapearContatoReal(c: ContatoApi): Contato {
  const ctx = (c.perfil_json as { contexto_ia?: { interesse?: string } } | null)?.contexto_ia
  const nomeConfirmado = !!(c.nome_confirmado && c.nome_confirmado.trim())
  // precedência: nome confirmado (cliente/humano) > push_name (WhatsApp) > nome legado > telefone
  const nome = c.nome_confirmado || c.push_name || c.nome || c.telefone || c.jid.split('@')[0] || 'Sem nome'
  return {
    id: c.id,
    nome,
    nomeConfirmado,
    telefone: extractTelefone(c),
    email: undefined,
    avatarInitials: getIniciais(nome),
    avatarCor: corDoAvatar(c.id),
    avatarUrl: c.avatar_url,
    canais: origemParaCanais(c.origem, c.jid),
    campanhaOrigem: c.campanha_origem || undefined,
    adNome: c.meta_ad_id || undefined,
    stage: etapaParaStage(c.etapa_funil),
    atribuidoA: c.responsavel_nome || undefined,
    tags: c.tags || [],
    primeiroContato: formatarDataCurta(c.primeira_conversa_at || c.criado_em),
    ultimoContato: formatarDataCurta(c.last_message_at || c.atualizado_em),
    notas: c.notas || undefined,
    criadoEm: c.criado_em.slice(0, 10),
    resumoIa: c.resumo_ia || undefined,
    temperatura: c.sentimento_ia || undefined,
    scoreLeadIa: c.score_lead_ia ?? undefined,
    interesse: ctx?.interesse || undefined,
    instagram: c.instagram || undefined,
    facebook: c.facebook || undefined,
  }
}

const STATS = [
  { label: 'Total de contatos', valor: '—', sub: 'carregando...', cor: 'var(--ws-text-1)' },
  { label: 'Leads ativos', valor: '—', sub: 'carregando...', cor: '#3E5BFF' },
  { label: 'Sem atribuição', valor: '—', sub: 'carregando...', cor: '#EF9F27' },
  { label: 'Fechados este mês', valor: '—', sub: 'carregando...', cor: '#0fa856' },
]

const POR_PAGINA = 8

// ─── Componentes internos ─────────────────────────────────────────────────────

function CanalBadge({ canal }: { canal: Canal }) {
  const c = CANAL_CONFIG[canal]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 700, padding: '2px 6px',
      borderRadius: 9999, background: c.bg,
      border: `1px solid ${c.border}`, color: c.cor,
    }}>
      {canal === 'whatsapp' ? 'WA' : canal === 'instagram_dm' || canal === 'lead_form_instagram' ? 'IG' : canal === 'organico' ? 'ORG' : 'FB'}
    </span>
  )
}

function StageBadge({ stage }: { stage: Stage }) {
  const c = STAGE_CONFIG[stage]
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px',
      borderRadius: 9999, background: c.bg,
      border: `1px solid ${c.border}`, color: c.cor,
      whiteSpace: 'nowrap',
    }}>{c.label}</span>
  )
}

function Avatar({ initials, cor, src, size = 32 }: { initials: string; cor: string; src?: string | null; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: src ? 'transparent' : cor, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.34, fontWeight: 700, color: 'white',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {initials}
      </span>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={initials}
          onError={event => { event.currentTarget.style.display = 'none' }}
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', position: 'relative', zIndex: 1 }}
        />
      ) : null}
    </div>
  )
}

// ─── Modal de Contato ─────────────────────────────────────────────────────────

const TEMP_CONFIG: Record<string, { bg: string; cor: string; border: string }> = {
  quente: { bg: 'rgba(255,59,59,0.10)',  cor: '#c2004f', border: 'rgba(255,59,59,0.25)' },
  morno:  { bg: 'rgba(239,159,39,0.12)', cor: '#BA7517', border: 'rgba(239,159,39,0.25)' },
  frio:   { bg: 'rgba(62,91,255,0.10)',  cor: '#3E5BFF', border: 'rgba(62,91,255,0.25)' },
}

interface ModalContatoProps {
  contato: Contato | null
  modo: 'criar' | 'editar' | 'ver'
  onFechar: () => void
  onSalvar: (contato: Partial<Contato>) => void
  onExcluir?: (id: string) => void
}

const CORES_AVATAR = ['#3E5BFF', '#7A5AF8', '#0fa856', '#FF5C8D', '#EF9F27', '#FF3B3B']
const CANAIS_OPCOES: { value: Canal; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'messenger', label: 'Messenger' },
  { value: 'instagram_dm', label: 'Instagram DM' },
  { value: 'lead_form_facebook', label: 'Lead Form Facebook' },
  { value: 'lead_form_instagram', label: 'Lead Form Instagram' },
  { value: 'organico', label: 'Orgânico' },
]

function ModalContato({ contato, modo, onFechar, onSalvar, onExcluir }: ModalContatoProps) {
  const [form, setForm] = useState<Partial<Contato>>(
    contato ?? { avatarCor: '#3E5BFF', stage: 'novo', canais: [], tags: [] }
  )
  const [tagInput, setTagInput] = useState('')

  const soLeitura = modo === 'ver'

  function set(patch: Partial<Contato>) { setForm(f => ({ ...f, ...patch })) }

  function getInitials(nome: string) {
    const partes = nome.trim().split(' ')
    if (partes.length >= 2) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
    return (partes[0]?.[0] ?? '?').toUpperCase()
  }

  function toggleCanal(canal: Canal) {
    const atual = form.canais ?? []
    if (atual.includes(canal)) set({ canais: atual.filter(c => c !== canal) })
    else set({ canais: [...atual, canal] })
  }

  function adicionarTag() {
    if (!tagInput.trim()) return
    set({ tags: [...(form.tags ?? []), tagInput.trim()] })
    setTagInput('')
  }

  function removerTag(tag: string) {
    set({ tags: (form.tags ?? []).filter(t => t !== tag) })
  }

  const titulo = modo === 'criar' ? 'Novo contato' : modo === 'editar' ? 'Editar contato' : 'Detalhes do contato'

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 36, padding: '0 10px',
    background: soLeitura ? 'var(--ws-surface-2)' : 'var(--ws-glass-bg)',
    border: '1px solid var(--ws-glass-border)',
    borderRadius: 8, fontSize: 12, color: 'var(--ws-text-1)',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
    pointerEvents: soLeitura ? 'none' : 'auto',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: 'var(--ws-text-3)',
    textTransform: 'uppercase' as const, letterSpacing: '0.06em',
    display: 'block', marginBottom: 6,
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(14,20,42,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
    >
      <div style={{
        width: 600, maxWidth: '95vw', maxHeight: '90vh',
        background: 'var(--ws-glass-bg)',
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 16, boxShadow: 'var(--ws-glass-shadow-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative',
        animation: 'fadeInScale 150ms ease',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, var(--ws-glass-border), transparent)' }} />

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--ws-divider)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar initials={getInitials(form.nome ?? '?')} cor={form.avatarCor ?? '#3E5BFF'} size={44} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ws-text-1)' }}>{titulo}</div>
            {contato && <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 2 }}>ID: {contato.id} · Criado em {contato.criadoEm}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {modo === 'ver' && onExcluir && (
              <button onClick={() => { onExcluir(contato!.id); onFechar() }}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,92,141,0.25)', background: 'rgba(255,92,141,0.08)', fontSize: 11, color: '#c2004f', cursor: 'pointer', fontWeight: 500 }}>
                Excluir
              </button>
            )}
            <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-3)', padding: 4, display: 'flex', alignItems: 'center' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Cor do avatar */}
          {!soLeitura && (
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Cor do avatar</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {CORES_AVATAR.map(cor => (
                  <button key={cor} onClick={() => set({ avatarCor: cor })}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', background: cor,
                      border: form.avatarCor === cor ? `3px solid ${cor}` : '3px solid transparent',
                      outline: form.avatarCor === cor ? `2px solid white` : 'none',
                      outlineOffset: -4, cursor: 'pointer', boxShadow: form.avatarCor === cor ? `0 0 0 2px ${cor}` : 'none',
                    }} />
                ))}
              </div>
            </div>
          )}

          {/* Grid 2 colunas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>

            <div>
              <label style={labelStyle}>Nome completo *</label>
              <input style={inputStyle} value={form.nome ?? ''} onChange={e => set({ nome: e.target.value, avatarInitials: getInitials(e.target.value) })} placeholder="Ex: Maria Clara" />
            </div>

            <div>
              <label style={labelStyle}>Telefone *</label>
              <input style={inputStyle} value={form.telefone ?? ''} onChange={e => set({ telefone: e.target.value })} placeholder="+55 41 99999-0000" />
            </div>

            <div>
              <label style={labelStyle}>E-mail</label>
              <input style={inputStyle} type="email" value={form.email ?? ''} onChange={e => set({ email: e.target.value })} placeholder="email@exemplo.com" />
            </div>

            <div>
              <label style={labelStyle}>Stage</label>
              <select
                style={{ ...inputStyle, cursor: soLeitura ? 'default' : 'pointer' }}
                value={form.stage ?? 'novo'}
                onChange={e => set({ stage: e.target.value as Stage })}
                disabled={soLeitura}
              >
                {(Object.keys(STAGE_CONFIG) as Stage[]).map(s => (
                  <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Atribuído a</label>
              <select
                style={{ ...inputStyle, cursor: soLeitura ? 'default' : 'pointer' }}
                value={form.atribuidoA ?? ''}
                onChange={e => set({ atribuidoA: e.target.value || undefined })}
                disabled={soLeitura}
              >
                <option value="">Sem atribuição</option>
                {AGENTES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Campanha de origem</label>
              <input style={inputStyle} value={form.campanhaOrigem ?? ''} onChange={e => set({ campanhaOrigem: e.target.value })} placeholder="Nome da campanha" />
            </div>
          </div>

          {/* Canais */}
          <div style={{ marginTop: 20 }}>
            <label style={labelStyle}>Canais de contato</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CANAIS_OPCOES.map(({ value, label }) => {
                const ativo = (form.canais ?? []).includes(value)
                const c = CANAL_CONFIG[value]
                return (
                  <button key={value} onClick={() => !soLeitura && toggleCanal(value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 500,
                      border: `1px solid ${ativo ? c.border : 'var(--ws-glass-border)'}`,
                      background: ativo ? c.bg : 'transparent',
                      color: ativo ? c.cor : 'var(--ws-text-3)',
                      cursor: soLeitura ? 'default' : 'pointer',
                      transition: 'all 150ms',
                    }}>
                    {ativo && <Check size={10} />}
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tags */}
          <div style={{ marginTop: 20 }}>
            <label style={labelStyle}>Tags</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {(form.tags ?? []).map(tag => (
                <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: 'var(--ws-blue-soft)', border: '1px solid rgba(62,91,255,0.20)', color: 'var(--ws-blue)' }}>
                  {tag}
                  {!soLeitura && <button onClick={() => removerTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'inherit', opacity: 0.7 }}><X size={9} /></button>}
                </span>
              ))}
            </div>
            {!soLeitura && (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarTag() } }}
                  placeholder="Adicionar tag... (Enter)"
                />
                <button onClick={adicionarTag}
                  style={{ padding: '0 12px', height: 36, borderRadius: 8, border: '1px solid var(--ws-glass-border)', background: 'rgba(62,91,255,0.08)', color: 'var(--ws-blue)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  + Tag
                </button>
              </div>
            )}
          </div>

          {/* Notas */}
          <div style={{ marginTop: 20 }}>
            <label style={labelStyle}>Notas</label>
            <textarea
              style={{ ...inputStyle, height: 80, padding: '8px 10px', resize: 'vertical' as const }}
              value={form.notas ?? ''}
              onChange={e => set({ notas: e.target.value })}
              placeholder="Observações sobre o contato..."
              readOnly={soLeitura}
            />
          </div>

          {/* Inteligência (IA) — só leitura, quando há dados da análise / redes sociais */}
          {soLeitura && (form.resumoIa || form.interesse || form.temperatura || form.instagram || form.facebook || form.nomeConfirmado === false) && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--ws-divider)' }}>
              <label style={labelStyle}>Inteligência (IA)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: (form.resumoIa || form.instagram || form.facebook) ? 10 : 0 }}>
                {form.temperatura && (() => {
                  const t = TEMP_CONFIG[form.temperatura] ?? TEMP_CONFIG.morno
                  return (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 9999, textTransform: 'capitalize', background: t.bg, color: t.cor, border: `1px solid ${t.border}` }}>
                      {form.temperatura}{typeof form.scoreLeadIa === 'number' ? ` · ${form.scoreLeadIa}` : ''}
                    </span>
                  )
                })()}
                {form.nomeConfirmado === false && (
                  <span title="Nome do WhatsApp — ainda não confirmado pelo cliente" style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.25)', color: '#128C7E' }}>
                    Nome do WhatsApp
                  </span>
                )}
                {form.interesse && (
                  <span style={{ fontSize: 11, color: 'var(--ws-text-2)' }}>Interesse: <strong style={{ color: 'var(--ws-text-1)' }}>{form.interesse}</strong></span>
                )}
              </div>
              {form.resumoIa && (
                <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ws-text-2)', margin: 0, background: 'var(--ws-surface-2)', padding: '10px 12px', borderRadius: 8 }}>{form.resumoIa}</p>
              )}
              {(form.instagram || form.facebook) && (
                <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                  {form.instagram && <span style={{ fontSize: 11, color: 'var(--ws-text-2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Instagram size={12} /> {form.instagram}</span>}
                  {form.facebook && <span style={{ fontSize: 11, color: 'var(--ws-text-2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Facebook size={12} /> {form.facebook}</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!soLeitura && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--ws-divider)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onFechar}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--ws-glass-border)', background: 'transparent', fontSize: 12, color: 'var(--ws-text-2)', cursor: 'pointer', fontWeight: 500 }}>
              Cancelar
            </button>
            <button onClick={() => { onSalvar(form); onFechar() }}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)', fontSize: 12, color: 'white', cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 12px rgba(62,91,255,0.35)' }}>
              {modo === 'criar' ? 'Criar contato' : 'Salvar alterações'}
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes fadeInScale { from { opacity:0; transform:scale(0.97) } to { opacity:1; transform:scale(1) } }`}</style>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PaginaContatos() {
  const { contatos: contatosReal, isLoading, error, refetch } = useContatos()
  const contatosMapeados = useMemo(() => contatosReal.map(mapearContatoReal), [contatosReal])

  const [contatos, setContatos] = useState<Contato[]>([])
  const [busca, setBusca] = useState('')
  const [filtroStage, setFiltroStage] = useState<Stage | 'todos'>('todos')
  const [filtroCanal, setFiltroCanal] = useState<Canal | 'todos'>('todos')
  const [filtroAgente, setFiltroAgente] = useState<string>('todos')
  const [ordenarPor, setOrdenarPor] = useState<'nome' | 'primeiroContato' | 'ultimoContato' | 'stage'>('ultimoContato')
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [modal, setModal] = useState<{ aberto: boolean; modo: 'criar' | 'editar' | 'ver'; contato: Contato | null }>({ aberto: false, modo: 'criar', contato: null })

  // Sync mapped real data into local state (for client-side create/edit/delete)
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setContatos(contatosMapeados)
    })
    return () => {
      cancelled = true
    }
  }, [contatosMapeados])

  const filtrados = useMemo(() => {
    let lista = [...contatos]
    if (busca) lista = lista.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()) || c.telefone.includes(busca))
    if (filtroStage !== 'todos') lista = lista.filter(c => c.stage === filtroStage)
    if (filtroCanal !== 'todos') lista = lista.filter(c => c.canais.includes(filtroCanal))
    if (filtroAgente !== 'todos') lista = lista.filter(c => c.atribuidoA === filtroAgente)
    lista.sort((a, b) => {
      if (ordenarPor === 'nome') return a.nome.localeCompare(b.nome)
      if (ordenarPor === 'stage') return a.stage.localeCompare(b.stage)
      return b.criadoEm.localeCompare(a.criadoEm)
    })
    return lista
  }, [contatos, busca, filtroStage, filtroCanal, filtroAgente, ordenarPor])

  const totalPaginas = Math.ceil(filtrados.length / POR_PAGINA)
  const paginados = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  function abrirCriar() { setModal({ aberto: true, modo: 'criar', contato: null }) }
  function abrirEditar(c: Contato) { setModal({ aberto: true, modo: 'editar', contato: c }) }
  function abrirVer(c: Contato) { setModal({ aberto: true, modo: 'ver', contato: c }) }
  function fecharModal() { setModal(m => ({ ...m, aberto: false })) }

  function salvarContato(dados: Partial<Contato>) {
    if (modal.modo === 'criar') {
      const novo: Contato = {
        id: `c-${Date.now()}`,
        nome: dados.nome ?? 'Sem nome',
        nomeConfirmado: true,   // criação manual = nome confirmado
        telefone: dados.telefone ?? '',
        email: dados.email,
        avatarInitials: (dados.nome ?? '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase(),
        avatarCor: dados.avatarCor ?? '#3E5BFF',
        canais: dados.canais ?? [],
        campanhaOrigem: dados.campanhaOrigem,
        stage: dados.stage ?? 'novo',
        atribuidoA: dados.atribuidoA,
        tags: dados.tags ?? [],
        primeiroContato: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        ultimoContato: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        notas: dados.notas,
        criadoEm: new Date().toISOString().slice(0, 10),
      }
      setContatos(cs => [novo, ...cs])
    } else {
      setContatos(cs => cs.map(c => c.id === modal.contato?.id ? { ...c, ...dados } : c))
    }
  }

  function excluirContato(id: string) {
    setContatos(cs => cs.filter(c => c.id !== id))
  }

  const glassSelect: React.CSSProperties = {
    height: 32, padding: '0 10px',
    background: 'var(--ws-glass-bg)',
    border: '1px solid var(--ws-glass-border)',
    backdropFilter: 'blur(10px)',
    borderRadius: 'var(--ws-radius-md)' as unknown as number,
    fontSize: 12, color: 'var(--ws-text-1)',
    outline: 'none', cursor: 'pointer',
    boxShadow: 'var(--ws-glass-shadow-sm)',
  }

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'var(--font-sans-base)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ws-text-1)', letterSpacing: '-0.02em', margin: 0, marginBottom: 4 }}>
            Contatos
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ws-text-3)', margin: 0 }}>
            {contatos.length.toLocaleString('pt-BR')} contatos cadastrados
          </p>
        </div>
        <button onClick={abrirCriar}
          style={{ height: 36, padding: '0 16px', background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)', border: 'none', borderRadius: 'var(--ws-radius-md)' as unknown as number, fontSize: 12, fontWeight: 600, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(62,91,255,0.35)', transition: 'all 150ms' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(62,91,255,0.50)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(62,91,255,0.35)' }}
        >
          <Plus size={14} /> Novo contato
        </button>
      </div>

      {/* Banner de erro (ex.: 403 — sem permissão para a tela de contatos) */}
      {error && (
        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 'var(--ws-radius-md)' as unknown as number, background: 'rgba(255,92,141,0.08)', border: '1px solid rgba(255,92,141,0.25)', color: '#c2004f', fontSize: 13, fontWeight: 500 }}>
          {error}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {STATS.map(s => (
          <div key={s.label} style={{ background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', borderRadius: 'var(--ws-radius-lg)' as unknown as number, backdropFilter: 'blur(16px)', boxShadow: 'var(--ws-glass-shadow-sm)', padding: '14px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, var(--ws-glass-border), transparent)' }} />
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ws-text-3)', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.cor, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.valor}</div>
            <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-3)', pointerEvents: 'none' }} />
          <input type="text" placeholder="Buscar contato ou telefone..." value={busca} onChange={e => { setBusca(e.target.value); setPaginaAtual(1) }}
            style={{ ...glassSelect, width: 240, paddingLeft: 30, height: 32 }}
            onFocus={e => { e.target.style.borderColor = 'rgba(62,91,255,0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(62,91,255,0.12)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--ws-glass-border)'; e.target.style.boxShadow = 'var(--ws-glass-shadow-sm)' }}
          />
        </div>

        <select style={glassSelect} value={filtroStage} onChange={e => { setFiltroStage(e.target.value as Stage | 'todos'); setPaginaAtual(1) }}>
          <option value="todos">Todos os stages</option>
          {(Object.keys(STAGE_CONFIG) as Stage[]).map(s => <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>)}
        </select>

        <select style={glassSelect} value={filtroCanal} onChange={e => { setFiltroCanal(e.target.value as Canal | 'todos'); setPaginaAtual(1) }}>
          <option value="todos">Todos os canais</option>
          {CANAIS_OPCOES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        <select style={glassSelect} value={filtroAgente} onChange={e => { setFiltroAgente(e.target.value); setPaginaAtual(1) }}>
          <option value="todos">Todos os agentes</option>
          {AGENTES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>Ordenar por</span>
          <select style={glassSelect} value={ordenarPor} onChange={e => setOrdenarPor(e.target.value as typeof ordenarPor)}>
            <option value="ultimoContato">Último contato</option>
            <option value="primeiroContato">Primeiro contato</option>
            <option value="nome">Nome</option>
            <option value="stage">Stage</option>
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div style={{ background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', borderRadius: 'var(--ws-radius-lg)', backdropFilter: 'blur(16px)', boxShadow: 'var(--ws-glass-shadow)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, var(--ws-glass-border), transparent)', zIndex: 1 }} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
            <thead>
              <tr style={{ background: 'rgba(62,91,255,0.04)', borderBottom: '1px solid var(--ws-divider)' }}>
                {['Contato', 'Telefone', 'Canal(is)', 'Campanha de origem', 'Stage', 'Atribuído a', '1º contato', 'Ações'].map(col => (
                  <th key={col} style={{ padding: '9px 12px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ws-text-3)', textAlign: 'left', whiteSpace: 'nowrap' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginados.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: 'var(--ws-text-3)', fontSize: 13 }}>
                  Nenhum contato encontrado para os filtros aplicados.
                </td></tr>
              ) : paginados.map(c => (
                <tr key={c.id}
                  style={{ borderBottom: '1px solid var(--ws-divider)', transition: 'background 100ms', cursor: 'default' }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(62,91,255,0.02)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar initials={c.avatarInitials} cor={c.avatarCor} src={resolveAvatarSrc(c.avatarUrl)} size={30} />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-1)' }}>{c.nome}</span>
                          {!c.nomeConfirmado && (
                            <span title="Nome do WhatsApp — ainda não confirmado pelo cliente"
                              style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 9999, background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.25)', color: '#128C7E', whiteSpace: 'nowrap' }}>
                              WhatsApp
                            </span>
                          )}
                        </div>
                        {c.email && <div style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>{c.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--ws-text-2)', whiteSpace: 'nowrap' }}>{formatarTelefoneBR(c.telefone) || c.telefone}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {c.canais.map(canal => <CanalBadge key={canal} canal={canal} />)}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {c.campanhaOrigem
                      ? <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 9999, background: 'rgba(122,90,248,0.10)', border: '1px solid rgba(122,90,248,0.20)', color: '#7A5AF8' }}>{c.campanhaOrigem}</span>
                      : <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>— orgânico</span>
                    }
                  </td>
                  <td style={{ padding: '10px 12px' }}><StageBadge stage={c.stage} /></td>
                  <td style={{ padding: '10px 12px', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {c.atribuidoA
                      ? <span style={{ color: 'var(--ws-text-2)' }}>{c.atribuidoA}</span>
                      : <span style={{ color: '#BA7517', fontWeight: 500 }}>Sem atrib..</span>
                    }
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--ws-text-3)', whiteSpace: 'nowrap' }}>{c.primeiroContato}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => abrirVer(c)}
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--ws-blue)', fontWeight: 500 }}>
                        Ver
                      </button>
                      <button onClick={() => abrirEditar(c)}
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--ws-text-2)' }}>
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--ws-divider)', fontSize: 12, color: 'var(--ws-text-3)' }}>
          <span>Mostrando {Math.min((paginaAtual - 1) * POR_PAGINA + 1, filtrados.length)}–{Math.min(paginaAtual * POR_PAGINA, filtrados.length)} de {filtrados.length} contatos</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setPaginaAtual(p => Math.max(1, p - 1))} disabled={paginaAtual === 1}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--ws-divider)', background: 'transparent', cursor: paginaAtual === 1 ? 'not-allowed' : 'pointer', color: paginaAtual === 1 ? 'var(--ws-text-3)' : 'var(--ws-text-2)', display: 'flex', alignItems: 'center' }}>
              <ChevronLeft size={13} />
            </button>
            {Array.from({ length: Math.min(totalPaginas, 5) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPaginaAtual(p)}
                style={{ padding: '4px 8px', minWidth: 28, borderRadius: 6, border: `1px solid ${paginaAtual === p ? 'rgba(62,91,255,0.30)' : 'var(--ws-divider)'}`, background: paginaAtual === p ? 'rgba(62,91,255,0.08)' : 'transparent', color: paginaAtual === p ? '#3E5BFF' : 'var(--ws-text-2)', fontWeight: paginaAtual === p ? 500 : 400, cursor: 'pointer', fontSize: 12 }}>
                {p}
              </button>
            ))}
            <button onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))} disabled={paginaAtual === totalPaginas}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--ws-divider)', background: 'transparent', cursor: paginaAtual === totalPaginas ? 'not-allowed' : 'pointer', color: paginaAtual === totalPaginas ? 'var(--ws-text-3)' : 'var(--ws-text-2)', display: 'flex', alignItems: 'center' }}>
              <ChevronRightIcon size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal.aberto && (
        <ModalContato
          contato={modal.contato}
          modo={modal.modo}
          onFechar={fecharModal}
          onSalvar={salvarContato}
          onExcluir={excluirContato}
        />
      )}
    </div>
  )
}
