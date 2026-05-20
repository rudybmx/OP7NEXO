'use client'

import { useEffect } from 'react'
import { X, Image, Video, LayoutGrid, Clock } from 'lucide-react'
import { Criativo, InsightCriativo, TipoCriativo } from '@/types/meta-ads-criativos'
import { proxyImagem } from '@/lib/imagem-proxy'

interface Props {
  criativo: Criativo | null
  insight: InsightCriativo | null
  aberto: boolean
  onFechar: () => void
  onAbrirPreview: (id: string) => void
}

function IconeTipo({ tipo }: { tipo: TipoCriativo }) {
  const style = { color: 'rgba(0,0,0,0.20)' }
  if (tipo === 'VIDEO') return <Video size={36} style={style} />
  if (tipo === 'CAROUSEL') return <LayoutGrid size={36} style={style} />
  return <Image size={36} style={style} />
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

function corFreq(v: number) {
  if (v <= 2) return '#3b6d11'
  if (v <= 3.5) return 'var(--ws-gold)'
  return '#a32d2d'
}

function corHook(v: number) {
  if (v >= 25) return '#3b6d11'
  if (v >= 15) return '#854f0b'
  return '#a32d2d'
}

function corHold(v: number) {
  if (v >= 40) return '#3b6d11'
  if (v >= 25) return '#854f0b'
  return '#a32d2d'
}

export function ModalDetalhe({ criativo, insight, aberto, onFechar, onAbrirPreview }: Props) {
  useEffect(() => {
    if (!aberto) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [aberto, onFechar])

  if (!aberto || !criativo) return null

  const kpis = [
    { label: 'Leads', valor: criativo.leads.toLocaleString('pt-BR'), cor: 'var(--ws-gold)' },
    { label: 'CPL', valor: `R$${criativo.cpl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, cor: corCpl(criativo.cpl) },
    { label: 'CTR', valor: `${criativo.ctr.toFixed(1)}%`, cor: 'var(--text)' },
    { label: 'Score IA', valor: `${criativo.score}/100`, cor: corScore(criativo.score) },
    { label: 'Freq. Acum.', valor: criativo.frequencia.toFixed(1), cor: corFreq(criativo.frequencia) },
    { label: 'Dias ativo', valor: String(criativo.diasAtivo), cor: 'var(--text)' },
  ]

  const analise = insight?.analiseCompleta
    ?? `Score IA ${criativo.score}/100. CPL R$${criativo.cpl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, CTR ${criativo.ctr.toFixed(1)}%, frequência ${criativo.frequencia.toFixed(1)}. Criativo com ${criativo.diasAtivo} dias ativo em ${criativo.campanhas} campanha${criativo.campanhas !== 1 ? 's' : ''}.`

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
      <div style={{
        background: 'var(--card)',
        border: '0.5px solid var(--card-border)',
        borderRadius: '10px',
        width: '95vw',
        maxWidth: '780px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.20)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 16px 0', gap: '8px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{criativo.nome}</div>
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>
              {criativo.campanhas} campanha{criativo.campanhas !== 1 ? 's' : ''} · {criativo.diasAtivo} dias ativo
            </div>
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text2)', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body 2 colunas */}
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '16px', padding: '14px 16px', alignItems: 'start' }}>
          {/* Coluna esquerda */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{
              width: '240px',
              aspectRatio: '9/16',
              minHeight: '320px',
              maxHeight: '500px',
              background: criativo.corFundo,
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }} className="cc-thumb">
              {criativo.thumbnailUrl
                ? <img src={proxyImagem(criativo.thumbnailUrl)} alt={criativo.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" loading="lazy" />
                : <IconeTipo tipo={criativo.tipo} />
              }
            </div>
            <button
              onClick={() => { onFechar(); onAbrirPreview(criativo.id) }}
              style={{
                fontSize: '11px',
                padding: '6px 10px',
                background: 'transparent',
                color: 'var(--foreground)',
                border: '0.5px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Ver peça →
            </button>
          </div>

          {/* Coluna direita */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0, overflowY: 'auto', maxHeight: '500px', paddingRight: '4px' }}>
            {/* Grid 6 KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              {kpis.map(k => (
                <div key={k.label} style={{ background: 'var(--bg2)', borderRadius: '5px', padding: '7px 8px', border: '0.5px solid var(--border)' }}>
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)', marginBottom: '2px' }}>
                    {k.label}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: k.cor }}>{k.valor}</div>
                </div>
              ))}
            </div>

            {/* Funil vídeo */}
            {criativo.tipo === 'VIDEO' && criativo.hookRate !== null && (
              <div>
                <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)', marginBottom: '6px' }}>
                  Funil de vídeo
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Hook Rate', valor: `${criativo.hookRate}%`, cor: corHook(criativo.hookRate) },
                    { label: 'Hold Rate', valor: criativo.holdRate !== null ? `${criativo.holdRate}%` : '—', cor: criativo.holdRate !== null ? corHold(criativo.holdRate) : 'var(--text2)' },
                    { label: 'CTR', valor: `${criativo.ctr.toFixed(1)}%`, cor: 'var(--text)' },
                    { label: 'Leads', valor: criativo.leads.toLocaleString('pt-BR'), cor: 'var(--ws-gold)' },
                  ].map((et, i, arr) => (
                    <div key={et.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div>
                        <div style={{ fontSize: '8px', color: 'var(--text2)', textTransform: 'uppercase' }}>{et.label}</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: et.cor }}>{et.valor}</div>
                      </div>
                      {i < arr.length - 1 && (
                        <span style={{ color: 'var(--text2)', fontSize: '12px' }}>→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Análise IA */}
            <div style={{
              background: 'var(--bg2)',
              border: '0.5px solid var(--border)',
              borderRadius: '6px',
              padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                <Clock size={10} style={{ color: 'var(--foreground)' }} />
                <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--foreground)', fontWeight: 600 }}>
                  Análise IA
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
                {analise}
              </p>
            </div>

            {/* Campanhas */}
            {criativo.campanhasDetalhe.length > 0 && (
              <div>
                <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)', marginBottom: '6px' }}>
                  Campanhas que usam este criativo
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {criativo.campanhasDetalhe.map(camp => (
                    <div key={camp.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 8px',
                      background: 'var(--bg2)',
                      border: '0.5px solid var(--border)',
                      borderRadius: '5px',
                      gap: '8px',
                    }}>
                      <div style={{ fontSize: '10px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {camp.nome}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
                        <span style={{ fontSize: '10px', color: 'var(--ws-gold)', fontWeight: 600 }}>
                          {camp.leads > 0 ? camp.leads.toLocaleString('pt-BR') : '—'} leads
                        </span>
                        {camp.leads > 0 && (
                          <span style={{ fontSize: '10px', color: corCpl(camp.cpl) }}>
                            R${camp.cpl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
