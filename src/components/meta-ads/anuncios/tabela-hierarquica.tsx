'use client'

import { useState, Fragment } from 'react'
import { ChevronRight, ChevronDown, AlertTriangle, ExternalLink } from 'lucide-react'
import type { Anuncio, StatusAnuncio, TipoAnuncio } from '@/types/meta-ads-anuncios'
import { formatarMoeda, formatarNumeroCompacto } from '@/lib/formatar'
import { proxyImagem } from '@/lib/imagem-proxy'

interface Props {
  anuncios: Anuncio[]
  agrupar: boolean
  onAbrirAnuncio: (id: string) => void
}

type SortCol = 'score' | 'leads' | 'cpl' | 'ctr' | 'frequencia' | 'cpm' | 'impressoes'

const STATUS_CONFIG: Record<StatusAnuncio, { label: string; cor: string; bg: string; border: string }> = {
  ACTIVE:   { label: 'Ativo',       cor: '#0fa856', bg: 'rgba(15,168,86,0.10)',  border: 'rgba(15,168,86,0.25)' },
  PAUSED:   { label: 'Pausado',     cor: '#8892b0', bg: 'rgba(136,146,176,0.10)',border: 'rgba(136,146,176,0.20)' },
  LEARNING: { label: 'Aprendendo',  cor: '#EF9F27', bg: 'rgba(239,159,39,0.10)', border: 'rgba(239,159,39,0.25)' },
  ARCHIVED: { label: 'Arquivado',   cor: '#8892b0', bg: 'rgba(136,146,176,0.10)',border: 'rgba(136,146,176,0.20)' },
}

const TIPO_LABEL: Record<TipoAnuncio, string> = {
  IMAGE: 'Imagem', VIDEO: 'Vídeo', CAROUSEL: 'Carrossel',
}

function ScoreChip({ score }: { score: number }) {
  const cor  = score >= 75 ? '#0fa856' : score >= 40 ? '#EF9F27' : '#FF5C8D'
  const bg   = score >= 75 ? 'rgba(15,168,86,0.10)' : score >= 40 ? 'rgba(239,159,39,0.10)' : 'rgba(255,92,141,0.10)'
  const bord = score >= 75 ? 'rgba(15,168,86,0.25)' : score >= 40 ? 'rgba(239,159,39,0.25)' : 'rgba(255,92,141,0.25)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999, background: bg, border: `1px solid ${bord}`, color: cor }}>
      {score}
    </span>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: 10, textTransform: 'uppercase',
  letterSpacing: '0.05em', color: 'var(--ws-text-3)', fontWeight: 500,
  whiteSpace: 'nowrap', background: 'rgba(62,91,255,0.04)',
}

const thRight: React.CSSProperties = { ...thStyle, textAlign: 'right', cursor: 'pointer' }

export function TabelaHierarquica({ anuncios, agrupar, onAbrirAnuncio }: Props) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [sortCol, setSortCol] = useState<SortCol>('score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleExpand(conjuntoNome: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(conjuntoNome)) next.delete(conjuntoNome)
      else next.add(conjuntoNome)
      return next
    })
  }

  function handleSort(col: SortCol) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function ind(col: SortCol) {
    return sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
  }

  // Agrupar por campanhaNome (Usado como nível de conjunto)
  const conjuntos = Array.from(new Set(anuncios.map(a => a.campanhaNome)))

  const renderFilaAnuncio = (a: Anuncio, isFlat: boolean) => {
    const st = STATUS_CONFIG[a.status]
    const fadiga = a.frequencia >= 3.5
    return (
      <tr
        key={a.id}
        onClick={() => onAbrirAnuncio(a.id)}
        style={{
          background: 'transparent',
          borderBottom: '1px solid var(--ws-divider)',
          opacity: a.status === 'PAUSED' ? 0.65 : 1,
          cursor: 'pointer',
          transition: 'background 100ms',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(62,91,255,0.03)'}
        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
      >
        {!isFlat && <td style={{ width: 32 }} />}
        <td style={{ padding: '6px 4px 6px 10px', width: 36 }}>
          {a.thumbnailUrl ? (
            <img
              src={proxyImagem(a.thumbnailUrl)}
              alt=""
              style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', display: 'block', background: '#f0f0f0' }}
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: 4, background: 'rgba(0,0,0,0.06)' }} />
          )}
        </td>
        <td style={{ padding: isFlat ? '9px 10px' : '9px 10px 9px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 400, color: 'var(--ws-text-1)' }}>
            <span style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: '1.35',
              maxWidth: 340,
            }}>
              {a.nome}
            </span>
            {a.permalinkUrl && (
              <a
                href={a.permalinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--ws-text-3)', opacity: 0.6 }}
                title="Ver anúncio"
              >
                <ExternalLink size={11} />
              </a>
            )}
          </div>
          {isFlat && (
            <div style={{ fontSize: 10, color: 'var(--ws-text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
              {a.campanhaNome}
            </div>
          )}
          {fadiga && (
            <div style={{ fontSize: 9, color: '#c2004f', fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
              <AlertTriangle size={9} /> Frequência alta — considere pausar ou renovar criativo
            </div>
          )}
        </td>
        <td style={{ padding: '9px 10px' }}>
          <span style={{ fontSize: 10, color: 'var(--ws-text-3)', background: 'rgba(14,20,42,0.06)', padding: '2px 6px', borderRadius: 9999 }}>
            {TIPO_LABEL[a.tipo]}
          </span>
        </td>
        <td style={{ padding: '9px 10px' }}>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 9999, background: st.bg, border: `1px solid ${st.border}`, color: st.cor }}>
            {st.label}
          </span>
        </td>
        <td style={{ padding: '9px 10px', textAlign: 'right' }}><ScoreChip score={a.score} /></td>
        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 500, color: 'var(--ws-gold, #EF9F27)' }}>{a.leads.toLocaleString('pt-BR')}</td>
        <td style={{ padding: '9px 10px', textAlign: 'right', color: a.cpl <= 1 ? '#0fa856' : a.cpl > 5 ? '#FF5C8D' : 'var(--ws-text-1)' }}>{formatarMoeda(a.cpl)}</td>
        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{a.ctr.toFixed(1)}%</td>
        <td style={{ padding: '9px 10px', textAlign: 'right', color: fadiga ? '#FF5C8D' : 'var(--ws-text-1)', fontWeight: fadiga ? 600 : 400 }}>{a.frequencia.toFixed(1)}</td>
        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{formatarMoeda(a.cpm)}</td>
        <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--ws-text-3)' }}>{formatarNumeroCompacto(a.impressoes)}</td>
      </tr>
    )
  }

  const anunciosOrdenadosFlat = [...anuncios].sort((a, b) => {
    const mult = sortDir === 'asc' ? 1 : -1
    const valA = a[sortCol] ?? 0
    const valB = b[sortCol] ?? 0
    return (valA - valB) * mult
  })

  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      overflow: 'hidden',
      overflowX: 'auto',
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)', zIndex: 1 }} />

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--ws-divider)' }}>
            {agrupar && <th style={{ ...thStyle, textAlign: 'left', width: 32 }} />}
            <th style={{ ...thStyle, width: 36 }} />
            <th style={{ ...thStyle, textAlign: 'left', minWidth: 260 }}>Anúncio / {agrupar ? 'Campanha' : 'Config'}</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>Tipo</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>Status</th>
            <th style={thRight} onClick={() => handleSort('score')}>Score IA{ind('score')}</th>
            <th style={thRight} onClick={() => handleSort('leads')}>Leads{ind('leads')}</th>
            <th style={thRight} onClick={() => handleSort('cpl')}>CPL{ind('cpl')}</th>
            <th style={thRight} onClick={() => handleSort('ctr')}>CTR{ind('ctr')}</th>
            <th style={thRight} onClick={() => handleSort('frequencia')}>Freq.{ind('frequencia')}</th>
            <th style={thRight} onClick={() => handleSort('cpm')}>CPM{ind('cpm')}</th>
            <th style={thRight} onClick={() => handleSort('impressoes')}>Impressões{ind('impressoes')}</th>
          </tr>
        </thead>
        <tbody>
          {agrupar ? (
            conjuntos.map(conjuntoNome => {
              const anunciosDoConjunto = anuncios
                .filter(a => a.campanhaNome === conjuntoNome)
                .sort((a, b) => {
                  const mult = sortDir === 'asc' ? 1 : -1
                  const valA = a[sortCol] ?? 0
                  const valB = b[sortCol] ?? 0
                  return (valA - valB) * mult
                })

              if (anunciosDoConjunto.length === 0) return null

              const totalLeads     = anunciosDoConjunto.reduce((s, a) => s + a.leads, 0)
              const cplMedio       = totalLeads > 0 ? anunciosDoConjunto.reduce((s, a) => s + (a.investimento ?? (a.cpl * a.leads)), 0) / totalLeads : 0
              const freqMedia      = anunciosDoConjunto.reduce((s, a) => s + a.frequencia, 0) / anunciosDoConjunto.length
              const ctrMedio       = anunciosDoConjunto.reduce((s, a) => s + a.ctr, 0) / anunciosDoConjunto.length
              const scoreMedio     = anunciosDoConjunto.reduce((s, a) => s + a.score, 0) / anunciosDoConjunto.length
              const expandido      = expandidos.has(conjuntoNome)
              const temFadiga      = freqMedia >= 3.5

              return (
                <Fragment key={conjuntoNome}>
                  {/* Linha do grupo (Campanha) */}
                  <tr
                    onClick={() => toggleExpand(conjuntoNome)}
                    style={{
                      background: expandido ? 'rgba(62,91,255,0.03)' : 'rgba(62,91,255,0.015)',
                      borderBottom: '1px solid var(--ws-divider)',
                      cursor: 'pointer',
                      transition: 'background 150ms',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(62,91,255,0.05)'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = expandido ? 'rgba(62,91,255,0.03)' : 'rgba(62,91,255,0.015)'}
                  >
                    <td style={{ padding: '10px 8px', width: 32 }}>
                      {expandido
                        ? <ChevronDown size={14} style={{ color: 'var(--ws-text-3)' }} />
                        : <ChevronRight size={14} style={{ color: 'var(--ws-text-3)' }} />}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                          {conjuntoNome.length > 50 ? conjuntoNome.slice(0, 50) + '...' : conjuntoNome}
                        </span>
                        {temFadiga && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 9999, background: 'rgba(255,92,141,0.10)', border: '1px solid rgba(255,92,141,0.25)', color: '#c2004f' }}>
                            <AlertTriangle size={9} /> Fadiga
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--ws-text-3)', marginTop: 2 }}>
                        {anunciosDoConjunto.length} anúncio{anunciosDoConjunto.length !== 1 ? 's' : ''}
                      </div>
                    </td>
                    <td style={{ padding: '10px', color: 'var(--ws-text-3)', fontSize: 11 }} />
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>
                        {anunciosDoConjunto.filter(a => a.status === 'ACTIVE').length} ativos
                      </span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}><ScoreChip score={Math.round(scoreMedio)} /></td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: 'var(--ws-gold, #EF9F27)' }}>{totalLeads.toLocaleString('pt-BR')}</td>
                    <td style={{ padding: '10px', textAlign: 'right', color: cplMedio <= 1 ? '#0fa856' : cplMedio > 5 ? '#FF5C8D' : 'var(--ws-text-1)' }}>{formatarMoeda(cplMedio)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', color: 'var(--ws-text-2)' }}>{ctrMedio.toFixed(1)}%</td>
                    <td style={{ padding: '10px', textAlign: 'right', color: temFadiga ? '#FF5C8D' : 'var(--ws-text-2)', fontWeight: temFadiga ? 600 : 400 }}>{freqMedia.toFixed(1)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', color: 'var(--ws-text-3)' }}>—</td>
                    <td style={{ padding: '10px', textAlign: 'right', color: 'var(--ws-text-3)' }}>—</td>
                  </tr>

                  {/* Linhas dos anúncios do conjunto */}
                  {expandido && anunciosDoConjunto.map(a => renderFilaAnuncio(a, false))}
                </Fragment>
              )
            })
          ) : (
            anunciosOrdenadosFlat.map(a => renderFilaAnuncio(a, true))
          )}
        </tbody>
      </table>
    </div>
  )
}
