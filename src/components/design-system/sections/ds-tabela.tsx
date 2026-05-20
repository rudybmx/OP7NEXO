'use client'
import { useState } from 'react'
import { ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { WSTable, WSTableActions, WSTableShell } from '@/components/ui/ws-table'

const CAMPANHAS = [
  { nome: 'LAL 3% - Lookalike Leads', status: 'Ativo', investimento: 8420, leads: 312, cpl: 26.99, roas: 4.2, grupos: [
    { nome: 'Grupo 1 — 18-34 | Mulheres', investimento: 4200, leads: 180, cpl: 23.33 },
    { nome: 'Grupo 2 — 25-45 | Geral',    investimento: 4220, leads: 132, cpl: 31.97 },
  ]},
  { nome: 'Interesse — Imóveis Premium', status: 'Aprendendo', investimento: 3180, leads: 97, cpl: 32.78, roas: 2.8, grupos: [
    { nome: 'Grupo 1 — Comprador', investimento: 3180, leads: 97, cpl: 32.78 },
  ]},
  { nome: 'Retargeting — Visitantes 30d', status: 'Pausado', investimento: 1240, leads: 44, cpl: 28.18, roas: 5.1, grupos: [] },
  { nome: 'Broad — Meta Advantage+', status: 'Ativo', investimento: 12600, leads: 521, cpl: 24.18, roas: 6.3, grupos: [
    { nome: 'Grupo A — Automático', investimento: 7800, leads: 340, cpl: 22.94 },
    { nome: 'Grupo B — Manual',     investimento: 4800, leads: 181, cpl: 26.52 },
  ]},
]

function statusBadge(s: string) {
  const map: Record<string, { bg: string; border: string; color: string }> = {
    Ativo:       { bg: 'rgba(15,168,86,0.12)',  border: 'rgba(15,168,86,0.25)',  color: '#007a40' },
    Pausado:     { bg: 'rgba(255,92,141,0.12)', border: 'rgba(255,92,141,0.25)', color: '#c2004f' },
    Aprendendo:  { bg: 'rgba(62,91,255,0.12)',  border: 'rgba(62,91,255,0.25)',  color: '#2340c4' },
  }
  const st = map[s] ?? map.Ativo
  return (
    <span style={{
      display: 'inline-flex', background: st.bg, border: `1px solid ${st.border}`,
      borderRadius: 9999, padding: '2px 8px', fontSize: 10, fontWeight: 600, color: st.color,
    }}>{s}</span>
  )
}

function cplColor(v: number) {
  if (v <= 25) return '#007a40'
  if (v <= 35) return 'var(--ws-text-1)'
  return '#c2004f'
}

export function DSTabela() {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)

  function toggleRow(i: number) {
    setExpanded(p => ({ ...p, [i]: !p[i] }))
  }

  function toggleSort(col: string) {
    setSort(p => p?.col === col ? { col, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
  }

  function SortIcon({ col }: { col: string }) {
    if (sort?.col !== col) return <ArrowUpDown size={10} style={{ opacity: 0.3 }} />
    return sort.dir === 'asc' ? <ArrowUp size={10} style={{ color: 'var(--ws-blue)' }} /> : <ArrowDown size={10} style={{ color: 'var(--ws-blue)' }} />
  }

  const th: React.CSSProperties = {
    padding: '8px 14px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: 'var(--ws-text-3)', textAlign: 'left',
    background: 'rgba(62,91,255,0.04)',
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--ws-divider)',
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ws-text-1)', marginBottom: 6 }}>Tabelas</h2>
        <p style={{ fontSize: 14, color: 'var(--ws-text-2)', lineHeight: 1.6 }}>
          Duas variações: tabela simples e tabela cascata (L0 → L1).
          Container glass card com overflow-x auto.
        </p>
      </div>

      {/* Tabela simples */}
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ws-text-3)', marginBottom: 10 }}>Tabela Simples</div>
      <WSTableShell style={{ marginBottom: 32 }}>
        <div style={{ overflowX: 'auto' }}>
          <WSTable minWidth={600}>
            <thead>
              <tr>
                {[['nome','Campanha'],['status','Status'],['investimento','Investimento'],['leads','Leads'],['cpl','CPL']].map(([col, label]) => (
                  <th key={col} style={th} onClick={() => toggleSort(col)}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {label} <SortIcon col={col} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAMPANHAS.map((c, i) => (
                <tr key={i}
                  style={{
                    opacity: c.status === 'Pausado' ? 0.65 : 1,
                    borderBottom: '1px solid var(--ws-divider)',
                    transition: 'var(--ws-transition)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(62,91,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--ws-text-1)', fontWeight: 500 }}>{c.nome}</td>
                  <td style={{ padding: '9px 14px' }}>{statusBadge(c.status)}</td>
                  <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--ws-text-1)' }}>R$ {c.investimento.toLocaleString('pt-BR')}</td>
                  <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, color: 'var(--ws-blue)' }}>{c.leads}</td>
                  <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, color: cplColor(c.cpl) }}>R$ {c.cpl.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </WSTable>
        </div>
      </WSTableShell>

      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ws-text-3)', marginBottom: 10 }}>Ações em Linha (Padrão Admin)</div>
      <WSTableShell style={{ marginBottom: 32 }}>
        <WSTable minWidth={720}>
          <thead>
            <tr>
              <th style={th}>Cliente</th>
              <th style={th}>Status</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--ws-divider)' }}>
              <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ws-text-1)' }}>Clínica Aurora</td>
              <td style={{ padding: '10px 14px' }}>{statusBadge('Ativo')}</td>
              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                <WSTableActions>
                  <button style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--ws-text-2)' }}>Editar</button>
                  <button style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11, border: '1px solid rgba(62,91,255,0.20)', background: 'rgba(62,91,255,0.10)', color: 'var(--ws-blue)' }}>Conta Ads</button>
                  <button style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11, border: '1px solid rgba(122,90,248,0.20)', background: 'rgba(122,90,248,0.10)', color: 'var(--ws-purple)' }}>Usuário</button>
                </WSTableActions>
              </td>
            </tr>
          </tbody>
        </WSTable>
      </WSTableShell>

      {/* Tabela cascata */}
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ws-text-3)', marginBottom: 10 }}>Tabela Cascata (L0 → L1)</div>
      <div style={{
        background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)', backdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)', overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr>
                <th style={th}>Campanha / Grupo</th>
                <th style={th}>Status</th>
                <th style={th}>Investimento</th>
                <th style={th}>Leads</th>
                <th style={th}>CPL</th>
              </tr>
            </thead>
            <tbody>
              {CAMPANHAS.map((c, i) => (
                <>
                  {/* L0 */}
                  <tr key={`l0-${i}`}
                    style={{ borderBottom: '1px solid var(--ws-divider)', cursor: c.grupos.length > 0 ? 'pointer' : 'default' }}
                    onClick={() => c.grupos.length > 0 && toggleRow(i)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(62,91,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {c.grupos.length > 0 && (
                          <ChevronRight size={13} style={{
                            color: 'var(--ws-text-3)', flexShrink: 0,
                            transform: expanded[i] ? 'rotate(90deg)' : 'none',
                            transition: 'transform 150ms',
                          }} />
                        )}
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)' }}>{c.nome}</span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 14px' }}>{statusBadge(c.status)}</td>
                    <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--ws-text-1)' }}>R$ {c.investimento.toLocaleString('pt-BR')}</td>
                    <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, color: 'var(--ws-blue)' }}>{c.leads}</td>
                    <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, color: cplColor(c.cpl) }}>R$ {c.cpl.toFixed(2)}</td>
                  </tr>
                  {/* L1 */}
                  {expanded[i] && c.grupos.map((g, j) => (
                    <tr key={`l1-${i}-${j}`}
                      style={{
                        background: 'rgba(14,20,42,0.02)',
                        borderBottom: '1px solid var(--ws-divider)',
                        opacity: 0.9,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(62,91,255,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(14,20,42,0.02)')}
                    >
                      <td style={{ padding: '8px 14px 8px 40px', fontSize: 12, color: 'var(--ws-text-2)' }}>{g.nome}</td>
                      <td style={{ padding: '8px 14px' }}></td>
                      <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--ws-text-2)' }}>R$ {g.investimento.toLocaleString('pt-BR')}</td>
                      <td style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: 'var(--ws-blue)' }}>{g.leads}</td>
                      <td style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, color: cplColor(g.cpl) }}>R$ {g.cpl.toFixed(2)}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
