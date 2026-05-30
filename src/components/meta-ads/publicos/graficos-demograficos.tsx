'use client'

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line,
} from 'recharts'
import { WS_CHART_COLORS } from '@/components/design-system/sections/ds-graficos'
import type { DadosDemograficos } from '@/types/meta-ads-publicos'
import { ChartSurface } from '@/components/meta-ads/chart-surface'

interface Props {
  demograficos: DadosDemograficos[]
}

const dadosTempo = [
  { data: '1/abr', f1834: 210, f3554: 80,  f55: 18 },
  { data: '7/abr', f1834: 280, f3554: 95,  f55: 20 },
  { data: '14/abr', f1834: 320, f3554: 110, f55: 22 },
  { data: '21/abr', f1834: 410, f3554: 120, f55: 25 },
  { data: '28/abr', f1834: 490, f3554: 130, f55: 28 },
]

const FAIXAS = ['18–24', '25–34', '35–44', '45–54', '55–64', '65+']

export function GraficosDemograficos({ demograficos }: Props) {
  if (!demograficos.length) {
    return (
      <div style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
        padding: 20,
        minHeight: 220,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ws-text-2)',
        fontSize: 13,
        textAlign: 'center',
      }}>
        Gráficos demográficos indisponíveis para o período selecionado.
      </div>
    )
  }

  const dadosPorFaixa = FAIXAS.map(faixa => ({
    faixa,
    masc: demograficos.find(d => d.faixa === faixa && d.genero === 'masc')?.leads ?? 0,
    fem: demograficos.find(d => d.faixa === faixa && d.genero === 'fem')?.leads ?? 0,
  }))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

      {/* CARD 1 — Barras */}
      <div style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)', marginBottom: 4 }}>
          Leads por gênero e faixa etária
        </div>
        <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginBottom: 12 }}>
          Azul = masculino · Âmbar = feminino
        </div>
        {/* Legenda */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 10, fontSize: 11, alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, background: WS_CHART_COLORS.primary, borderRadius: 2 }} />
            <span style={{ color: 'var(--ws-text-2)' }}>Masculino</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, background: WS_CHART_COLORS.amber, borderRadius: 2 }} />
            <span style={{ color: 'var(--ws-text-2)' }}>Feminino</span>
          </span>
        </div>
        <ChartSurface height={200}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={dadosPorFaixa} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(14,20,42,0.06)" vertical={false} />
              <XAxis dataKey="faixa" tick={{ fontSize: 11, fill: '#8892b0' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#8892b0' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'rgba(14,20,42,0.92)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 11 }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#fff' }}
                cursor={{ fill: 'rgba(62,91,255,0.04)' }}
              />
              <Bar dataKey="masc" name="Masculino" fill={WS_CHART_COLORS.primary} radius={[3,3,0,0]} maxBarSize={20} />
              <Bar dataKey="fem" name="Feminino" fill={WS_CHART_COLORS.amber} radius={[3,3,0,0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </ChartSurface>
      </div>

      {/* CARD 2 — Linhas */}
      <div style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)', marginBottom: 4 }}>
          Evolução de leads por faixa etária
        </div>
        <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginBottom: 12 }}>
          Tendência temporal por segmento
        </div>
        {/* Legenda */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 10, fontSize: 11, alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 14, height: 2, background: WS_CHART_COLORS.green }} />
            <span style={{ color: 'var(--ws-text-2)' }}>18–34</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 14, height: 2, background: WS_CHART_COLORS.amber }} />
            <span style={{ color: 'var(--ws-text-2)' }}>35–54</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 14, height: 2, background: WS_CHART_COLORS.coral, borderTop: '2px dashed' }} />
            <span style={{ color: 'var(--ws-text-2)' }}>55+</span>
          </span>
        </div>
        <ChartSurface height={200}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart data={dadosTempo}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(14,20,42,0.06)" vertical={false} />
              <XAxis dataKey="data" tick={{ fontSize: 10, fill: '#8892b0' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#8892b0' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'rgba(14,20,42,0.92)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 11 }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#fff' }}
                cursor={{ stroke: 'rgba(62,91,255,0.15)', strokeWidth: 1 }}
              />
              <Line type="monotone" dataKey="f1834" name="18–34" stroke={WS_CHART_COLORS.green} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="f3554" name="35–54" stroke={WS_CHART_COLORS.amber} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="f55" name="55+" stroke={WS_CHART_COLORS.coral} strokeWidth={2} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </ChartSurface>
      </div>

    </div>
  )
}
