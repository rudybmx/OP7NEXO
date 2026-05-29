'use client'

import { useEffect } from 'react'
import { X, Image, Video, LayoutGrid } from 'lucide-react'
import { Criativo, TipoCriativo } from '@/types/meta-ads-criativos'
import { proxyImagem } from '@/lib/imagem-proxy'

interface Props {
  criativo: Criativo | null
  aberto: boolean
  onFechar: () => void
  onAbrirDetalhe: (id: string) => void
}

const LABEL_TIPO: Record<TipoCriativo, string> = {
  IMAGE: 'Imagem',
  VIDEO: 'Vídeo',
  CAROUSEL: 'Carrossel',
}

const STATUS_LABEL: Record<string, string> = {
  evergreen: '★ Evergreen',
  novo: '✦ Novo',
  atencao: '⚑ Atenção',
  fadiga: '⚠ Fadiga',
}

const STATUS_BG: Record<string, string> = {
  evergreen: 'rgba(59,109,17,0.15)',
  novo: 'rgba(100,100,100,0.10)',
  atencao: 'rgba(133,79,11,0.15)',
  fadiga: 'rgba(163,45,45,0.15)',
}

const STATUS_COR: Record<string, string> = {
  evergreen: '#3b6d11',
  novo: 'var(--foreground)',
  atencao: '#854f0b',
  fadiga: '#a32d2d',
}

function IconeTipo({ tipo }: { tipo: TipoCriativo }) {
  const style = { color: 'rgba(0,0,0,0.20)' }
  if (tipo === 'VIDEO') return <Video size={40} style={style} />
  if (tipo === 'CAROUSEL') return <LayoutGrid size={40} style={style} />
  return <Image size={40} style={style} />
}

function corCpl(v: number) {
  if (v <= 1) return '#3b6d11'
  if (v <= 5) return '#854f0b'
  return '#a32d2d'
}

function corScore(s: number) {
  if (s >= 75) return '#3b6d11'
  if (s >= 40) return 'var(--ws-gold)'
  return '#a32d2d'
}

export function ModalPreview({ criativo, aberto, onFechar, onAbrirDetalhe }: Props) {
  useEffect(() => {
    if (!aberto) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [aberto, onFechar])

  if (!aberto || !criativo) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.50)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
    >
      <div style={{
        background: 'var(--card)',
        border: '0.5px solid var(--card-border)',
        borderRadius: '10px',
        width: '95vw',
        maxWidth: '560px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {criativo.nome}
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 2, flexShrink: 0, marginLeft: 8 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', gap: '16px', padding: '0 16px 16px', alignItems: 'flex-start' }}>
          {/* Thumbnail */}
          <div style={{
            width: '160px',
            flexShrink: 0,
            aspectRatio: '9/16',
            maxHeight: '420px',
            background: criativo.corFundo,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }} className="cc-thumb">
            {criativo.imageUrlHq || criativo.thumbnailUrl
              ? <img src={proxyImagem(criativo.imageUrlHq ?? criativo.thumbnailUrl)} alt={criativo.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" loading="lazy" />
              : <IconeTipo tipo={criativo.tipo} />
            }
          </div>

          {/* Lado direito */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
            {/* Badges */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{
fontSize: '10px', fontWeight: 600, padding: '3px 7px', borderRadius: '4px',
                 background: 'var(--bg2)', color: 'var(--foreground)',
              }}>
                {LABEL_TIPO[criativo.tipo]}
              </span>
              <span style={{
                fontSize: '10px', fontWeight: 600, padding: '3px 7px', borderRadius: '4px',
                background: STATUS_BG[criativo.status], color: STATUS_COR[criativo.status],
              }}>
                {STATUS_LABEL[criativo.status]}
              </span>
            </div>

            {/* KPIs */}
            {[
              { label: 'Leads', valor: criativo.leads.toLocaleString('pt-BR'), cor: 'var(--ws-gold)' },
              { label: 'CPL', valor: `R$${criativo.cpl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, cor: corCpl(criativo.cpl) },
              { label: 'CTR', valor: `${criativo.ctr.toFixed(1)}%`, cor: 'var(--text)' },
              { label: 'Score IA', valor: `${criativo.score}/100`, cor: corScore(criativo.score) },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--bg2)', borderRadius: '5px', padding: '6px 8px', border: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)', marginBottom: '2px' }}>
                  {k.label}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: k.cor }}>{k.valor}</div>
              </div>
            ))}

            {/* Botão análise */}
            <button
              onClick={() => { onFechar(); onAbrirDetalhe(criativo.id) }}
              style={{
                fontSize: '12px',
                padding: '8px 12px',
                background: 'var(--foreground)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
                marginTop: '4px',
              }}
            >
              Ver análise completa →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
