'use client'
import { useState, useRef, useEffect } from 'react'
import { ChevronRight, ChevronUp, ChevronDown, Image, Video, LayoutGrid, Columns3, Check, BookOpen } from 'lucide-react'
import { Campanha, ConjuntoAnuncios, Anuncio, StatusCampanha, Plataforma, TipoCriativo, Criativo } from '@/types/meta-ads-campanhas'
import { ModalCriativo } from './modal-criativo'

// ─── Column config ────────────────────────────────────────────────────────────

export type ColId = 'investimento' | 'leads' | 'cpl' | 'ctr' | 'cpc' | 'cpm' | 'desempenho' | 'orcamento'

const COLUNAS_CONFIG: { id: ColId; label: string; defaultOn: boolean }[] = [
  { id: 'investimento', label: 'Investimento',   defaultOn: true },
  { id: 'leads',        label: 'Leads',           defaultOn: true },
  { id: 'cpl',          label: 'CPL',             defaultOn: true },
  { id: 'ctr',          label: 'CTR',             defaultOn: true },
  { id: 'cpc',          label: 'CPC',             defaultOn: true },
  { id: 'cpm',          label: 'CPM',             defaultOn: true },
  { id: 'desempenho',   label: 'Desempenho',      defaultOn: true },
  { id: 'orcamento',    label: 'Orçamento/dia',   defaultOn: true },
]

const DEFAULT_COLS = new Set<ColId>(COLUNAS_CONFIG.filter(c => c.defaultOn).map(c => c.id))

interface Props {
  campanhas: Campanha[]
}

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

function fmtData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M'
  if (n >= 1000) return (n / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'K'
  return Math.round(n).toLocaleString('pt-BR')
}

function fmtPct(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
}

function cplColor(cpl: number): string {
  if (cpl <= 1.00) return '#0fa856'
  if (cpl >= 5.00) return '#FF5C8D'
  return 'inherit'
}

function barColor(score: number): string {
  if (score >= 91) return '#0fa856'
  if (score >= 71) return '#3E5BFF'
  if (score >= 41) return '#EF9F27'
  return '#FF5C8D'
}

// ─── Status badge ────────────────────────────────────────────────────────────

const statusConfig: Record<StatusCampanha, { label: string; bg: string; color: string; dot: string }> = {
  ACTIVE: { label: 'Ativa', bg: '#eaf3de', color: '#3b6d11', dot: '#3b6d11' },
  PAUSED: { label: 'Pausada', bg: '#faeeda', color: '#854f0b', dot: '#854f0b' },
  ARCHIVED: { label: 'Encerrada', bg: '#f1efe8', color: '#5f5e5a', dot: '#5f5e5a' },
  LEARNING: { label: 'Aprendendo', bg: '#e6f1fb', color: '#185fa5', dot: '#185fa5' },
  DELETED: { label: 'Excluída', bg: '#fcebeb', color: '#a32d2d', dot: '#a32d2d' },
}

function StatusBadge({ status, dataAtualizacao }: { status: StatusCampanha; dataAtualizacao?: string }) {
  const isPausada = status === 'PAUSED'
  const isAtiva = status === 'ACTIVE'
  
  const baseStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 8px', borderRadius: 10,
    fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
    border: '1px solid',
  }

  let specificStyle = {
    background: 'rgba(136,146,176,0.10)',
    color: '#8892b0',
    borderColor: 'rgba(136,146,176,0.25)',
  }

  if (isAtiva) {
    specificStyle = {
      background: 'rgba(15,168,86,0.10)',
      color: '#007a40',
      borderColor: 'rgba(15,168,86,0.25)',
    }
  } else if (isPausada) {
    specificStyle = {
      background: 'rgba(255,92,141,0.10)',
      color: '#c2004f',
      borderColor: 'rgba(255,92,141,0.25)',
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ ...baseStyle, ...specificStyle }}>
        {isAtiva ? 'Ativa' : isPausada ? 'Pausada' : status}
      </span>
      {isPausada && dataAtualizacao && (
        <span style={{ fontSize: 9, color: '#8892b0', paddingLeft: 2, whiteSpace: 'nowrap', marginTop: 2 }}>
          pausada em {fmtData(dataAtualizacao)}
        </span>
      )}
    </div>
  )
}

// ─── Platform icons ───────────────────────────────────────────────────────────

function IconFacebook({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  )
}

function IconInstagram({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#ffd600"/>
          <stop offset="25%" stopColor="#ff7a00"/>
          <stop offset="50%" stopColor="#ff0069"/>
          <stop offset="75%" stopColor="#d300c5"/>
          <stop offset="100%" stopColor="#7638fa"/>
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#ig-grad)"/>
      <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" fill="none"/>
      <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
    </svg>
  )
}

function IconWhatsApp({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366">
      <path d="M12.004 0C5.374 0 0 5.373 0 12.004c0 2.117.554 4.1 1.522 5.828L0 24l6.335-1.495A11.94 11.94 0 0012.004 24C18.63 24 24 18.627 24 12.004 24 5.373 18.63 0 12.004 0zm6.27 16.87c-.262.738-1.536 1.41-2.106 1.458-.57.05-1.107.254-3.73-.777-3.157-1.243-5.16-4.464-5.316-4.67-.156-.204-1.27-1.69-1.27-3.225s.8-2.29 1.085-2.604c.285-.313.62-.39.826-.39.206 0 .412.002.593.01.19.01.445-.072.697.532.262.628.888 2.17.966 2.328.078.156.13.34.026.547-.104.208-.156.336-.312.52-.156.183-.327.408-.468.548-.155.155-.317.323-.136.634.18.31.8 1.32 1.716 2.138 1.178 1.05 2.172 1.376 2.484 1.53.312.156.494.13.676-.078.183-.208.78-.91 .988-1.222.208-.312.416-.26.702-.156.286.104 1.82.86 2.132 1.015.313.156.52.234.598.364.078.13.078.754-.184 1.492z"/>
    </svg>
  )
}

function IconAudienceNetwork({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#5f5e5a">
      <circle cx="12" cy="12" r="10" stroke="#5f5e5a" strokeWidth="1.5" fill="none"/>
      <circle cx="12" cy="12" r="3" fill="#5f5e5a"/>
    </svg>
  )
}

const plataformaIconMap: Record<string, { bg: string; icon: (s: number) => React.ReactNode; title: string }> = {
  facebook:         { bg: '#e8f0fb', icon: s => <IconFacebook size={s} />,         title: 'Facebook' },
  instagram:        { bg: '#fef0f5', icon: s => <IconInstagram size={s} />,        title: 'Instagram' },
  whatsapp:         { bg: '#e8f8ed', icon: s => <IconWhatsApp size={s} />,         title: 'WhatsApp' },
  audience_network: { bg: '#f1efe8', icon: s => <IconAudienceNetwork size={s} />, title: 'Audience Network' },
}

function PlataformaIcons({ plataformas }: { plataformas: Plataforma[] }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {plataformas.map(p => {
        const cfg = plataformaIconMap[p]
        if (!cfg) return null
        return (
          <span
            key={p}
            title={cfg.title}
            style={{
              width: 18, height: 18, borderRadius: '50%',
              background: cfg.bg,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            {cfg.icon(12)}
          </span>
        )
      })}
    </div>
  )
}

// ─── Creative thumbnail ────────────────────────────────────────────────────────

const tipoIcon: Record<TipoCriativo, React.ReactNode> = {
  IMAGE: <Image size={14} strokeWidth={1.5} />,
  VIDEO: <Video size={14} strokeWidth={1.5} />,
  CAROUSEL: <LayoutGrid size={14} strokeWidth={1.5} />,
}

function CriativoThumb({ criativo, onClick }: { criativo: Criativo; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Ver criativo"
      style={{
        width: 32, height: 32, borderRadius: 4, flexShrink: 0,
        background: criativo.corFundo,
        border: '0.5px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', overflow: 'hidden',
        color: 'rgba(0,0,0,0.4)',
        transition: 'border-color 0.15s, opacity 0.15s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.borderColor = 'var(--ws-gold)'
        el.style.opacity = '0.85'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.borderColor = 'var(--border)'
        el.style.opacity = '1'
      }}
    >
      {criativo.thumbnailUrl ? (
        <img src={criativo.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        tipoIcon[criativo.tipo]
      )}
    </button>
  )
}

// ─── Performance bar ───────────────────────────────────────────────────────────

function BarraDesempenho({ score }: { score: number }) {
  const color = barColor(score)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
      <div style={{ flex: 1, height: 5, background: 'rgba(14,20,42,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, color: color, fontWeight: 500, minWidth: 28, textAlign: 'right' }}>
        {Math.round(score)}%
      </span>
    </div>
  )
}

// ─── Sort header ────────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc'

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  const color = active ? 'var(--ws-gold)' : 'rgba(0,0,0,0.2)'
  return dir === 'desc'
    ? <ChevronDown size={11} style={{ color }} />
    : <ChevronUp size={11} style={{ color }} />
}

function Th({
  label, sortKey: key, currentKey, currentDir, onClick, align = 'right', style
}: {
  label: string
  sortKey?: string
  currentKey: string
  currentDir: SortDir
  onClick?: (k: string) => void
  align?: 'left' | 'right'
  style?: React.CSSProperties
}) {
  const active = key === currentKey
  return (
    <th
      onClick={key ? () => onClick?.(key) : undefined}
      style={{
        padding: '10px 14px',
        fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: '#8892b0', fontWeight: 500,
        textAlign: align,
        cursor: key ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...style,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        {key && <SortIcon active={active} dir={active ? currentDir : 'desc'} />}
      </span>
    </th>
  )
}

// ─── Number cell ────────────────────────────────────────────────────────────────

function Td({ children, muted, blue, cpl, ctr, style }: {
  children: React.ReactNode
  muted?: boolean
  blue?: boolean
  cpl?: number
  ctr?: number
  style?: React.CSSProperties
}) {
  let color = 'inherit'
  if (blue) color = 'var(--ws-gold)'
  else if (cpl !== undefined) color = cplColor(cpl)
  else if (ctr !== undefined) {
    if (ctr >= 3) color = '#0fa856'
    else if (ctr < 1) color = '#FF5C8D'
  }
  else if (muted) color = '#8892b0'

  return (
    <td style={{
      padding: '10px 14px',
      fontSize: 13,
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
      textAlign: 'right',
      color: color,
      fontWeight: blue ? 500 : 400,
      ...style,
    }}>
      {children}
    </td>
  )
}

// ─── Columns dropdown ─────────────────────────────────────────────────────────

function ColunasDropdown({
  visíveis,
  onChange,
}: {
  visíveis: Set<ColId>
  onChange: (next: Set<ColId>) => void
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    if (aberto) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [aberto])

  const toggle = (id: ColId) => {
    const next = new Set(visíveis)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange(next)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setAberto(v => !v)}
        style={{
          height: 32, padding: '0 10px', border: '0.5px solid',
          borderColor: aberto ? 'var(--ws-gold)' : 'var(--border)',
          borderRadius: 6, fontSize: 12, cursor: 'pointer',
          color: aberto ? 'var(--ws-gold)' : 'var(--muted-foreground)',
          background: aberto ? 'rgba(201,168,76,0.12)' : 'var(--background)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <Columns3 size={13} />
        Colunas
      </button>

      {aberto && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: 'var(--background)',
          border: '0.5px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          padding: '6px 0',
          minWidth: 180,
          zIndex: 20,
        }}>
          <div style={{
            padding: '4px 12px 6px',
            fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--muted-foreground)',
          }}>
            Colunas visíveis
          </div>
          {COLUNAS_CONFIG.map(col => {
            const on = visíveis.has(col.id)
            return (
              <button
                key={col.id}
                onClick={() => toggle(col.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '5px 12px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, textAlign: 'left',
                  color: on ? 'var(--foreground)' : 'var(--muted-foreground)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  border: `1.5px solid ${on ? 'var(--ws-gold)' : 'var(--border)'}`,
                  background: on ? 'var(--ws-gold)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {on && <Check size={9} color="white" strokeWidth={3} />}
                </span>
                {col.label}
              </button>
            )
          })}
          <div style={{ borderTop: '0.5px solid var(--border)', margin: '4px 0' }} />
          <button
            onClick={() => onChange(DEFAULT_COLS)}
            style={{
              display: 'block', width: '100%', padding: '5px 12px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, textAlign: 'left', color: 'var(--ws-gold)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            Restaurar padrão
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TabelaHierarquica({ campanhas }: Props) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set(['c1']))
  const [expandidosCj, setExpandidosCj] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<string>('investimento')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [modalData, setModalData] = useState<{ criativo: Criativo; anuncio: Anuncio } | null>(null)
  const [colsVisiveis, setColsVisiveis] = useState<Set<ColId>>(DEFAULT_COLS)
  const vis = (id: ColId) => colsVisiveis.has(id)

  const toggleCampanha = (id: string) => {
    setExpandidos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleCj = (id: string) => {
    setExpandidosCj(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...campanhas].sort((a, b) => {
    const va = (a[sortKey as keyof Campanha] as number) ?? 0
    const vb = (b[sortKey as keyof Campanha] as number) ?? 0
    return sortDir === 'desc' ? vb - va : va - vb
  })

  const thProps = { currentKey: sortKey, currentDir: sortDir, onClick: handleSort }

  return (
    <>
      {/* Colunas button — right-aligned above table */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <ColunasDropdown visíveis={colsVisiveis} onChange={setColsVisiveis} />
      </div>

      <div style={{ 
        overflow: 'hidden',
        overflowX: 'auto', 
        background: 'var(--ws-glass-bg, rgba(255,255,255,0.72))',
        border: '1px solid var(--ws-glass-border, rgba(255,255,255,0.40))',
        borderRadius: 14,
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(14,20,42,0.10), 0 2px 8px rgba(14,20,42,0.06)'
      }}>
        <table style={{ minWidth: vis('cpc') && vis('cpm') ? 920 : 740, width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(14,20,42,0.03)', borderBottom: '1px solid rgba(14,20,42,0.07)' }}>
              <Th label="Campanha / Conjunto / Anúncio" align="left" {...thProps} style={{ minWidth: 320, paddingLeft: 14 }} />
              <Th label="Status" align="left" {...thProps} style={{ minWidth: 90 }} />
              <Th label="Plataforma" align="left" {...thProps} style={{ minWidth: 80 }} />
              {vis('investimento') && <Th label="Investimento" sortKey="investimento" {...thProps} />}
              {vis('leads')        && <Th label="Leads"        sortKey="leads"        {...thProps} />}
              {vis('cpl')          && <Th label="CPL"          sortKey="cpl"          {...thProps} />}
              {vis('ctr')          && <Th label="CTR"          sortKey="ctr"          {...thProps} />}
              {vis('cpc')          && <Th label="CPC"          sortKey="cpc"          {...thProps} />}
              {vis('cpm')          && <Th label="CPM"          sortKey="cpm"          {...thProps} />}
              {vis('desempenho')   && <Th label="Desempenho"   sortKey="indiceDesempenho" {...thProps} style={{ minWidth: 130 }} />}
              {vis('orcamento')    && <Th label="Orçamento/dia" {...thProps} />}
            </tr>
          </thead>
          <tbody>
            {sorted.map(campanha => (
              <CampanhaRows
                key={campanha.id}
                campanha={campanha}
                expandido={expandidos.has(campanha.id)}
                expandidosCj={expandidosCj}
                onToggle={toggleCampanha}
                onToggleCj={toggleCj}
                onOpenModal={setModalData}
                vis={vis}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ModalCriativo
        criativo={modalData?.criativo ?? null}
        anuncio={modalData?.anuncio ?? null}
        aberto={modalData !== null}
        onFechar={() => setModalData(null)}
      />
    </>
  )
}

// ─── Row components ───────────────────────────────────────────────────────────

function CampanhaRows({
  campanha, expandido, expandidosCj, onToggle, onToggleCj, onOpenModal, vis,
}: {
  campanha: Campanha
  expandido: boolean
  expandidosCj: Set<string>
  onToggle: (id: string) => void
  onToggleCj: (id: string) => void
  onOpenModal: (d: { criativo: Criativo; anuncio: Anuncio }) => void
  vis: (id: ColId) => boolean
}) {
  const objetivoLabel: Record<string, string> = {
    LEAD_GENERATION: 'Leads',
    BRAND_AWARENESS: 'Reconhecimento',
    CONVERSIONS: 'Conversões',
    TRAFFIC: 'Tráfego',
    REACH: 'Alcance',
    VIDEO_VIEWS: 'Visualizações',
  }

  return (
    <>
      {/* Campaign row (L0) */}
      <tr
        className="hover:bg-[rgba(62,91,255,0.02)]"
        style={{ borderBottom: '1px solid rgba(14,20,42,0.05)', cursor: 'pointer', transition: 'background 150ms' }}
        onClick={() => onToggle(campanha.id)}
      >
        <td style={{ padding: '10px 14px', minWidth: 320 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <button
              onClick={e => { e.stopPropagation(); onToggle(campanha.id) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0, paddingTop: 3, flexShrink: 0,
                color: '#8892b0',
                transition: 'all 150ms',
                transform: expandido ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#0E142A'}
              onMouseLeave={e => e.currentTarget.style.color = '#8892b0'}
            >
              <ChevronRight size={16} />
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 500, color: '#0E142A',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: 340,
              }} title={campanha.nome}>
                {campanha.nome}
              </div>
              <div style={{ fontSize: 10, color: '#8892b0', marginTop: 1 }}>
                {campanha.conjuntos.length} conjuntos · {objetivoLabel[campanha.objetivo] ?? campanha.objetivo}
              </div>
            </div>
          </div>
        </td>
        <td style={{ padding: '10px 14px' }}><StatusBadge status={campanha.status} dataAtualizacao={campanha.dataAtualizacao} /></td>
        <td style={{ padding: '10px 14px' }}><PlataformaIcons plataformas={campanha.plataformas} /></td>
        {vis('investimento') && <Td>R$ {fmtBRL(campanha.investimento)}</Td>}
        {vis('leads')        && <Td blue>{fmtNum(campanha.leads)}</Td>}
        {vis('cpl')          && <Td cpl={campanha.cpl}>R$ {fmtBRL(campanha.cpl)}</Td>}
        {vis('ctr')          && <Td ctr={campanha.ctr}>{campanha.ctr.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</Td>}
        {vis('cpc')          && <Td>R$ {fmtBRL(campanha.cpc)}</Td>}
        {vis('cpm')          && <Td muted>R$ {fmtBRL(campanha.cpm)}</Td>}
        {vis('desempenho')   && <td style={{ padding: '10px 14px' }}><BarraDesempenho score={campanha.indiceDesempenho} /></td>}
        {vis('orcamento')    && <Td muted>{campanha.orcamentoDiario ? `R$ ${fmtBRL(campanha.orcamentoDiario)}` : '—'}</Td>}
      </tr>

      {/* Ad Set rows (L1) */}
      {expandido && campanha.conjuntos.map(cj => (
        <ConjuntoRows
          key={cj.id}
          cj={cj}
          expandido={expandidosCj.has(cj.id)}
          onToggle={onToggleCj}
          onOpenModal={onOpenModal}
          vis={vis}
        />
      ))}
    </>
  )
}

function ConjuntoRows({
  cj, expandido, onToggle, onOpenModal, vis,
}: {
  cj: ConjuntoAnuncios
  expandido: boolean
  onToggle: (id: string) => void
  onOpenModal: (d: { criativo: Criativo; anuncio: Anuncio }) => void
  vis: (id: ColId) => boolean
}) {
  return (
    <>
      {/* Ad Set row (L1) */}
      <tr
        className="hover:bg-[rgba(62,91,255,0.02)]"
        style={{ background: 'rgba(14,20,42,0.01)', borderBottom: '1px solid rgba(14,20,42,0.04)', cursor: 'pointer', transition: 'background 150ms' }}
        onClick={() => cj.anuncios.length > 0 && onToggle(cj.id)}
      >
        <td style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingLeft: 40 }}>
            {cj.anuncios.length > 0 ? (
              <button
                onClick={e => { e.stopPropagation(); onToggle(cj.id) }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0, paddingTop: 3, flexShrink: 0,
                  color: '#8892b0',
                  transform: expandido ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#0E142A'}
                onMouseLeave={e => e.currentTarget.style.color = '#8892b0'}
              >
                <ChevronRight size={14} />
              </button>
            ) : (
              <span style={{ width: 14, flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 400, color: '#4a5580',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280,
              }} title={cj.nome}>
                {cj.nome}
              </div>
              <div style={{ fontSize: 10, color: '#8892b0', marginTop: 1 }}>
                {cj.anuncios.length} anúncio{cj.anuncios.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </td>
        <td style={{ padding: '10px 14px' }}><StatusBadge status={cj.status} dataAtualizacao={cj.dataAtualizacao} /></td>
        <td style={{ padding: '10px 14px' }}><PlataformaIcons plataformas={cj.plataformas} /></td>
        {vis('investimento') && <Td>R$ {fmtBRL(cj.investimento)}</Td>}
        {vis('leads')        && <Td blue>{fmtNum(cj.leads)}</Td>}
        {vis('cpl')          && <Td cpl={cj.cpl}>R$ {fmtBRL(cj.cpl)}</Td>}
        {vis('ctr')          && <Td ctr={cj.ctr}>{cj.ctr.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</Td>}
        {vis('cpc')          && <Td>R$ {fmtBRL(cj.cpc)}</Td>}
        {vis('cpm')          && <Td muted>R$ {fmtBRL(cj.cpm)}</Td>}
        {vis('desempenho')   && <td style={{ padding: '10px 14px' }}><BarraDesempenho score={cj.indiceDesempenho} /></td>}
        {vis('orcamento')    && <Td muted>{cj.orcamentoDiario ? `R$ ${fmtBRL(cj.orcamentoDiario)}` : '—'}</Td>}
      </tr>

      {/* Ad rows (L2) */}
      {expandido && cj.anuncios.map(anuncio => (
        <tr
          key={anuncio.id}
          className="hover:bg-[rgba(62,91,255,0.02)]"
          style={{ background: 'rgba(14,20,42,0.025)', borderBottom: '1px solid rgba(14,20,42,0.04)', transition: 'background 150ms' }}
        >
          <td style={{ padding: '8px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 64 }}>
              <CriativoThumb
                criativo={anuncio.criativo}
                onClick={() => onOpenModal({ criativo: anuncio.criativo, anuncio })}
              />
              <div style={{
                fontSize: 12, fontWeight: 400, color: '#4a5580',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280,
              }} title={anuncio.nome}>
                {anuncio.nome}
              </div>
              {/* Instagram permalink (real post) — only shown when available */}
              {anuncio.instagramPermalink && (
                <a
                  href={anuncio.instagramPermalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  title="Ver publicação no Instagram"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, width: 22, height: 22, borderRadius: 4,
                    border: '0.5px solid rgba(255,105,180,0.3)',
                    background: 'rgba(255,105,180,0.08)',
                    textDecoration: 'none', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255,105,180,0.18)'
                    e.currentTarget.style.borderColor = 'rgba(255,105,180,0.5)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,105,180,0.08)'
                    e.currentTarget.style.borderColor = 'rgba(255,105,180,0.3)'
                  }}
                >
                  <IconInstagram size={12} />
                </a>
              )}
              {/* Ads Library — always shown as fallback */}
              {anuncio.permalinkUrl && (
                <a
                  href={anuncio.permalinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  title="Ver na Biblioteca de Anúncios do Meta"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, width: 22, height: 22, borderRadius: 4,
                    border: '0.5px solid rgba(136,146,176,0.25)',
                    color: '#8892b0',
                    background: 'rgba(136,146,176,0.07)',
                    textDecoration: 'none', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(136,146,176,0.16)'
                    e.currentTarget.style.borderColor = 'rgba(136,146,176,0.45)'
                    e.currentTarget.style.color = '#4a5580'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(136,146,176,0.07)'
                    e.currentTarget.style.borderColor = 'rgba(136,146,176,0.25)'
                    e.currentTarget.style.color = '#8892b0'
                  }}
                >
                  <BookOpen size={11} strokeWidth={1.8} />
                </a>
              )}
            </div>
          </td>
          <td style={{ padding: '8px 14px' }}><StatusBadge status={anuncio.status} dataAtualizacao={anuncio.dataAtualizacao} /></td>
          <td style={{ padding: '8px 14px' }}><PlataformaIcons plataformas={anuncio.plataformas} /></td>
          {vis('investimento') && <Td>R$ {fmtBRL(anuncio.investimento)}</Td>}
          {vis('leads')        && <Td blue>{fmtNum(anuncio.leads)}</Td>}
          {vis('cpl')          && <Td cpl={anuncio.cpl}>R$ {fmtBRL(anuncio.cpl)}</Td>}
          {vis('ctr')          && <Td ctr={anuncio.ctr}>{anuncio.ctr.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</Td>}
          {vis('cpc')          && <Td>R$ {fmtBRL(anuncio.cpc)}</Td>}
          {vis('cpm')          && <Td muted>R$ {fmtBRL(anuncio.cpm)}</Td>}
          {vis('desempenho')   && <td style={{ padding: '8px 14px' }}><BarraDesempenho score={anuncio.indiceDesempenho} /></td>}
          {vis('orcamento')    && <Td muted>—</Td>}
        </tr>
      ))}
    </>
  )
}
