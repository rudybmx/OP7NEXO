'use client'

import React, { useMemo, useState } from 'react'
import { Loader2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { WSTable, WSTableShell } from '@/components/ui/ws-table'
import { useAiUsageSummary, useAiPricing, type UsageGroupBy, type AiPricing } from '@/hooks/use-ai-usage'

const TH: React.CSSProperties = {
  padding: '8px 14px', fontSize: 10, fontWeight: 600, color: 'var(--ws-text-3)',
  textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em',
  whiteSpace: 'nowrap', background: 'rgba(62,91,255,0.04)', borderBottom: '1px solid var(--ws-divider)',
}
const TD: React.CSSProperties = { padding: '9px 14px', fontSize: 13, color: 'var(--ws-text-1)' }
const TDr: React.CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

function diasAtras(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function hoje(): string { return new Date().toISOString().slice(0, 10) }
const fmtUSD = (v: number | null) => v == null ? '—' : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtBRL = (v: number | null) => v == null ? '—' : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtN = (v: number) => v.toLocaleString('pt-BR')

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--card)', border: '0.5px solid rgba(15,39,68,0.10)', borderRadius: 6, padding: '12px 14px', minWidth: 150 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ws-text-3)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--ws-text-1)', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

const GROUPS: [UsageGroupBy, string][] = [['feature', 'Por feature'], ['model', 'Por modelo'], ['workspace', 'Por workspace']]
const PERIODOS: [number, string][] = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']]

export function ConsumoIaPainel() {
  const [periodo, setPeriodo] = useState(30)
  const [groupBy, setGroupBy] = useState<UsageGroupBy>('feature')
  const inicio = useMemo(() => diasAtras(periodo), [periodo])
  const { summary, isLoading } = useAiUsageSummary(inicio, hoje(), groupBy)
  const [precosAbertos, setPrecosAbertos] = useState(false)

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERIODOS.map(([d, label]) => (
            <button key={d} onClick={() => setPeriodo(d)} style={chip(periodo === d)}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {GROUPS.map(([g, label]) => (
            <button key={g} onClick={() => setGroupBy(g)} style={chip(groupBy === g)}>{label}</button>
          ))}
        </div>
      </div>

      {isLoading || !summary ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <Kpi label="Chamadas" value={fmtN(summary.totais.chamadas)} />
            <Kpi label="Tokens" value={fmtN(summary.totais.tokens)} />
            <Kpi label="Custo (USD)" value={fmtUSD(summary.totais.custo_usd)} />
            <Kpi label="Custo (BRL)" value={fmtBRL(summary.totais.custo_brl)}
              sub={summary.fx ? `câmbio ${summary.fx.usd_brl.toFixed(2)} (${summary.fx.dia})` : 'câmbio indisponível'} />
          </div>

          {summary.totais.sem_preco > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 16, borderRadius: 8,
              background: 'rgba(201,168,76,0.12)', color: '#854f0b', fontSize: 12 }}>
              <AlertTriangle size={14} />
              {summary.totais.sem_preco} chamada(s) sem preço cadastrado — custo não contabilizado. Defina o preço do modelo abaixo.
            </div>
          )}

          {/* Quebra */}
          <WSTableShell>
            <WSTable minWidth={620}>
              <thead>
                <tr>
                  <th style={TH}>{groupBy === 'feature' ? 'Feature' : groupBy === 'model' ? 'Modelo' : 'Workspace'}</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Chamadas</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Tokens</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Custo USD</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Custo BRL</th>
                </tr>
              </thead>
              <tbody>
                {summary.itens.length === 0 ? (
                  <tr><td style={{ ...TD, textAlign: 'center', color: 'var(--ws-text-3)' }} colSpan={5}>Sem consumo no período</td></tr>
                ) : summary.itens.map((i, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--ws-divider)' }}>
                    <td style={{ ...TD, fontWeight: 500 }}>{i.chave}</td>
                    <td style={TDr}>{fmtN(i.chamadas)}</td>
                    <td style={TDr}>{fmtN(i.tokens)}</td>
                    <td style={TDr}>{fmtUSD(i.custo_usd)}</td>
                    <td style={TDr}>{fmtBRL(i.custo_brl)}</td>
                  </tr>
                ))}
              </tbody>
            </WSTable>
          </WSTableShell>

          {/* Editor de preços */}
          <button onClick={() => setPrecosAbertos(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 20, background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--ws-text-2)', fontSize: 13, fontWeight: 600 }}>
            {precosAbertos ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Tabela de preços (USD)
          </button>
          {precosAbertos && <EditorPrecos />}
        </>
      )}
    </div>
  )
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: active ? '0.5px solid var(--ws-blue)' : '1px solid var(--ws-glass-border)',
    background: active ? 'rgba(62,91,255,0.12)' : 'var(--ws-glass-bg)',
    color: active ? 'var(--ws-blue)' : 'var(--ws-text-2)',
  }
}

function EditorPrecos() {
  const { pricing, isLoading, atualizar } = useAiPricing()
  return (
    <div style={{ marginTop: 12 }}>
      {isLoading ? (
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pricing.map(p => <LinhaPreco key={p.model} p={p} onSalvar={atualizar} />)}
          <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 4 }}>
            Texto: preço por 1M tokens (input/output). Imagem: preço por imagem por qualidade. Alterar afeta só chamadas futuras.
          </p>
        </div>
      )}
    </div>
  )
}

function LinhaPreco({ p, onSalvar }: { p: AiPricing; onSalvar: (m: string, payload: any) => Promise<any> }) {
  const [inp, setInp] = useState(p.input_usd_1m?.toString() ?? '')
  const [out, setOut] = useState(p.output_usd_1m?.toString() ?? '')
  const [img, setImg] = useState(JSON.stringify(p.image_prices_json ?? {}))
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    try {
      const payload: any = {}
      if (p.kind === 'image') {
        try { payload.image_prices_json = JSON.parse(img) } catch { toast.error('JSON de preços inválido'); setSalvando(false); return }
      } else {
        payload.input_usd_1m = inp.trim() === '' ? null : Number(inp)
        payload.output_usd_1m = out.trim() === '' ? null : Number(out)
      }
      await onSalvar(p.model, payload)
      toast.success(`Preço de ${p.model} salvo`)
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar preço')
    } finally { setSalvando(false) }
  }

  const inputStyle: React.CSSProperties = {
    width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--ws-glass-border)',
    background: 'var(--ws-glass-bg)', color: 'var(--ws-text-1)', fontSize: 12,
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '8px 12px', border: '0.5px solid rgba(15,39,68,0.10)', borderRadius: 8 }}>
      <code style={{ fontSize: 12, fontFamily: 'monospace', minWidth: 110 }}>{p.model}</code>
      <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{p.kind}</span>
      {p.kind === 'image' ? (
        <input style={{ ...inputStyle, width: 280 }} value={img} onChange={e => setImg(e.target.value)} placeholder='{"low":0.011,...}' />
      ) : (
        <>
          <label style={{ fontSize: 11, color: 'var(--ws-text-2)' }}>in/1M <input style={inputStyle} value={inp} onChange={e => setInp(e.target.value)} /></label>
          <label style={{ fontSize: 11, color: 'var(--ws-text-2)' }}>out/1M <input style={inputStyle} value={out} onChange={e => setOut(e.target.value)} /></label>
        </>
      )}
      <button onClick={salvar} disabled={salvando} style={{
        marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
        background: 'var(--ws-blue)', color: 'white', fontSize: 12, fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>{salvando && <Loader2 size={13} className="animate-spin" />} Salvar</button>
    </div>
  )
}
