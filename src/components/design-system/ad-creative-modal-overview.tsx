'use client'

import { useState, type ReactNode } from 'react'
import {
  Clock3,
  Info,
  Image as ImageIcon,
  Layers3,
  LineChart,
  PauseCircle,
  Play,
  Rocket,
  Sparkles,
  Target,
  Video,
  X,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartSurface } from '@/components/meta-ads/chart-surface'
import { formatarMoeda, formatarNumero } from '@/lib/formatar'
import { proxyImagem } from '@/lib/imagem-proxy'

export interface KPIMetric {
  value: number | string
  formatted: string
  delta?: {
    value: number
    direction: 'up' | 'down'
    isPositive: boolean
    label: string
  }
}

export interface PlatformBreakdown {
  platform: 'Instagram' | 'Facebook'
  leads: number
  cpl: number
  ctr: number
  spend: number
}

export interface QualityRanking {
  type: 'Quality' | 'Engagement' | 'Conversion'
  rank: 'Above Average' | 'Average' | 'Below Average'
}

export interface VideoMetrics {
  hookRate: number | null
  holdRate: number | null
  ctrLink: number
  avgWatchTime?: number | null
  retention: {
    checkpoint: string
    value: number
  }[]
  retentionUnavailable?: boolean
}

export interface TrendPoint {
  date: string
  cpl: number
  leads: number
}

export interface AIInsight {
  text: string
  recommendation: 'Escalar' | 'Aguardar' | 'Pausar'
  confidence: number
}

export interface AdCreativeModalOverviewData {
  id: string
  name: string
  status: 'Ativo' | 'Pausado' | 'Desativado'
  assetType: 'IMAGE' | 'VIDEO'
  imageUrl: string
  metaUrl?: string

  period: string
  rankInPeriod: number
  totalInPeriod: number

  leads: KPIMetric
  cpl: KPIMetric
  ctr: KPIMetric
  spend: KPIMetric
  scoreIA: number

  trend: TrendPoint[]

  reach: number
  frequencia: number

  platforms: PlatformBreakdown[]
  qualityRankings?: QualityRanking[]
  aiInsight?: AIInsight
  videoMetrics?: VideoMetrics
}

const QUALITY_RANK_LABELS = {
  Quality: 'Qualidade do Anúncio',
  Engagement: 'Taxa de Engajamento',
  Conversion: 'Taxa de Conversão',
} as const

const RANK_LABELS = {
  'Above Average': 'Acima da Média',
  Average: 'Na Média',
  'Below Average': 'Abaixo da Média',
} as const

type VideoMetricKey = 'hookRate' | 'holdRate' | 'ctrLink'

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function makeFallbackPoster(name: string, assetType: AdCreativeModalOverviewData['assetType']) {
  const isVideo = assetType === 'VIDEO'
  const accentA = isVideo ? 'rgba(122,90,248,1)' : 'rgba(62,91,255,1)'
  const accentB = isVideo ? 'rgba(255,92,141,1)' : 'rgba(122,90,248,1)'
  const soft = isVideo ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.16)'
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1600" fill="none">
      <defs>
        <linearGradient id="bg" x1="120" y1="100" x2="820" y2="1520" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="${accentA}" />
          <stop offset="1" stop-color="${accentB}" />
        </linearGradient>
        <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="rgba(255,255,255,0.30)" />
          <stop offset="1" stop-color="rgba(255,255,255,0.02)" />
        </linearGradient>
      </defs>
      <rect width="900" height="1600" fill="url(#bg)" />
      <circle cx="158" cy="154" r="176" fill="rgba(255,255,255,0.18)" />
      <circle cx="780" cy="252" r="210" fill="rgba(255,255,255,0.10)" />
      <circle cx="756" cy="1216" r="248" fill="rgba(255,255,255,0.08)" />
      <rect x="74" y="118" width="124" height="34" rx="17" fill="rgba(255,255,255,0.18)" />
      <text x="92" y="141" fill="white" font-size="18" font-weight="700" letter-spacing="2">${isVideo ? 'VÍDEO' : 'IMAGEM'}</text>
      <text x="72" y="236" fill="white" font-size="76" font-weight="700" letter-spacing="-2">${escapeXml(name)}</text>
      <text x="72" y="300" fill="rgba(255,255,255,0.84)" font-size="28" font-weight="500">${isVideo ? 'Prévia de vídeo' : 'Prévia de imagem'}</text>
      <rect x="72" y="358" width="330" height="14" rx="7" fill="rgba(255,255,255,0.36)" />
      <rect x="72" y="392" width="282" height="14" rx="7" fill="rgba(255,255,255,0.24)" />
      <rect x="72" y="426" width="228" height="14" rx="7" fill="rgba(255,255,255,0.18)" />
      <rect x="72" y="528" width="312" height="708" rx="44" fill="url(#glow)" stroke="rgba(255,255,255,0.18)" />
      <rect x="96" y="566" width="264" height="14" rx="7" fill="rgba(255,255,255,0.28)" />
      <rect x="96" y="602" width="184" height="14" rx="7" fill="rgba(255,255,255,0.22)" />
      <rect x="96" y="640" width="224" height="14" rx="7" fill="rgba(255,255,255,0.16)" />
      ${
        isVideo
          ? `
            <g transform="translate(585 1030)">
              <circle cx="110" cy="110" r="110" fill="rgba(255,255,255,0.18)" />
              <circle cx="110" cy="110" r="84" fill="rgba(255,255,255,0.92)" />
              <path d="M92 72 L170 110 L92 148 Z" fill="rgba(62,91,255,1)" />
            </g>
          `
          : `
            <g transform="translate(605 1036)">
              <rect x="0" y="0" width="210" height="132" rx="28" fill="${soft}" />
              <circle cx="58" cy="66" r="22" fill="rgba(255,255,255,0.80)" />
              <path d="M47 66 L59 54 L71 66 L59 78 Z" fill="rgba(122,90,248,1)" />
              <rect x="98" y="42" width="82" height="14" rx="7" fill="rgba(255,255,255,0.70)" />
              <rect x="98" y="64" width="64" height="10" rx="5" fill="rgba(255,255,255,0.44)" />
              <rect x="98" y="82" width="54" height="10" rx="5" fill="rgba(255,255,255,0.30)" />
            </g>
          `
      }
      <text x="72" y="1490" fill="rgba(255,255,255,0.70)" font-size="20" font-weight="600">Op7 Nexo · Sistema de design</text>
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function statusVisual(status: AdCreativeModalOverviewData['status']) {
  switch (status) {
    case 'Ativo':
      return {
        bg: 'var(--ws-green-soft)',
        border: 'rgba(15,168,86,0.24)',
        color: 'var(--ws-green)',
      }
    case 'Pausado':
      return {
        bg: 'var(--ws-coral-soft)',
        border: 'rgba(255,92,141,0.24)',
        color: 'var(--ws-coral)',
      }
    case 'Desativado':
      return {
        bg: 'var(--ws-surface-2)',
        border: 'var(--ws-divider)',
        color: 'var(--ws-text-2)',
      }
  }

  return {
    bg: 'var(--ws-surface-2)',
    border: 'var(--ws-divider)',
    color: 'var(--ws-text-2)',
  }
}

function assetVisual(assetType: AdCreativeModalOverviewData['assetType']) {
  return assetType === 'VIDEO'
    ? {
        bg: 'var(--ws-purple-soft)',
        border: 'rgba(122,90,248,0.22)',
        color: 'var(--ws-purple)',
        label: 'Vídeo',
        icon: <Video size={12} />,
      }
    : {
        bg: 'var(--ws-blue-soft)',
        border: 'rgba(62,91,255,0.22)',
        color: 'var(--ws-blue)',
        label: 'Imagem',
        icon: <ImageIcon size={12} />,
      }
}

function scoreVisual(score: number) {
  if (score >= 70) {
    return {
      bg: 'var(--ws-green-soft)',
      border: 'rgba(15,168,86,0.24)',
      color: 'var(--ws-green)',
      label: 'Bom',
    }
  }
  if (score >= 40) {
    return {
      bg: 'var(--ws-gold-soft)',
      border: 'rgba(242,101,34,0.24)',
      color: 'var(--ws-gold)',
      label: 'Atenção',
    }
  }
  return {
    bg: 'var(--ws-coral-soft)',
    border: 'rgba(255,92,141,0.24)',
    color: 'var(--ws-coral)',
    label: 'Crítico',
  }
}

function frequencyVisual(freq: number) {
  if (freq < 1.5) {
    return {
      bg: 'var(--ws-green)',
      track: 'var(--ws-green-soft)',
      color: 'var(--ws-green)',
      label: 'Ideal',
      icon: '✓',
    }
  }

  if (freq < 3.5) {
    return {
      bg: 'var(--ws-gold)',
      track: 'var(--ws-gold-soft)',
      color: 'var(--ws-gold)',
      label: 'Cuidado',
      icon: '⚠',
    }
  }

  return {
    bg: 'var(--ws-coral)',
    track: 'var(--ws-coral-soft)',
    color: 'var(--ws-coral)',
    label: 'Fadiga',
    icon: '⚠',
  }
}

function qualityVisual(rank: QualityRanking['rank']) {
  switch (rank) {
    case 'Above Average':
      return {
        bg: 'var(--ws-green-soft)',
        border: 'rgba(15,168,86,0.24)',
        color: 'var(--ws-green)',
      }
    case 'Average':
      return {
        bg: 'var(--ws-gold-soft)',
        border: 'rgba(242,101,34,0.24)',
        color: 'var(--ws-gold)',
      }
    case 'Below Average':
      return {
        bg: 'var(--ws-coral-soft)',
        border: 'rgba(255,92,141,0.24)',
        color: 'var(--ws-coral)',
      }
  }

  return {
    bg: 'var(--ws-surface-2)',
    border: 'var(--ws-divider)',
    color: 'var(--ws-text-2)',
  }
}

function videoMetricVisual(metric: VideoMetricKey, value: number | null) {
  if (value === null) {
    return {
      bg: 'var(--ws-surface-2)',
      border: 'var(--ws-divider)',
      color: 'var(--ws-text-3)',
      label: 'Indisponível',
    }
  }
  if (metric === 'hookRate') {
    if (value < 5) {
      return {
        bg: 'var(--ws-coral-soft)',
        border: 'rgba(255,92,141,0.24)',
        color: 'var(--ws-coral)',
        label: 'Crítico',
      }
    }

    if (value <= 15) {
      return {
        bg: 'var(--ws-gold-soft)',
        border: 'rgba(242,101,34,0.24)',
        color: 'var(--ws-gold)',
        label: 'Atenção',
      }
    }

    return {
      bg: 'var(--ws-green-soft)',
      border: 'rgba(15,168,86,0.24)',
      color: 'var(--ws-green)',
      label: 'Bom',
    }
  }

  if (metric === 'holdRate') {
    if (value < 15) {
      return {
        bg: 'var(--ws-coral-soft)',
        border: 'rgba(255,92,141,0.24)',
        color: 'var(--ws-coral)',
        label: 'Crítico',
      }
    }

    if (value <= 25) {
      return {
        bg: 'var(--ws-gold-soft)',
        border: 'rgba(242,101,34,0.24)',
        color: 'var(--ws-gold)',
        label: 'Atenção',
      }
    }

    return {
      bg: 'var(--ws-green-soft)',
      border: 'rgba(15,168,86,0.24)',
      color: 'var(--ws-green)',
      label: 'Bom',
    }
  }

  if (value < 1) {
    return {
      bg: 'var(--ws-coral-soft)',
      border: 'rgba(255,92,141,0.24)',
      color: 'var(--ws-coral)',
      label: 'Crítico',
    }
  }

  if (value <= 2.5) {
    return {
      bg: 'var(--ws-gold-soft)',
      border: 'rgba(242,101,34,0.24)',
      color: 'var(--ws-gold)',
      label: 'Atenção',
    }
  }

  return {
    bg: 'var(--ws-green-soft)',
    border: 'rgba(15,168,86,0.24)',
    color: 'var(--ws-green)',
    label: 'Bom',
  }
}

function neutralVideoMetricVisual() {
  return {
    bg: 'var(--ws-blue-soft)',
    border: 'rgba(62,91,255,0.22)',
    color: 'var(--ws-blue)',
    label: 'Média',
  }
}

function recommendationVisual(recommendation: AIInsight['recommendation']) {
  switch (recommendation) {
    case 'Escalar':
      return {
        bg: 'var(--ws-green-soft)',
        border: 'rgba(15,168,86,0.24)',
        color: 'var(--ws-green)',
        icon: <Rocket size={12} />,
      }
    case 'Aguardar':
      return {
        bg: 'var(--ws-gold-soft)',
        border: 'rgba(242,101,34,0.24)',
        color: 'var(--ws-gold)',
        icon: <Clock3 size={12} />,
      }
    case 'Pausar':
      return {
        bg: 'var(--ws-coral-soft)',
        border: 'rgba(255,92,141,0.24)',
        color: 'var(--ws-coral)',
        icon: <PauseCircle size={12} />,
      }
  }

  return {
    bg: 'var(--ws-surface-2)',
    border: 'var(--ws-divider)',
    color: 'var(--ws-text-2)',
    icon: <Clock3 size={12} />,
  }
}

function formatDelta(delta: KPIMetric['delta']) {
  if (!delta) return null

  const movementIsPositive = delta.direction === 'down' ? !delta.isPositive : delta.isPositive
  const color = movementIsPositive ? 'var(--ws-green)' : 'var(--ws-coral)'
  const arrow = delta.direction === 'down' ? '↓' : '↑'
  const value = `${Math.abs(delta.value).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`

  return { color, arrow, value }
}

function formatTrendDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${date}T00:00:00`))
}

function formatPercent(value: number) {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function formatVideoDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return '—'
  }

  const rounded = Math.round(seconds)
  if (rounded <= 0) return '—'
  if (rounded < 60) return `${rounded}s`

  const minutes = Math.floor(rounded / 60)
  const secs = String(rounded % 60).padStart(2, '0')
  return `${minutes}m ${secs}s`
}

function Panel({
  title,
  icon,
  accent,
  children,
}: {
  title: string
  icon: ReactNode
  accent: string
  children: ReactNode
}) {
  return (
    <section
      style={{
        background: 'var(--ws-surface-2)',
        border: '1px solid var(--ws-divider)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 'var(--ws-radius-lg)',
        padding: 14,
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
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.78), transparent)',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 8,
            background: 'var(--ws-glass-bg)',
            border: '1px solid var(--ws-divider)',
            color: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--ws-text-3)',
            }}
          >
            {title}
          </div>
        </div>
      </div>

      {children}
    </section>
  )
}

function BadgePill({
  label,
  bg,
  border,
  color,
  icon,
}: {
  label: string
  bg: string
  border: string
  color: string
  icon?: ReactNode
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: 9999,
        border: `1px solid ${border}`,
        background: bg,
        color,
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1.35,
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
    </span>
  )
}

function MetricTile({
  label,
  value,
  tone,
  delta,
}: {
  label: string
  value: string
  tone: string
  delta?: KPIMetric['delta']
}) {
  const deltaVisual = formatDelta(delta)

  return (
    <div
      style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderTop: `2px solid ${tone}`,
        borderRadius: 'var(--ws-radius-md)',
        padding: '10px 12px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--ws-text-3)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: 'var(--ws-text-1)',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
      {deltaVisual ? (
        <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: deltaVisual.color,
              whiteSpace: 'nowrap',
            }}
          >
            {deltaVisual.arrow} {deltaVisual.value}
          </span>
          <span style={{ fontSize: 11, color: 'var(--ws-text-3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {delta.label}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function TrendSparkline({ trend }: { trend: TrendPoint[] }) {
  if (trend.length < 3) return null

  return (
    <Panel title="Tendência do CPL" icon={<LineChart size={14} />} accent="var(--ws-blue)">
      <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.5 }}>
        CPL dos últimos 14 dias
      </div>
      <ChartSurface height={118}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <RechartsLineChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(62,91,255,0.06)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={false}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
            <Tooltip
              contentStyle={{
                background: 'rgba(14,20,42,0.94)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                color: '#ffffff',
                fontSize: 12,
                boxShadow: '0 10px 24px rgba(0,0,0,0.30)',
              }}
              labelStyle={{ color: '#ffffff', fontWeight: 600 }}
              itemStyle={{ color: '#ffffff' }}
              formatter={(value: number) => [formatarMoeda(value), 'CPL']}
              labelFormatter={(label: string) => formatTrendDate(label)}
            />
            <Line
              type="monotone"
              dataKey="cpl"
              stroke="var(--ws-blue)"
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 4, fill: 'var(--ws-blue)' }}
              isAnimationActive={false}
            />
          </RechartsLineChart>
        </ResponsiveContainer>
      </ChartSurface>
    </Panel>
  )
}

function FrequencyPanel({ reach, frequencia }: { reach: number; frequencia: number }) {
  const visual = frequencyVisual(frequencia)
  const fill = Math.min((frequencia / 5.5) * 100, 100)

  return (
    <Panel title="Frequência + alcance" icon={<Target size={14} />} accent={visual.color}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--ws-text-2)' }}>
          Alcance: <strong style={{ color: 'var(--ws-text-1)' }}>{formatarNumero(reach)}</strong>
        </div>
        <BadgePill
          label={`${visual.icon} ${frequencia.toLocaleString('pt-BR', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })} · ${visual.label}`}
          bg={visual.track}
          border="var(--ws-divider)"
          color={visual.color}
        />
      </div>

      <div
        style={{
          height: 10,
          borderRadius: 9999,
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-divider)',
          overflow: 'hidden',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${fill}%`,
            background: visual.bg,
            borderRadius: 9999,
            transition: 'width 280ms ease',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: 'var(--ws-text-2)', lineHeight: 1.5 }}>
        <span>1,0 ideal</span>
        <span>3,5 cuidado</span>
        <span>4,5+ fadiga</span>
      </div>
    </Panel>
  )
}

function PlatformRow({ platform }: { platform: PlatformBreakdown }) {
  return (
    <div
      style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-divider)',
        borderRadius: 'var(--ws-radius-md)',
        padding: '10px 12px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>{platform.platform}</span>
        <span style={{ fontSize: 12, color: 'var(--ws-text-2)' }}>Leads gerados: {formatarNumero(platform.leads)}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ws-text-2)' }}>CPL: {formatarMoeda(platform.cpl)}</div>
    </div>
  )
}

function QualityRow({ ranking }: { ranking: QualityRanking }) {
  const visual = qualityVisual(ranking.rank)
  const rankLabel = RANK_LABELS[ranking.rank]
  const qualityLabel = QUALITY_RANK_LABELS[ranking.type]

  return (
    <div
      style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-divider)',
        borderRadius: 'var(--ws-radius-md)',
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--ws-text-1)', fontWeight: 600 }}>{qualityLabel}</div>
      <BadgePill label={rankLabel} bg={visual.bg} border={visual.border} color={visual.color} />
    </div>
  )
}

function VideoMetricTile({
  label,
  value,
  tone,
  title,
  valueFormatter,
}: {
  label: string
  value: number | null
  tone: ReturnType<typeof videoMetricVisual>
  title?: string
  valueFormatter?: (value: number | null) => string
}) {
  const displayValue = valueFormatter ? valueFormatter(value) : (value === null ? '—' : formatPercent(value))

  return (
    <div
      title={title}
      style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderTop: `2px solid ${tone.color}`,
        borderRadius: 'var(--ws-radius-md)',
        padding: '10px 12px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--ws-text-3)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            color: tone.color,
            wordBreak: 'break-word',
          }}
        >
          {displayValue}
        </div>
        <BadgePill label={tone.label} bg={tone.bg} border={tone.border} color={tone.color} />
      </div>
    </div>
  )
}

export function VideoMetricsPanel({ videoMetrics }: { videoMetrics?: VideoMetrics }) {
  if (!videoMetrics) return null

  const hookTone = videoMetricVisual('hookRate', videoMetrics.hookRate)
  const holdTone = videoMetricVisual('holdRate', videoMetrics.holdRate)
  const ctrTone = videoMetricVisual('ctrLink', videoMetrics.ctrLink)
  const avgWatchTone = neutralVideoMetricVisual()
  const retentionUnavailable = videoMetrics.retentionUnavailable || videoMetrics.retention.length === 0

  return (
    <Panel title="Métricas de vídeo" icon={<Video size={14} />} accent="var(--ws-purple)">
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.5 }}>
            Gráfico de retenção
          </div>
          {retentionUnavailable ? (
            <div
              style={{
                minHeight: 160,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '16px',
                background: 'linear-gradient(180deg, rgba(122,90,248,0.07), rgba(62,91,255,0.03))',
                borderRadius: 'var(--ws-radius-sm)',
                border: '1px solid rgba(122,90,248,0.16)',
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: 'var(--ws-purple)',
                  background: 'rgba(122,90,248,0.12)',
                  border: '1px solid rgba(122,90,248,0.18)',
                }}
              >
                <Info size={16} />
              </div>

              <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)', lineHeight: 1.4 }}>
                  Retenção indisponível
                </div>
                <div style={{ fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.6 }}>
                  A Meta não retornou a base de visualizações de 3s para este criativo.
                </div>
                <div style={{ fontSize: 11, color: 'var(--ws-text-3)', lineHeight: 1.55 }}>
                  Visualizações, Plays, ThruPlays e quartis podem continuar disponíveis na aba Vídeo.
                </div>
              </div>
            </div>
          ) : (
            <ChartSurface height={160}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <RechartsLineChart
                  data={videoMetrics.retention}
                  margin={{ top: 4, right: 6, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(122,90,248,0.07)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="checkpoint"
                    tick={{ fill: 'var(--ws-text-3)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickCount={6}
                    tickFormatter={(value) => `${value}%`}
                    tick={{ fill: 'var(--ws-text-3)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={34}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(14,20,42,0.94)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8,
                      color: '#ffffff',
                      fontSize: 12,
                      boxShadow: '0 10px 24px rgba(0,0,0,0.30)',
                    }}
                    labelStyle={{ color: '#ffffff', fontWeight: 600 }}
                    itemStyle={{ color: '#ffffff' }}
                    formatter={(value: number) => [`${value}%`, 'Retenção']}
                    labelFormatter={(label: string) => `Marcação ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--ws-purple)"
                    strokeWidth={2.4}
                    dot={{ r: 3.4, fill: 'var(--ws-purple)' }}
                    activeDot={{ r: 4, fill: 'var(--ws-purple)' }}
                    isAnimationActive={false}
                  />
                </RechartsLineChart>
              </ResponsiveContainer>
            </ChartSurface>
          )}
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.5 }}>
            Funil de vídeo
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 8,
              alignItems: 'stretch',
            }}
          >
            <VideoMetricTile
              label="Tempo médio assistido"
              value={videoMetrics.avgWatchTime ?? null}
              tone={avgWatchTone}
              title="Tempo médio que o vídeo foi reproduzido, conforme métrica retornada pela Meta."
              valueFormatter={formatVideoDuration}
            />
            <VideoMetricTile label="Taxa de gancho" value={videoMetrics.hookRate} tone={hookTone} />
            <VideoMetricTile label="Taxa de retenção" value={videoMetrics.holdRate} tone={holdTone} />
            <VideoMetricTile label="CTR do link" value={videoMetrics.ctrLink} tone={ctrTone} />
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              fontSize: 11,
              color: 'var(--ws-text-2)',
              lineHeight: 1.5,
            }}
          >
            <span>Gancho → Retenção → CTR do link</span>
          </div>
        </div>
      </div>
    </Panel>
  )
}

export function InsightPanel({
  insight,
  title = 'Painel de inteligência de IA',
  afterContent,
}: {
  insight: AIInsight
  title?: string
  afterContent?: ReactNode
}) {
  const visual = recommendationVisual(insight.recommendation)

  return (
    <Panel title={title} icon={<Sparkles size={14} />} accent="var(--ws-purple)">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          gap: 12,
          alignItems: 'start',
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            background: 'var(--ws-purple-soft)',
            border: '1px solid rgba(122,90,248,0.22)',
            color: 'var(--ws-purple)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Sparkles size={16} />
        </div>

        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--ws-text-2)',
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            “{insight.text}”
          </p>

          <div
            style={{
              marginTop: 12,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
            }}
            >
            <BadgePill
              label={insight.recommendation}
              bg={visual.bg}
              border={visual.border}
              color={visual.color}
              icon={visual.icon}
            />
            <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>Confiança em IA {insight.confidence}%</span>
          </div>
        </div>
      </div>

      {afterContent ? <div style={{ marginTop: 12 }}>{afterContent}</div> : null}
    </Panel>
  )
}

function MetricBlock({
  label,
  value,
  delta,
  tone,
}: {
  label: string
  value: string
  delta?: KPIMetric['delta']
  tone: string
}) {
  return <MetricTile label={label} value={value} delta={delta} tone={tone} />
}

export function AdCreativeModalOverview({ data }: { data: AdCreativeModalOverviewData }) {
  const statusBadge = statusVisual(data.status)
  const assetBadge = assetVisual(data.assetType)
  const scoreBadge = scoreVisual(data.scoreIA)
  const previewFallback = makeFallbackPoster(data.name, data.assetType)
  const [previewSrc, setPreviewSrc] = useState(
    data.imageUrl.startsWith('/mock/') ? previewFallback : proxyImagem(data.imageUrl) ?? data.imageUrl,
  )

  return (
    <section
      style={{
        width: '100%',
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-xl)',
        boxShadow: 'var(--ws-glass-shadow-lg)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
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
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.82), transparent)',
        }}
      />

      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          padding: '16px 18px 14px',
          borderBottom: '1px solid var(--ws-divider)',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--ws-text-1)',
                lineHeight: 1.2,
                wordBreak: 'break-word',
              }}
            >
              {data.name}
            </h2>
            <BadgePill label={data.status} bg={statusBadge.bg} border={statusBadge.border} color={statusBadge.color} />
            <BadgePill
              label={assetBadge.label}
              bg={assetBadge.bg}
              border={assetBadge.border}
              color={assetBadge.color}
              icon={assetBadge.icon}
            />
          </div>

          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: 'var(--ws-text-2)',
              lineHeight: 1.5,
            }}
          >
            Período: {data.period} · #{data.rankInPeriod} de {data.totalInPeriod} criativos do período
          </div>
        </div>

        <button
          type="button"
          aria-label="Prévia de referência sem ação"
          disabled
          style={{
            width: 34,
            height: 34,
            borderRadius: 9999,
            border: '1px solid var(--ws-divider)',
            background: 'var(--ws-surface-2)',
            color: 'var(--ws-text-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'default',
            flexShrink: 0,
            opacity: 0.82,
          }}
        >
          <X size={16} />
        </button>
      </header>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 18,
          padding: 18,
          alignItems: 'stretch',
        }}
      >
        <aside
          style={{
            flex: '0 1 360px',
            minWidth: 280,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div
            style={{
              background: 'var(--ws-surface-2)',
              border: '1px solid var(--ws-divider)',
              borderRadius: 'var(--ws-radius-lg)',
              padding: 12,
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
                height: 1,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.82), transparent)',
              }}
            />

            <div
              style={{
                aspectRatio: '9 / 16',
                width: '100%',
                minHeight: 420,
                borderRadius: 'var(--ws-radius-md)',
                overflow: 'hidden',
                position: 'relative',
                border: '1px solid var(--ws-divider)',
                background: 'linear-gradient(180deg, rgba(14,20,42,0.06), rgba(14,20,42,0.12))',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt={data.name}
                onError={() => setPreviewSrc(previewFallback)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                }}
                referrerPolicy="no-referrer"
              />

              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  left: 10,
                }}
              >
                <BadgePill
                  label={assetBadge.label}
                  bg="rgba(14,20,42,0.52)"
                  border="rgba(255,255,255,0.12)"
                  color="white"
                  icon={assetBadge.icon}
                />
              </div>

              {data.assetType === 'VIDEO' ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, rgba(14,20,42,0.10), rgba(14,20,42,0.32))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.92)',
                      border: '1px solid rgba(255,255,255,0.40)',
                      boxShadow: '0 12px 30px rgba(14,20,42,0.24)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Play size={28} fill="currentColor" color="var(--ws-blue)" />
                  </div>
                </div>
              ) : null}

            </div>
          </div>
        </aside>

        <div
          style={{
            flex: '1 1 560px',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <section style={{ display: 'grid', gap: 12 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 10,
              }}
            >
              <MetricBlock
                label="Leads gerados"
                value={formatarNumero(Number(data.leads.value))}
                delta={data.leads.delta}
                tone="var(--ws-green)"
              />
              <MetricBlock label="CPL" value={data.cpl.formatted} delta={data.cpl.delta} tone="var(--ws-coral)" />
              <MetricBlock label="CTR" value={data.ctr.formatted} delta={data.ctr.delta} tone="var(--ws-blue)" />
              <MetricBlock label="Investimento" value={data.spend.formatted} tone="var(--ws-purple)" />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
              }}
            >
              <div
                style={{
                  background: 'var(--ws-glass-bg)',
                  border: '1px solid var(--ws-glass-border)',
                  borderRadius: 'var(--ws-radius-md)',
                  padding: '10px 12px',
                  minWidth: 0,
                }}
              >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--ws-text-3)',
                    marginBottom: 4,
                  }}
                >
                  Pontuação de IA
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--ws-text-1)', lineHeight: 1 }}>
                    {data.scoreIA}/100
                  </div>
                  <BadgePill label={scoreBadge.label} bg={scoreBadge.bg} border={scoreBadge.border} color={scoreBadge.color} />
                </div>
              </div>

              <div
                style={{
                  background: 'var(--ws-glass-bg)',
                  border: '1px solid var(--ws-glass-border)',
                  borderRadius: 'var(--ws-radius-md)',
                  padding: '10px 12px',
                  minWidth: 0,
                }}
              >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--ws-text-3)',
                    marginBottom: 4,
                  }}
                >
                  Posição
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--ws-text-1)', lineHeight: 1 }}>
                  #{data.rankInPeriod} de {data.totalInPeriod}
                </div>
              </div>
            </div>
          </section>

          {data.trend.length >= 3 ? <TrendSparkline trend={data.trend} /> : null}

          <FrequencyPanel reach={data.reach} frequencia={data.frequencia} />

          {data.assetType === 'VIDEO' ? <VideoMetricsPanel videoMetrics={data.videoMetrics} /> : null}

          {data.platforms.length ? (
            <Panel title="Distribuição por plataforma" icon={<Layers3 size={14} />} accent="var(--ws-blue)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.platforms.map((platform) => (
                  <PlatformRow key={platform.platform} platform={platform} />
                ))}
              </div>
            </Panel>
          ) : null}

          {data.qualityRankings?.length ? (
            <Panel title="Rankings de qualidade" icon={<Layers3 size={14} />} accent="var(--ws-gold)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.qualityRankings.map((ranking) => (
                  <QualityRow key={ranking.type} ranking={ranking} />
                ))}
              </div>
            </Panel>
          ) : null}

          {data.aiInsight ? <InsightPanel insight={data.aiInsight} /> : null}
        </div>
      </div>
    </section>
  )
}
