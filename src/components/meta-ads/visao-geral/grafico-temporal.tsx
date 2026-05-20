'use client'

import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts'
import type { DadosDiarios } from '@/types/meta-ads'
import { formatarMoeda, formatarNumero } from '@/lib/formatar'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { ChartSurface } from '@/components/meta-ads/chart-surface'

interface GraficoTemporalProps {
  dados: DadosDiarios[]
}

const TEMPORAL_DIAGRAM = `
  <div style="font-size:10px;color:#666;display:flex;flex-direction:column;gap:4px">
    <div style="display:flex;align-items:center;gap:6px">
      <div style="width:28px;height:6px;background:#3E5BFF;border-radius:2px"></div>
      <span>Investimento (área)</span>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <div style="width:28px;height:2px;background:#0fa856"></div>
      <span>Leads (linha)</span>
    </div>
  </div>
`

function isDark() {
  if (typeof window === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null

  const investimento = payload.find((p) => p.dataKey === 'investimento')?.value ?? 0
  const leads = payload.find((p) => p.dataKey === 'leads')?.value ?? 0
  const cpl = leads > 0 ? investimento / leads : 0

  const dataFormatada = label
    ? new Date(label).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  return (
    <div
      style={{
        background: 'rgba(14,20,42,0.92)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '8px',
        padding: '8px 12px',
        color: '#ffffff',
        fontSize: '12px',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>{dataFormatada}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: entry.dataKey === 'investimento' ? '#3E5BFF' : '#0fa856',
              display: 'inline-block',
            }}
          />
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
            {entry.dataKey === 'investimento' ? 'Investimento' : 'Leads'}:
          </span>
          <span style={{ fontWeight: 600 }}>
            {entry.dataKey === 'investimento'
              ? formatarMoeda(entry.value)
              : formatarNumero(entry.value)}
          </span>
        </div>
      ))}
      {leads > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#FFD700',
              display: 'inline-block',
            }}
          />
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>CPL:</span>
          <span style={{ fontWeight: 600 }}>{formatarMoeda(cpl)}</span>
        </div>
      )}
    </div>
  )
}

export function GraficoTemporal({ dados }: GraficoTemporalProps) {
  const dark = isDark()
  const strokeGrid = dark ? 'rgba(255,255,255,0.06)' : 'rgba(14,20,42,0.06)'

  return (
    <div
      style={{
        background: 'var(--ws-glass-bg, rgba(255,255,255,0.72))',
        border: '1px solid var(--ws-glass-border, rgba(255,255,255,0.35))',
        borderRadius: '14px',
        padding: '16px 20px',
        backdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow, 0 8px 32px rgba(14,20,42,0.12), 0 2px 8px rgba(14,20,42,0.08))',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Linha de brilho no topo */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
          zIndex: 1,
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ws-text-1, #0E142A)' }}>Evolução temporal</div>
          <div style={{ fontSize: '11px', color: 'var(--ws-text-3, #8892b0)', marginTop: '2px' }}>
            Investimento e geração de leads diária no período
          </div>
        </div>
        <InfoTooltip
          title="Evolução temporal"
          description="Acompanha o investimento e a geração de leads dia a dia."
          diagram={TEMPORAL_DIAGRAM}
        />
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3E5BFF', display: 'inline-block' }} />
          <span style={{ fontSize: '11px', color: 'var(--ws-text-3, #8892b0)' }}>Investimento</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0fa856', display: 'inline-block' }} />
          <span style={{ fontSize: '11px', color: 'var(--ws-text-3, #8892b0)' }}>Leads</span>
        </div>
      </div>

      <ChartSurface
        height={220}
        fallback={<div style={{ width: '100%', height: '100%', borderRadius: 12, background: 'rgba(255,255,255,0.03)' }} />}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={dados} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id="colorInvest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3E5BFF" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#3E5BFF" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0fa856" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#0fa856" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={strokeGrid} vertical={false} />
            <XAxis
              dataKey="data"
              tick={{ fontSize: 11, fill: '#8892b0' }}
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis
              yAxisId="investimento"
              orientation="left"
              tick={{ fontSize: 11, fill: '#8892b0' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `R$${v}`}
            />
            <YAxis
              yAxisId="leads"
              orientation="right"
              tick={{ fontSize: 11, fill: '#8892b0' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatarNumero(v)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="investimento"
              yAxisId="investimento"
              stroke="#3E5BFF"
              fill="url(#colorInvest)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: '#3E5BFF' }}
            />
            <Area
              type="monotone"
              dataKey="leads"
              yAxisId="leads"
              stroke="#0fa856"
              fill="url(#colorLeads)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: '#0fa856' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartSurface>
    </div>
  )
}
