'use client'

import React, { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAgenteDashboard } from '@/hooks/use-agente-dashboard'

const PERIODOS: [number, string][] = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']]

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md" style={{ background: 'var(--card)', border: '0.5px solid var(--ws-glass-border)', padding: '12px 14px' }}>
      <div className="ds-kpi-label">{label}</div>
      <div className="ds-kpi-value">{value}</div>
      {hint && <div className="text-xs" style={{ color: 'var(--ws-text-2)' }}>{hint}</div>}
    </div>
  )
}

export function UsoDashboard({ workspaceId }: { workspaceId: string | null }) {
  const { dados, carregando, erro, carregar } = useAgenteDashboard(workspaceId)
  const [dias, setDias] = useState(30)

  useEffect(() => {
    carregar({ dias })
    const id = setInterval(() => carregar({ dias }), 30000) // polling 30s
    return () => clearInterval(id)
  }, [carregar, dias])

  if (!workspaceId) return <p className="text-sm" style={{ color: 'var(--ws-text-2)' }}>Selecione um workspace.</p>

  const t = dados?.totais
  const fmtUsd = (n: number) => `$${n.toFixed(4)}`
  const fmtInt = (n: number) => n.toLocaleString('pt-BR')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {PERIODOS.map(([d, label]) => (
          <button
            key={d}
            onClick={() => setDias(d)}
            className="px-3 py-1 text-xs font-medium rounded-md border"
            style={{
              borderColor: dias === d ? '#c9a84c' : 'var(--ws-glass-border)',
              background: dias === d ? 'rgba(201,168,76,0.12)' : 'transparent',
              color: dias === d ? '#c9a84c' : 'var(--ws-text-2)',
            }}
          >
            {label}
          </button>
        ))}
        {carregando && <span className="text-xs" style={{ color: 'var(--ws-text-2)' }}>atualizando…</span>}
      </div>

      {erro && <p className="text-sm" style={{ color: 'var(--ws-coral)' }}>{erro}</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card label="Tokens (total)" value={fmtInt(t?.tokens_total ?? 0)} hint={`${fmtInt(t?.tokens_input ?? 0)} in · ${fmtInt(t?.tokens_output ?? 0)} out`} />
        <Card label="Custo estimado" value={fmtUsd(t?.custo_usd ?? 0)} hint="via tabela de preço" />
        <Card label="Chamadas" value={fmtInt(t?.chamadas ?? 0)} />
        <Card label="Conversas atendidas" value={fmtInt(t?.conversas ?? 0)} />
        <Card label="Taxa de handoff" value={`${Math.round((t?.taxa_handoff ?? 0) * 100)}%`} hint={`${fmtInt(t?.handoffs ?? 0)} escaladas`} />
        <Card label="Score médio" value={t?.score_medio != null ? t.score_medio.toFixed(2) : '—'} />
      </div>

      <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '0.5px solid var(--ws-glass-border)' }}>
        <div className="ds-section-title mb-2">Tokens por dia</div>
        {dados && dados.serie.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dados.serie} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(15,39,68,0.06)" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 11 }} tickFormatter={(d) => String(d).slice(5)} />
              <YAxis tick={{ fontSize: 11 }} width={48} />
              <Tooltip contentStyle={{ background: '#0f2744', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }} />
              <Line type="monotone" dataKey="tokens" stroke="#c9a84c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs" style={{ color: 'var(--ws-text-2)' }}>Sem consumo no período.</p>
        )}
      </div>
    </div>
  )
}
