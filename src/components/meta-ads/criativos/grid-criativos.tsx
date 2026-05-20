'use client'

import { useState, useEffect } from 'react'
import { Image, Video, LayoutGrid, Eye, Check } from 'lucide-react'
import { Criativo, TipoCriativo, StatusCriativo } from '@/types/meta-ads-criativos'
import { proxyImagem } from '@/lib/imagem-proxy'

interface Props {
  criativos: Criativo[]
  colunas: number
  comparadorAtivo: boolean
  selecionados: Set<string>
  onCardClick: (id: string) => void
  onAbrirPreview: (id: string) => void
  onColunasChange?: (n: number) => void
}

function IconeTipo({ tipo }: { tipo: TipoCriativo }) {
  const style = { color: 'rgba(0,0,0,0.20)' }
  if (tipo === 'VIDEO') return <Video size={32} style={style} />
  if (tipo === 'CAROUSEL') return <LayoutGrid size={32} style={style} />
  return <Image size={32} style={style} />
}

const LABEL_TIPO: Record<TipoCriativo, string> = {
  IMAGE: 'Imagem',
  VIDEO: 'Vídeo',
  CAROUSEL: 'Carrossel',
}

const STATUS_CFG: Record<StatusCriativo, { label: string; bg: string }> = {
  evergreen: { label: '★ Evergreen', bg: 'rgba(59,109,17,0.85)' },
  novo: { label: '✦ Novo', bg: 'rgba(100,100,100,0.80)' },
  atencao: { label: '⚑ Atenção', bg: 'rgba(133,79,11,0.85)' },
  fadiga: { label: '⚠ Fadiga', bg: 'rgba(163,45,45,0.85)' },
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

function BarraMini({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  const pct = max > 0 ? Math.min((valor / max) * 100, 100) : 0
  return (
    <div style={{ height: 4, background: 'var(--bg2)', borderRadius: 2, flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 2 }} />
    </div>
  )
}

export function GridCriativos({
  criativos,
  colunas,
  comparadorAtivo,
  selecionados,
  onCardClick,
  onAbrirPreview,
  onColunasChange
}: Props) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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
          {[3, 4, 5, 6, 8].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onColunasChange?.(n)}
              style={{
                width: 28, height: 28, fontSize: 12,
                fontWeight: colunas === n ? 600 : 500,
                color: colunas === n ? '#ffffff' : '#8892b0',
                background: colunas === n ? '#0E142A' : 'transparent',
                border: 'none', borderRadius: 7,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={e => {
                if (colunas !== n) {
                  e.currentTarget.style.background = 'rgba(62,91,255,0.08)'
                  e.currentTarget.style.color = '#3E5BFF'
                }
              }}
              onMouseLeave={e => {
                if (colunas !== n) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = '#8892b0'
                }
              }}
            >{n}</button>
          ))}
        </div>
      </div>

      {criativos.length === 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 24px',
          gap: 16,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'rgba(62,91,255,0.08)',
            border: '1px solid rgba(62,91,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
              stroke="rgba(62,91,255,0.60)" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 14, fontWeight: 600, color: 'var(--ws-text-1)', marginBottom: 6,
            }}>
              Nenhum criativo encontrado
            </div>
            <div style={{ fontSize: 12, color: 'var(--ws-text-3)', lineHeight: 1.6, maxWidth: 280 }}>
              Tente ajustar os filtros ou aguarde a sincronização dos dados da conta Meta Ads.
            </div>
          </div>
        </div>
      )}

      {criativos.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${colunas}, 1fr)`,
          gap: '12px',
        }}>
          {criativos.map((c, idx) => {
            const selecionado = selecionados.has(c.id)
            const statusCfg = STATUS_CFG[c.status] || STATUS_CFG.novo
            const barraCorSaude = corScore(c.score)

            return (
              <div
                key={`${c.id}-${idx}`}
                className="cc"
                onClick={() => onCardClick(c.id)}
                style={{
                  background: 'var(--card)',
                  border: selecionado
                    ? '2px solid var(--foreground)'
                    : '0.5px solid var(--border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  transition: 'box-shadow 150ms',
                  position: 'relative',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
              >
                {/* Thumbnail */}
                <div style={{
                  aspectRatio: '9/16',
                  width: '100%',
                  background: c.corFundo,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                }} className="cc-thumb">
                  {c.thumbnailUrl
                    ? <img src={proxyImagem(c.thumbnailUrl)} alt={c.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" loading="lazy" />
                    : <IconeTipo tipo={c.tipo} />
                  }

                  {/* Badge rank top-left */}
                  {comparadorAtivo && selecionado ? (
                    <div style={{
                      position: 'absolute', top: 6, left: 6,
                      width: 18, height: 18, borderRadius: '4px',
                      background: 'var(--foreground)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check size={11} style={{ color: '#fff' }} />
                    </div>
                  ) : (
                    <div style={{
                      position: 'absolute', top: 6, left: 6,
                      background: 'var(--foreground)', color: '#fff',
                      fontSize: '9px', fontWeight: 700,
                      padding: '1px 5px', borderRadius: '8px',
                    }}>
                      #{idx + 1}
                    </div>
                  )}

                  {/* Badge tipo top-right */}
                  <div style={{
                    position: 'absolute', top: 6, right: 6,
                    background: 'rgba(0,0,0,0.55)', color: '#fff',
                    fontSize: '8px', fontWeight: 600,
                    padding: '1px 5px', borderRadius: '4px',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {LABEL_TIPO[c.tipo]}
                  </div>

                  {/* Botão preview — aparece no hover via CSS class */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onAbrirPreview(c.id) }}
                    className="preview-btn"
                    style={{
                      position: 'absolute', top: 30, right: 6,
                      width: 24, height: 24, borderRadius: 4,
                      background: 'rgba(0,0,0,0.45)', border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#fff', opacity: 0,
                      transition: 'opacity 150ms ease',
                    }}
                  >
                    <Eye size={12} />
                  </button>

                  {/* Badge status bottom-left */}
                  <div style={{
                    position: 'absolute', bottom: 6, left: 6,
                    background: statusCfg.bg, color: '#fff',
                    fontSize: '9px', fontWeight: 600,
                    padding: '2px 6px', borderRadius: '4px',
                  }}>
                    {statusCfg.label}
                  </div>
                </div>

                {/* Barra de saúde */}
                <div style={{ height: '3px', background: 'var(--bg2)' }}>
                  <div style={{ height: '100%', width: `${c.score}%`, background: barraCorSaude }} />
                </div>

                {/* Body */}
                <div style={{ padding: '8px 10px' }}>
                  <div style={{
                    fontSize: '11px', fontWeight: 600, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginBottom: '2px',
                  }}>
                    {c.nome}
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--text2)', marginBottom: '6px' }}>
                    {c.campanhas} campanha{c.campanhas !== 1 ? 's' : ''} · {c.diasAtivo} dias ativo
                  </div>

                  {/* Grid 2×2 KPIs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '6px' }}>
                    <div>
                      <div style={{ fontSize: '8px', textTransform: 'uppercase', color: 'var(--text2)', letterSpacing: '0.04em' }}>Leads</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ws-gold)' }}>{c.leads.toLocaleString('pt-BR')}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '8px', textTransform: 'uppercase', color: 'var(--text2)', letterSpacing: '0.04em' }}>CPL</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: corCpl(c.cpl) }}>
                        R${c.cpl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '8px', textTransform: 'uppercase', color: 'var(--text2)', letterSpacing: '0.04em' }}>CTR</div>
                      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>{c.ctr.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '8px', textTransform: 'uppercase', color: 'var(--text2)', letterSpacing: '0.04em' }}>Score</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: corScore(c.score) }}>{c.score}</div>
                    </div>
                  </div>

                  {/* Mini barras Hook/Hold — só vídeos */}
                  {c.tipo === 'VIDEO' && c.hookRate !== null && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '8px', color: 'var(--text2)', width: 28, flexShrink: 0 }}>Hook</span>
                        <BarraMini valor={c.hookRate} max={100} cor={c.hookRate >= 25 ? '#3b6d11' : '#a32d2d'} />
                        <span style={{ fontSize: '9px', fontWeight: 500, color: 'var(--text)', width: 22, textAlign: 'right', flexShrink: 0 }}>
                          {c.hookRate}%
                        </span>
                      </div>
                      {c.holdRate !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ fontSize: '8px', color: 'var(--text2)', width: 28, flexShrink: 0 }}>Hold</span>
                          <BarraMini valor={c.holdRate} max={100} cor={c.holdRate >= 40 ? '#3b6d11' : '#854f0b'} />
                          <span style={{ fontSize: '9px', fontWeight: 500, color: 'var(--text)', width: 22, textAlign: 'right', flexShrink: 0 }}>
                            {c.holdRate}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        .cc:hover .preview-btn { opacity: 1 !important; }
        .dark .cc-thumb { filter: brightness(0.35) saturate(0.6); }
      `}</style>
    </div>
  )
}
