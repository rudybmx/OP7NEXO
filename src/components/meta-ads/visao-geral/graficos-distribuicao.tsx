'use client'

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import type { ContaAnuncio } from '@/types/meta-ads'
import { formatarMoeda, formatarNumero } from '@/lib/formatar'
import { ChartSurface } from '@/components/meta-ads/chart-surface'

interface GraficoProps {
  contas: ContaAnuncio[]
}

const CORES_GRAFICOS = {
  investimento: '#3E5BFF',
  leads: '#0fa856',
  donut: ['#3E5BFF', '#7A5AF8', '#0fa856', '#FF5C8D'],
}

function isDark() {
  if (typeof window === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

function GlassCard({ children }: { children: React.ReactNode }) {
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
      {children}
    </div>
  )
}

function CustomTooltipBarra({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null
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
      <div style={{ fontWeight: 500, marginBottom: '6px' }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: entry.dataKey === 'investimento' ? CORES_GRAFICOS.investimento : CORES_GRAFICOS.leads,
              display: 'inline-block',
            }}
          />
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
            {entry.dataKey === 'investimento' ? 'Investimento' : 'Leads'}:
          </span>
          <span style={{ fontWeight: 600 }}>
            {entry.dataKey === 'investimento' ? formatarMoeda(entry.value) : formatarNumero(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function GraficoBarrasContas({ contas }: GraficoProps) {
  const dark = isDark()
  const strokeGrid = dark ? 'rgba(255,255,255,0.06)' : 'rgba(14,20,42,0.06)'

  const dadosBarras = contas
    .filter((c) => c.status === 'ACTIVE' || c.investimento > 0)
    .map((c) => ({
      nome: (c.nomeAbreviado || c.nome).length > 14 ? (c.nomeAbreviado || c.nome).slice(0, 14) + '...' : (c.nomeAbreviado || c.nome),
      investimento: c.investimento,
      leads: c.leads,
    }))

  return (
    <GlassCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ws-text-1, #0E142A)' }}>Distribuição por conta</div>
          <div style={{ fontSize: '11px', color: 'var(--ws-text-3, #8892b0)', marginTop: '2px' }}>
            Investimento e leads por conta
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: CORES_GRAFICOS.investimento, display: 'inline-block' }} />
          <span style={{ fontSize: '11px', color: 'var(--ws-text-3, #8892b0)' }}>Investimento</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: CORES_GRAFICOS.leads, display: 'inline-block' }} />
          <span style={{ fontSize: '11px', color: 'var(--ws-text-3, #8892b0)' }}>Leads</span>
        </div>
      </div>

      <ChartSurface height={200}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={dadosBarras} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={strokeGrid} vertical={false} />
            <XAxis 
              dataKey="nome" 
              tick={{ fontSize: 11, fill: '#8892b0' }} 
              axisLine={false} 
              tickLine={false}
              dy={10}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#8892b0' }} 
              axisLine={false} 
              tickLine={false} 
            />
            <Tooltip content={<CustomTooltipBarra />} />
            <Bar dataKey="investimento" fill={CORES_GRAFICOS.investimento} radius={[4, 4, 0, 0]} barSize={24} />
            <Bar dataKey="leads" fill={CORES_GRAFICOS.leads} radius={[4, 4, 0, 0]} barSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </ChartSurface>
    </GlassCard>
  )
}

export function GraficoDonutInvestimento({ contas }: GraficoProps) {
  const dadosFiltrados = contas.filter((c) => c.status === 'ACTIVE' || c.investimento > 0)
  const investimentoTotal = dadosFiltrados.reduce((s, d) => s + d.investimento, 0)

  const dadosPizza = dadosFiltrados.map((c, i) => ({
    nome: c.nomeAbreviado || c.nome,
    valor: c.investimento,
    cor: CORES_GRAFICOS.donut[i % CORES_GRAFICOS.donut.length],
  }))

  return (
    <GlassCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ws-text-1, #0E142A)' }}>Participação no investimento</div>
          <div style={{ fontSize: '11px', color: 'var(--ws-text-3, #8892b0)', marginTop: '2px' }}>
            % por conta no período
          </div>
        </div>
      </div>

      <ChartSurface
        height={180}
        style={{ position: 'relative', marginBottom: '16px' }}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <PieChart>
            <Pie
              data={dadosPizza}
              dataKey="valor"
              nameKey="nome"
              cx="50%"
              cy="50%"
              innerRadius="65%"
              outerRadius="90%"
              strokeWidth={0}
              paddingAngle={4}
            >
              {dadosPizza.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.cor} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                background: 'rgba(14,20,42,0.92)', 
                border: 'none', 
                borderRadius: '8px', 
                color: '#fff',
                fontSize: '12px',
                backdropFilter: 'blur(10px)'
              }} 
              itemStyle={{ color: '#fff' }}
              labelStyle={{ color: '#fff', fontWeight: '600' }} 
              formatter={(value) => formatarMoeda(Number(value))} 
            />
          </PieChart>
        </ResponsiveContainer>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none'
          }}
        >
          <div style={{ fontSize: '10px', color: 'var(--ws-text-3, #8892b0)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ws-text-1, #0E142A)' }}>{formatarMoeda(investimentoTotal)}</div>
        </div>
      </ChartSurface>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
        {dadosPizza.map((d) => {
          const pct = investimentoTotal > 0 ? ((d.valor / investimentoTotal) * 100).toFixed(1).replace('.', ',') : '0'
          return (
            <div key={d.nome} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.cor, flexShrink: 0 }} />
              <span style={{ color: 'var(--ws-text-2, #4a5580)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.nome}</span>
              <span style={{ color: 'var(--ws-text-3, #8892b0)', minWidth: '40px', textAlign: 'right' }}>{pct}%</span>
              <span style={{ fontWeight: 600, color: 'var(--ws-text-1, #0E142A)', minWidth: '70px', textAlign: 'right' }}>{formatarMoeda(d.valor)}</span>
            </div>
          )
        })}
      </div>
    </GlassCard>
  )
}
