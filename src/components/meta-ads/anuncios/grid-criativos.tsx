'use client'

import { useState, useEffect } from 'react'
import { Image, Video, LayoutGrid } from 'lucide-react'
import { Anuncio, TipoAnuncio } from '@/types/meta-ads-anuncios'
import { formatarMoeda } from '@/lib/formatar'

interface Props {
  anuncios: Anuncio[]
  onAbrirAnuncio: (id: string) => void
}

const LABEL_TIPO: Record<TipoAnuncio, string> = {
  IMAGE: 'Imagem',
  VIDEO: 'Vídeo',
  CAROUSEL: 'Carrossel',
}

const COLS_OPTIONS = [3, 4, 5, 6, 8, 10] as const
const LS_KEY = 'odontocompany-grid-cols'

function IconeTipo({ tipo }: { tipo: TipoAnuncio }) {
  const style = { color: 'rgba(0,0,0,0.25)' }
  if (tipo === 'VIDEO') return <Video size={28} style={style} />
  if (tipo === 'CAROUSEL') return <LayoutGrid size={28} style={style} />
  return <Image size={28} style={style} />
}

function corScore(score: number): string {
  if (score >= 75) return '#0fa856'
  if (score >= 40) return '#EF9F27'
  return '#FF5C8D'
}

function badgeInferior(a: Anuncio): { texto: string; bg: string; cor: string } | null {
  if (a.score >= 80) return { texto: 'Top performer', bg: 'rgba(15,168,86,0.85)', cor: '#fff' }
  if (a.frequencia >= 3.5 && a.status === 'ACTIVE') return { texto: 'Fadiga', bg: 'rgba(163,45,45,0.85)', cor: '#fff' }
  if (a.status === 'PAUSED') return { texto: 'Pausado', bg: 'rgba(0,0,0,0.45)', cor: '#fff' }
  if (a.status === 'LEARNING') return { texto: 'Aprendendo', bg: 'rgba(24,95,165,0.85)', cor: '#fff' }
  return null
}

export function GridCriativos({ anuncios, onAbrirAnuncio }: Props) {
  const [cols, setCols] = useState<number>(5)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) {
      const n = parseInt(saved, 10)
      if (COLS_OPTIONS.includes(n as typeof COLS_OPTIONS[number])) setCols(n)
    }
  }, [])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function selecionarCols(n: number) {
    setCols(n)
    localStorage.setItem(LS_KEY, String(n))
  }

  const bodyPadding = '10px 12px'
  const labelSize = '8px'
  const valueSize = '11px'

  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      padding: '16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* LINHA BRILHO TOPO */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
      }} />

      {/* HEADER: seletor à direita */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: '14px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          background: 'rgba(14,20,42,0.05)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: '10px',
          padding: '3px',
        }}>
          {COLS_OPTIONS.map(n => (
            <button
              key={n}
              type="button"
              onClick={() => selecionarCols(n)}
              style={{
                width: 28, height: 28, fontSize: 12,
                fontWeight: cols === n ? 600 : 500,
                color: cols === n ? '#ffffff' : '#8892b0',
                background: cols === n ? '#0E142A' : 'transparent',
                border: 'none', borderRadius: 7,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={e => {
                if (cols !== n) {
                  e.currentTarget.style.background = 'rgba(62,91,255,0.08)'
                  e.currentTarget.style.color = '#3E5BFF'
                }
              }}
              onMouseLeave={e => {
                if (cols !== n) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = '#8892b0'
                }
              }}
            >{n}</button>
          ))}
        </div>
      </div>

      {/* GRID */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${cols}, minmax(0, 1fr))`,
        gap: '12px',
      }}>
        {anuncios.map((a, idx) => {
          const badge = badgeInferior(a)
          const scoreColor = corScore(a.score)

          return (
            <div
              key={`${a.id}-${idx}`}
              onClick={() => onAbrirAnuncio(a.id)}
              style={{
                background: 'rgba(255, 255, 255, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.50)',
                borderRadius: '12px',
                overflow: 'hidden',
                cursor: 'pointer',
                minWidth: 0,
                boxShadow: '0 4px 16px rgba(14, 20, 42, 0.09), 0 1px 4px rgba(14, 20, 42, 0.06)',
                transition: 'all 200ms ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(14, 20, 42, 0.14)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.70)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(14, 20, 42, 0.09), 0 1px 4px rgba(14, 20, 42, 0.06)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.50)'
              }}
            >
              {/* Thumbnail 9:16 */}
              <div style={{ position: 'relative', aspectRatio: '9/16', width: '100%', overflow: 'hidden', background: a.corFundo, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="dark:filter-[brightness(0.35)_saturate(0.6)]">
                {a.thumbnailUrl
                  ? <img src={a.thumbnailUrl} alt={a.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <IconeTipo tipo={a.tipo} />
                }

                {/* Badge rank */}
                <div style={{
                  position: 'absolute', top: '8px', left: '8px',
                  background: '#0E142A', color: '#ffffff',
                  fontSize: '9px', fontWeight: 700,
                  padding: '2px 7px', borderRadius: '10px',
                }}>
                  #{idx + 1}
                </div>

                {/* Badge tipo */}
                <div style={{
                  position: 'absolute', top: '8px', right: '8px',
                  background: 'rgba(0,0,0,0.45)', color: '#ffffff',
                  fontSize: '9px', padding: '2px 7px', borderRadius: '3px',
                }}>
                  {LABEL_TIPO[a.tipo]}
                </div>

                {/* Badge inferior */}
                {badge && (
                  <div style={{
                    position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
                    background: badge.bg, color: badge.cor,
                    fontSize: '9px', fontWeight: 600, padding: '2px 7px', borderRadius: '10px',
                    whiteSpace: 'nowrap',
                  }}>
                    {badge.texto}
                  </div>
                )}
              </div>

              {/* Barra de saúde */}
              <div style={{ height: '3px', background: 'rgba(14, 20, 42, 0.08)' }}>
                <div style={{ height: '100%', width: `${a.score}%`, background: scoreColor, transition: 'width 400ms' }} />
              </div>

              {/* Body */}
              <div style={{ padding: bodyPadding }}>
                <div style={{ fontSize: '11px', fontWeight: 500, color: '#0E142A', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.nome}
                </div>
                <div style={{ fontSize: '9px', color: '#8892b0', marginBottom: '6px' }}>
                  3 campanhas · 12 dias ativo
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                  {[
                    { label: 'Leads', valor: a.leads.toLocaleString('pt-BR'), cor: 'var(--ws-gold)' },
                    { label: 'CPL', valor: formatarMoeda(a.cpl), cor: a.cpl <= 1 ? '#0fa856' : a.cpl > 5 ? '#FF5C8D' : '#0E142A' },
                    { label: 'CTR', valor: a.ctr.toFixed(1) + '%', cor: '#0E142A' },
                    { label: 'Freq.', valor: a.frequencia.toFixed(1), cor: a.frequencia >= 3.5 ? '#FF5C8D' : '#0E142A' },
                  ].map(m => (
                    <div key={m.label} style={{ background: 'rgba(14, 20, 42, 0.04)', borderRadius: '4px', padding: '4px 5px' }}>
                      <div style={{ fontSize: labelSize, color: '#8892b0', textTransform: 'uppercase' }}>{m.label}</div>
                      <div style={{ fontSize: valueSize, fontWeight: 500, color: m.cor }}>{m.valor}</div>
                    </div>
                  ))}
                </div>
                
                {a.tipo === 'VIDEO' && (
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7px', color: '#8892b0', marginBottom: '2px', textTransform: 'uppercase' }}>
                      <span>Hook / Hold</span>
                    </div>
                    <div style={{ display: 'flex', gap: '2px', height: '3px', background: 'rgba(14, 20, 42, 0.08)', borderRadius: '1px' }}>
                      <div style={{ width: '45%', background: '#3E5BFF', borderRadius: '1px' }} />
                      <div style={{ width: '30%', background: '#7A5AF8', borderRadius: '1px' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
