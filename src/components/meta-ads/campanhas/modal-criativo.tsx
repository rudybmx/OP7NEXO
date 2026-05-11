'use client'

import { useEffect } from 'react'
import { X, Image, Video, LayoutGrid, Clock } from 'lucide-react'
import { Criativo, Anuncio, TipoCriativo } from '@/types/meta-ads-campanhas'
import { proxyImagem } from '@/lib/imagem-proxy'

interface Props {
  criativo: Criativo | null
  anuncio: Anuncio | null
  aberto: boolean
  onFechar: () => void
}

const LABEL_TIPO: Record<TipoCriativo, string> = {
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  CAROUSEL: 'CAROUSEL',
}

function IconeTipo({ tipo }: { tipo: TipoCriativo }) {
  const style = { color: 'rgba(0,0,0,0.25)' }
  if (tipo === 'VIDEO') return <Video size={36} style={style} />
  if (tipo === 'CAROUSEL') return <LayoutGrid size={36} style={style} />
  return <Image size={36} style={style} />
}

function corCpl(cpl: number): string {
  if (cpl <= 1) return '#3b6d11'
  if (cpl <= 5) return '#854f0b'
  return '#a32d2d'
}

function corScore(score: number): string {
  if (score >= 75) return '#3b6d11'
  if (score >= 40) return 'var(--ws-gold)'
  return '#a32d2d'
}

function corFreq(freq: number): string {
  if (freq <= 2) return '#3b6d11'
  if (freq <= 3.5) return 'var(--ws-gold)'
  return '#a32d2d'
}

function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function ModalCriativo({ criativo, anuncio, aberto, onFechar }: Props) {
  useEffect(() => {
    if (!aberto) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [aberto, onFechar])

  if (!aberto || !criativo || !anuncio) return null

  const hasScore = Number.isFinite(anuncio.indiceDesempenho)
  const score = hasScore ? Math.max(0, Math.min(100, Number(anuncio.indiceDesempenho))) : 0
  const pctFreq = Math.min((anuncio.frequencia / 5) * 100, 100)
  const analiseLocal = `Score ${Math.round(score)}/100. CPL R$${fmtBRL(anuncio.cpl)}, CTR ${anuncio.ctr.toFixed(1)}%, frequência ${anuncio.frequencia.toFixed(1)}.`

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.97)',
          border: '1px solid rgba(14, 20, 42, 0.10)',
          borderRadius: '16px',
          width: '95vw',
          maxWidth: '780px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(14, 20, 42, 0.20)',
        }}
        className="dark:bg-[rgba(20,28,56,0.97)] dark:border-[rgba(255,255,255,0.10)]"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            gap: '8px',
            borderBottom: '1px solid rgba(14, 20, 42, 0.08)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0E142A', lineHeight: 1.3 }} className="dark:text-white">{anuncio.nome}</div>
            <div style={{
              display: 'inline-block',
              marginTop: '4px',
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '10px',
              fontWeight: 500,
              background: 'var(--muted)',
              color: 'var(--muted-foreground)',
            }}>
              {LABEL_TIPO[criativo.tipo]}
            </div>
          </div>
          <button
            onClick={onFechar}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#8892b0', flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '20px', padding: '16px', alignItems: 'start' }}>
          <div
            style={{
              width: '260px',
              aspectRatio: '9/16',
              background: criativo.corFundo,
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}
            className="dark:filter-[brightness(0.35)_saturate(0.6)]"
          >
            {criativo.thumbnailUrl
              ? <img src={proxyImagem(criativo.thumbnailUrl)} alt={anuncio.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <IconeTipo tipo={criativo.tipo} />
            }
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { label: 'Leads', valor: anuncio.leads.toLocaleString('pt-BR'), cor: 'var(--ws-gold)' },
                { label: 'CPL', valor: `R$ ${fmtBRL(anuncio.cpl)}`, cor: corCpl(anuncio.cpl) },
                { label: 'CTR', valor: `${anuncio.ctr.toFixed(1)}%`, cor: '#0E142A' },
                { label: 'Score IA', valor: hasScore ? String(Math.round(score)) : '-', cor: corScore(score) },
                { label: 'Frequência', valor: anuncio.frequencia.toFixed(1), cor: corFreq(anuncio.frequencia) },
                { label: 'Tipo', valor: LABEL_TIPO[criativo.tipo], cor: '#0E142A' },
              ].map(k => (
                <div key={k.label} style={{ background: 'rgba(14, 20, 42, 0.04)', borderRadius: '6px', padding: '8px' }}>
                  <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8892b0', marginBottom: '2px' }}>
                    {k.label}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: k.cor }} className="dark:text-inherit">{k.valor}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                background: 'rgba(62, 91, 255, 0.04)',
                border: '1px solid rgba(62, 91, 255, 0.12)',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                <Clock size={11} style={{ color: '#3E5BFF' }} />
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#3E5BFF', fontWeight: 600 }}>
                  Análise IA
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#0E142A', lineHeight: 1.6, margin: 0 }} className="dark:text-white/80">
                {analiseLocal}
              </p>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8892b0' }}>Frequência</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: corFreq(anuncio.frequencia) }}>
                  {anuncio.frequencia.toFixed(1)}
                </span>
              </div>
              <div style={{ height: '5px', background: 'rgba(14, 20, 42, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${pctFreq}%`,
                    background: corFreq(anuncio.frequencia),
                    transition: 'width 400ms',
                  }}
                />
              </div>
              <div style={{ fontSize: '9px', color: '#8892b0', marginTop: '6px' }}>
                1,0 - Ideal | 3,5 - Cuidado | 4,5+ - Fadiga de Público
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
