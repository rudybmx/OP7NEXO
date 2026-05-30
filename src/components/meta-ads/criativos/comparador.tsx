'use client'

import { X } from 'lucide-react'
import { Criativo } from '@/types/meta-ads-criativos'

interface Props {
  criativos: Criativo[]
  onFechar: () => void
}

function corScore(s: number) {
  if (s >= 75) return '#3b6d11'
  if (s >= 40) return 'var(--ws-gold)'
  return '#a32d2d'
}

function corCpl(v: number) {
  if (v <= 1) return '#3b6d11'
  if (v <= 5) return '#854f0b'
  return '#a32d2d'
}

function corFreq(v: number) {
  if (v <= 2) return '#3b6d11'
  if (v <= 3.5) return 'var(--ws-gold)'
  return '#a32d2d'
}

function Barra({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  const pct = max > 0 ? Math.min((valor / max) * 100, 100) : 0
  return (
    <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 3 }} />
    </div>
  )
}

export function Comparador({ criativos, onFechar }: Props) {
  const n = criativos.length
  const maxScore = 100
  const maxLeads = Math.max(...criativos.map(c => c.leads), 1)
  const maxCpl = Math.max(...criativos.map(c => c.cpl), 1)
  const maxCtr = Math.max(...criativos.map(c => c.ctr), 1)
  const maxFreq = Math.max(...criativos.map(c => c.frequencia), 1)
  const maxHook = Math.max(...criativos.map(c => c.hookRate ?? 0), 1)
  const maxHold = Math.max(...criativos.map(c => c.holdRate ?? 0), 1)

  const linhas: { label: string; render: (c: Criativo) => { texto: string; cor: string; barraMax: number; barraVal: number } }[] = [
    {
      label: 'Score IA',
      render: c => ({ texto: `${c.score}/100`, cor: corScore(c.score), barraMax: maxScore, barraVal: c.score }),
    },
    {
      label: 'CPL (R$)',
      render: c => ({ texto: `R$${c.cpl.toFixed(2).replace('.', ',')}`, cor: corCpl(c.cpl), barraMax: maxCpl, barraVal: c.cpl }),
    },
    {
      label: 'CTR (%)',
      render: c => ({ texto: `${c.ctr.toFixed(1)}%`, cor: 'var(--text)', barraMax: maxCtr, barraVal: c.ctr }),
    },
    {
      label: 'Leads',
      render: c => ({ texto: c.leads.toLocaleString('pt-BR'), cor: 'var(--ws-gold)', barraMax: maxLeads, barraVal: c.leads }),
    },
    {
      label: 'Freq.',
      render: c => ({ texto: c.frequencia.toFixed(1), cor: corFreq(c.frequencia), barraMax: maxFreq, barraVal: c.frequencia }),
    },
    {
      label: 'Taxa de abertura',
      render: c => c.hookRate !== null
        ? { texto: `${c.hookRate}%`, cor: c.hookRate >= 25 ? '#3b6d11' : '#a32d2d', barraMax: maxHook, barraVal: c.hookRate }
        : { texto: 'Métrica indisponível', cor: 'var(--text2)', barraMax: 1, barraVal: 0 },
    },
    {
      label: 'Taxa de retenção',
      render: c => c.holdRate !== null
        ? { texto: `${c.holdRate}%`, cor: c.holdRate >= 40 ? '#3b6d11' : '#854f0b', barraMax: maxHold, barraVal: c.holdRate }
        : { texto: 'Métrica indisponível', cor: 'var(--text2)', barraMax: 1, barraVal: 0 },
    },
  ]

  return (
    <div style={{
      background: 'var(--card)',
      border: '0.5px solid var(--border)',
      borderRadius: '8px',
      padding: '14px 16px',
      marginBottom: '20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>Comparação de criativos</span>
        <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${n}, 1fr)`, gap: '8px' }}>
        {/* Header */}
        <div />
        {criativos.map(c => (
          <div key={c.id} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.nome}
          </div>
        ))}

        {/* Linhas */}
        {linhas.map(linha => (
          <>
            <div key={`lbl-${linha.label}`} style={{ fontSize: '10px', color: 'var(--text2)', display: 'flex', alignItems: 'center' }}>
              {linha.label}
            </div>
            {criativos.map(c => {
              const cell = linha.render(c)
              return (
                <div key={`${linha.label}-${c.id}`}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: cell.cor, marginBottom: '3px' }}>
                    {cell.texto}
                  </div>
                  {cell.texto !== 'Métrica indisponível' && (
                    <Barra valor={cell.barraVal} max={cell.barraMax} cor={cell.cor} />
                  )}
                </div>
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}
