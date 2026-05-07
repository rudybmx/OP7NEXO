'use client'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import { useTheme } from '@/components/provedores/provedor-tema'
import { useEffect, useState } from 'react'

export const WS_CHART_COLORS = {
  primary:   '#3E5BFF',
  secondary: '#7A5AF8',
  cyan:      '#00F5FF',
  coral:     '#FF5C8D',
  green:     '#0fa856',
  amber:     '#F5A623',
}

const TEMPORAL = [
  { mes: 'Jan', leads: 320, custo: 9800 },
  { mes: 'Fev', leads: 410, custo: 11200 },
  { mes: 'Mar', leads: 380, custo: 10500 },
  { mes: 'Abr', leads: 520, custo: 13800 },
  { mes: 'Mai', leads: 490, custo: 12900 },
  { mes: 'Jun', leads: 610, custo: 15200 },
  { mes: 'Jul', leads: 720, custo: 17800 },
  { mes: 'Ago', leads: 680, custo: 16400 },
]

const ROAS_DATA = [
  { nome: 'Meta — Lookalike', roas: 42 },
  { nome: 'Meta — Broad',     roas: 38 },
  { nome: 'Google — PMax',    roas: 28 },
  { nome: 'Meta — Retarg.',   roas: 55 },
  { nome: 'Google — Search',  roas: 18 },
  { nome: 'Meta — Interesse', roas: 12 },
]

const GROUPED = [
  { faixa: '18-24', masculino: 42, feminino: 78 },
  { faixa: '25-34', masculino: 89, feminino: 124 },
  { faixa: '35-44', masculino: 67, feminino: 98 },
  { faixa: '45-54', masculino: 34, feminino: 56 },
  { faixa: '55+',   masculino: 18, feminino: 29 },
]

function GlassCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)', backdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)', padding: 20,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>{title}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  )
}

function useIsDark() {
  const { theme, resolvedTheme } = useTheme()
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    setIsDark(resolvedTheme === 'dark' || theme === 'dark')
  }, [theme, resolvedTheme])
  return isDark
}

export function DSGraficos() {
  const isDark = useIsDark()

  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(14,20,42,0.06)'
  const tickColor = isDark ? 'rgba(255,255,255,0.40)' : '#8892b0'
  const tooltipStyle = {
    background: isDark ? 'rgba(20,28,56,0.95)' : 'rgba(14,20,42,0.92)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8, color: '#ffffff', fontSize: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
  }
  const tooltipItemStyle = { color: '#ffffff' }
  const tooltipLabelStyle = { color: '#ffffff', fontWeight: '600' }

  const roasColor = (v: number) => v >= 35 ? WS_CHART_COLORS.green : v >= 20 ? WS_CHART_COLORS.amber : WS_CHART_COLORS.coral

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ws-text-1)', marginBottom: 6 }}>Gráficos (Recharts)</h2>
        <p style={{ fontSize: 14, color: 'var(--ws-text-2)', lineHeight: 1.6 }}>
          Sempre usar <code style={{ fontFamily: 'monospace', fontSize: 12 }}>WS_CHART_COLORS</code>.
          Grid e tooltips customizados. Nunca usar as cores padrão do Recharts.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* LineChart */}
        <GlassCard title="Evolução Temporal" desc="Leads (azul) × Custo (coral tracejado)">
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={TEMPORAL} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={WS_CHART_COLORS.primary} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={WS_CHART_COLORS.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ stroke: 'rgba(62,91,255,0.15)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="leads" fill="url(#gradLeads)" stroke="none" />
              <Line type="monotone" dataKey="leads" stroke={WS_CHART_COLORS.primary} strokeWidth={2} dot={false} name="Leads" />
              <Line type="monotone" dataKey="custo" stroke={WS_CHART_COLORS.coral} strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Custo" />
            </ComposedChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* BarChart agrupado */}
        <GlassCard title="Leads por Gênero e Faixa Etária" desc="Azul = masculino · Rosa = feminino">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={GROUPED} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="faixa" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: 'rgba(62,91,255,0.04)' }} />
              <Bar dataKey="masculino" fill={WS_CHART_COLORS.primary} radius={[3, 3, 0, 0]} maxBarSize={20} name="Masculino" />
              <Bar dataKey="feminino"  fill={WS_CHART_COLORS.coral}   radius={[3, 3, 0, 0]} maxBarSize={20} name="Feminino" />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      {/* ROAS horizontal */}
      <GlassCard title="ROAS por Campanha" desc="Verde ≥ 35× · Âmbar 20–35× · Coral < 20×">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={ROAS_DATA} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 0 }}>
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="nome" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} width={120} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: 'rgba(62,91,255,0.04)' }} />
            <Bar dataKey="roas" radius={[0, 4, 4, 0]} maxBarSize={16} name="ROAS">
              {ROAS_DATA.map((entry, i) => (
                <Cell key={i} fill={roasColor(entry.roas)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </GlassCard>
    </div>
  )
}
