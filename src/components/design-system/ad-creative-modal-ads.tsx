'use client'

import { useState, type ReactNode } from 'react'
import {
  ExternalLink,
  Image as ImageIcon,
  Layers3,
  Link2,
  Play,
  Sparkles,
  Target,
  Video,
  X,
} from 'lucide-react'
import { formatarMoeda, formatarNumero, formatarPorcentagem } from '@/lib/formatar'
import { proxyImagem } from '@/lib/imagem-proxy'
import {
  InsightPanel,
  VideoMetricsPanel,
  makeFallbackPoster,
  type AIInsight,
  type VideoMetrics,
} from '@/components/design-system/ad-creative-modal-overview'

export type DiagnosticStatus = 'Saudável' | 'Atenção' | 'Crítico'
export type GargaloType = 'CTR' | 'CVR' | 'Frequência' | 'HookRate' | 'HoldRate'

export interface DiagnosticSignal {
  label: string
  value: string
  status: DiagnosticStatus
  delta?: string
}

export interface FunnelDiagnostic {
  impressions: number
  clicks: number
  leads: number
  ctr: number
  cvr: number
  ctrStatus: DiagnosticStatus
  cvrStatus: DiagnosticStatus
  gargalo?: GargaloType
}

export interface TrackingField {
  key: string
  value?: string
  configured: boolean
}

export interface AdDistribution {
  campanhaId: string
  campanhaNome: string
  conjuntoId: string
  conjuntoNome: string
  status: 'Ativo' | 'Pausado' | 'Desativado'
  leads: number
  cpl: number
  spend: number
}

export type AdsInsight = AIInsight & {
  rootCause: string
}

export interface AdCreativeModalAdsData {
  id: string
  adId: string
  name: string
  status: 'Ativo' | 'Pausado' | 'Desativado'
  assetType: 'IMAGE' | 'VIDEO'
  imageUrl: string
  metaUrl?: string
  diasRodando: number

  campanha: { id: string; name: string }
  conjunto: { id: string; name: string }
  campanhaUrl?: string
  conjuntoUrl?: string

  diagnosticStatus: DiagnosticStatus
  signals: DiagnosticSignal[]
  funnel: FunnelDiagnostic
  videoMetrics?: VideoMetrics

  tracking: TrackingField[]
  trackingScore: { configured: number; total: number }

  distribution: AdDistribution[]

  aiInsight?: AdsInsight
}

function statusVisual(status: AdCreativeModalAdsData['status']) {
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

function assetVisual(assetType: AdCreativeModalAdsData['assetType']) {
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

function diagnosticVisual(status: DiagnosticStatus) {
  switch (status) {
    case 'Saudável':
      return {
        bg: 'var(--ws-green-soft)',
        border: 'rgba(15,168,86,0.24)',
        color: 'var(--ws-green)',
        icon: '✓',
      }
    case 'Atenção':
      return {
        bg: 'var(--ws-gold-soft)',
        border: 'rgba(242,101,34,0.24)',
        color: 'var(--ws-gold)',
        icon: '⚠',
      }
    case 'Crítico':
      return {
        bg: 'var(--ws-coral-soft)',
        border: 'rgba(255,92,141,0.24)',
        color: 'var(--ws-coral)',
        icon: '⚠',
      }
  }

  return {
    bg: 'var(--ws-surface-2)',
    border: 'var(--ws-divider)',
    color: 'var(--ws-text-2)',
    icon: '✓',
  }
}

function signalVisual(status: DiagnosticStatus) {
  switch (status) {
    case 'Saudável':
      return {
        bg: 'var(--ws-green-soft)',
        border: 'rgba(15,168,86,0.24)',
        color: 'var(--ws-green)',
      }
    case 'Atenção':
      return {
        bg: 'var(--ws-gold-soft)',
        border: 'rgba(242,101,34,0.24)',
        color: 'var(--ws-gold)',
      }
    case 'Crítico':
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

function funnelStatusVisual(status: DiagnosticStatus) {
  return signalVisual(status)
}

function daysRunningVisual(days: number) {
  if (days < 7) {
    return {
      bg: 'var(--ws-surface-2)',
      border: 'var(--ws-divider)',
      color: 'var(--ws-text-2)',
      label: 'Novo',
    }
  }

  if (days <= 30) {
    return {
      bg: 'var(--ws-blue-soft)',
      border: 'rgba(62,91,255,0.22)',
      color: 'var(--ws-blue)',
      label: 'Em andamento',
    }
  }

  if (days <= 60) {
    return {
      bg: 'var(--ws-gold-soft)',
      border: 'rgba(242,101,34,0.24)',
      color: 'var(--ws-gold)',
      label: 'Atenção: vida longa',
    }
  }

  return {
    bg: 'var(--ws-coral-soft)',
    border: 'rgba(255,92,141,0.24)',
    color: 'var(--ws-coral)',
    label: 'Risco de fadiga',
  }
}

function trackingCoverageVisual(configured: number, total: number) {
  if (configured >= total) {
    return {
      bg: 'var(--ws-green-soft)',
      border: 'rgba(15,168,86,0.24)',
      color: 'var(--ws-green)',
      label: 'Completo',
    }
  }

  if (configured >= 4) {
    return {
      bg: 'var(--ws-gold-soft)',
      border: 'rgba(242,101,34,0.24)',
      color: 'var(--ws-gold)',
      label: 'Parcial',
    }
  }

  return {
    bg: 'var(--ws-coral-soft)',
    border: 'rgba(255,92,141,0.24)',
    color: 'var(--ws-coral)',
    label: 'Incompleto',
  }
}

function gargaloLabel(gargalo?: GargaloType) {
  switch (gargalo) {
    case 'CTR':
      return 'CTR abaixo da média'
    case 'CVR':
      return 'CVR abaixo da média'
    case 'Frequência':
      return 'Frequência em atenção'
    case 'HookRate':
      return 'Hook rate baixo'
    case 'HoldRate':
      return 'Hold rate baixo'
    default:
      return 'Sinal em atenção'
  }
}

function resolveDiagnosticStatus(signals: DiagnosticSignal[]) {
  if (signals.some((signal) => signal.status === 'Crítico')) {
    return 'Crítico'
  }

  const attentionCount = signals.filter((signal) => signal.status === 'Atenção').length
  if (attentionCount >= 2) {
    return 'Atenção'
  }

  return 'Saudável'
}

function resolveFunnelStatus(type: 'CTR' | 'CVR', value: number): DiagnosticStatus {
  if (type === 'CTR') {
    if (value < 1) return 'Crítico'
    if (value <= 2) return 'Atenção'
    return 'Saudável'
  }

  if (value < 5) return 'Crítico'
  if (value <= 8) return 'Atenção'
  return 'Saudável'
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

function SignalTile({ signal }: { signal: DiagnosticSignal }) {
  const visual = signalVisual(signal.status)

  return (
    <div
      style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderTop: `2px solid ${visual.color}`,
        borderRadius: 'var(--ws-radius-md)',
        padding: '10px 12px',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--ws-text-3)',
            minWidth: 0,
          }}
        >
          {signal.label}
        </div>
        <BadgePill label={signal.status} bg={visual.bg} border={visual.border} color={visual.color} />
      </div>

      <div
        style={{
          marginTop: 4,
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: visual.color,
          wordBreak: 'break-word',
        }}
      >
        {signal.value}
      </div>

      {signal.delta ? (
        <div
          style={{
            marginTop: 7,
            fontSize: 11,
            color: 'var(--ws-text-3)',
            lineHeight: 1.45,
            wordBreak: 'break-word',
          }}
        >
          {signal.delta}
        </div>
      ) : null}
    </div>
  )
}

function FunnelStage({
  label,
  value,
  status,
}: {
  label: string
  value: number | string
  status: DiagnosticStatus
}) {
  const visual = funnelStatusVisual(status)

  return (
    <div
      style={{
        flex: '1 1 168px',
        minWidth: 0,
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderTop: `2px solid ${visual.color}`,
        borderRadius: 'var(--ws-radius-md)',
        padding: '10px 12px',
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
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: visual.color,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function FunnelArrow({
  label,
  status,
}: {
  label: string
  status: DiagnosticStatus
}) {
  const visual = funnelStatusVisual(status)

  return (
    <div
      style={{
        flex: '0 0 auto',
        alignSelf: 'center',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 9999,
        border: `1px solid ${visual.border}`,
        background: visual.bg,
        color: visual.color,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      →
      {label}
    </div>
  )
}

function TrackingRow({ field }: { field: TrackingField }) {
  const isUrl = field.key === 'URL Destino'
  const value = field.value?.trim()
  const valueIsUrl = Boolean(value && /^https?:\/\//i.test(value))

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
        gap: 10,
      }}
    >
      <div style={{ minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>{field.key}</div>

      <div
        style={{
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          justifyContent: 'flex-end',
          flex: '1 1 0%',
        }}
      >
        {field.configured && value ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--ws-green)', flexShrink: 0 }}>✓</span>
            {isUrl && valueIsUrl ? (
              <a
                href={value}
                target="_blank"
                rel="noreferrer"
                style={{
                  minWidth: 0,
                  maxWidth: '100%',
                  fontSize: 12,
                  color: 'var(--ws-blue)',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  overflow: 'hidden',
                }}
              >
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {value}
                </span>
                <ExternalLink size={12} style={{ flexShrink: 0 }} />
              </a>
            ) : (
              <span
                style={{
                  minWidth: 0,
                  fontSize: 12,
                  color: 'var(--ws-text-2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {value}
              </span>
            )}
          </>
        ) : (
          <>
            <span style={{ fontSize: 12, color: 'var(--ws-coral)', flexShrink: 0 }}>✕</span>
            <span style={{ fontSize: 12, color: 'var(--ws-coral)' }}>não configurado</span>
          </>
        )}
      </div>
    </div>
  )
}

function DistributionRow({ item }: { item: AdDistribution }) {
  const visual = statusVisual(item.status)

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
        gap: 10,
        opacity: item.status === 'Pausado' || item.status === 'Desativado' ? 0.6 : 1,
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ws-text-1)',
            lineHeight: 1.35,
            wordBreak: 'break-word',
          }}
        >
          {item.campanhaNome} <span style={{ color: 'var(--ws-text-3)' }}>›</span> {item.conjuntoNome}
        </div>
        <div
          style={{
            marginTop: 5,
            fontSize: 12,
            color: 'var(--ws-text-2)',
            lineHeight: 1.45,
          }}
        >
          Leads: <strong style={{ color: 'var(--ws-text-1)' }}>{formatarNumero(item.leads)}</strong> · CPL:{' '}
          <strong style={{ color: 'var(--ws-text-1)' }}>{formatarMoeda(item.cpl)}</strong>
        </div>
      </div>

      <BadgePill label={item.status} bg={visual.bg} border={visual.border} color={visual.color} />
    </div>
  )
}

function truncateBreadcrumb(name: string) {
  return name.length > 40 ? `${name.slice(0, 40)}…` : name
}

function buildCampaignLink(url?: string, children?: ReactNode) {
  if (!url) {
    return children
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        color: 'var(--ws-blue)',
        textDecoration: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
      }}
    >
      {children}
    </a>
  )
}

export function AdCreativeModalAds({ data }: { data: AdCreativeModalAdsData }) {
  const statusBadge = statusVisual(data.status)
  const assetBadge = assetVisual(data.assetType)
  const diagnosticStatus = data.signals.length ? resolveDiagnosticStatus(data.signals) : data.diagnosticStatus
  const diagnosticBadge = diagnosticVisual(diagnosticStatus)
  const daysBadge = daysRunningVisual(data.diasRodando)
  const trackingBadge = trackingCoverageVisual(data.trackingScore.configured, data.trackingScore.total)
  const previewFallback = makeFallbackPoster(data.name, data.assetType)
  const [previewSrc, setPreviewSrc] = useState(
    data.imageUrl.startsWith('/mock/') ? previewFallback : proxyImagem(data.imageUrl) ?? data.imageUrl,
  )

  const funnelCtrStatus = resolveFunnelStatus('CTR', data.funnel.ctr)
  const funnelCvrStatus = resolveFunnelStatus('CVR', data.funnel.cvr)
  const sortedDistribution = [...data.distribution].sort((a, b) => b.leads - a.leads)

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
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--ws-text-2)',
              lineHeight: 1.5,
            }}
          >
            <span style={{ minWidth: 0 }}>
              {buildCampaignLink(
                data.campanhaUrl,
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {truncateBreadcrumb(data.campanha.name)}
                  </span>
                </span>,
              )}
              <span style={{ margin: '0 6px', color: 'var(--ws-text-3)' }}>›</span>
              {buildCampaignLink(
                data.conjuntoUrl,
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {truncateBreadcrumb(data.conjunto.name)}
                  </span>
                </span>,
              )}
            </span>
            <span style={{ color: 'var(--ws-text-3)' }}>·</span>
            <span style={{ minWidth: 0 }}>Rodando há {data.diasRodando} dias</span>
            <BadgePill label={daysBadge.label} bg={daysBadge.bg} border={daysBadge.border} color={daysBadge.color} />
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
                  objectFit: 'cover',
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
          <Panel title="Painel de diagnóstico" icon={<Sparkles size={14} />} accent={diagnosticBadge.color}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 13, color: 'var(--ws-text-2)' }}>Status geral:</div>
              <BadgePill
                label={diagnosticStatus}
                bg={diagnosticBadge.bg}
                border={diagnosticBadge.border}
                color={diagnosticBadge.color}
                icon={diagnosticBadge.icon}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 10,
              }}
            >
              {data.signals.map((signal) => (
                <SignalTile key={signal.label} signal={signal} />
              ))}
            </div>
          </Panel>

          <Panel title="Funil de diagnóstico" icon={<Target size={14} />} accent="var(--ws-blue)">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                alignItems: 'stretch',
                marginBottom: 12,
              }}
            >
              <FunnelStage
                label="Impressões"
                value={formatarNumero(data.funnel.impressions)}
                status="Saudável"
              />
              <FunnelArrow
                label={`${formatarPorcentagem(data.funnel.ctr)} CTR`}
                status={funnelCtrStatus}
              />
              <FunnelStage
                label="Cliques"
                value={formatarNumero(data.funnel.clicks)}
                status={funnelCtrStatus}
              />
              <FunnelArrow
                label={`${formatarPorcentagem(data.funnel.cvr)} CVR`}
                status={funnelCvrStatus}
              />
              <FunnelStage
                label="Leads"
                value={formatarNumero(data.funnel.leads)}
                status={funnelCvrStatus}
              />
            </div>

            <div style={{ fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.55, marginBottom: 10 }}>
              Gargalo detectado:
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <BadgePill
                label={`CTR ${funnelCtrStatus.toLowerCase()}`}
                bg={funnelStatusVisual(funnelCtrStatus).bg}
                border={funnelStatusVisual(funnelCtrStatus).border}
                color={funnelStatusVisual(funnelCtrStatus).color}
              />
              <BadgePill
                label={`⚠ ${gargaloLabel(data.funnel.gargalo)}`}
                bg={funnelStatusVisual(funnelCvrStatus).bg}
                border={funnelStatusVisual(funnelCvrStatus).border}
                color={funnelStatusVisual(funnelCvrStatus).color}
              />
            </div>
          </Panel>

          {data.assetType === 'VIDEO' ? <VideoMetricsPanel videoMetrics={data.videoMetrics} /> : null}

          <Panel title="Auditoria de tracking" icon={<Link2 size={14} />} accent="var(--ws-purple)">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 13, color: 'var(--ws-text-2)' }}>
                Cobertura de tracking:{' '}
                <strong style={{ color: 'var(--ws-text-1)' }}>
                  {data.trackingScore.configured}/{data.trackingScore.total}
                </strong>
              </div>
              <BadgePill
                label={trackingBadge.label}
                bg={trackingBadge.bg}
                border={trackingBadge.border}
                color={trackingBadge.color}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.tracking.map((field) => (
                <TrackingRow key={field.key} field={field} />
              ))}
            </div>
          </Panel>

          {sortedDistribution.length > 1 ? (
            <Panel title="Distribuição" icon={<Layers3 size={14} />} accent="var(--ws-blue)">
              <div style={{ fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.55, marginBottom: 12 }}>
                Onde este ad está rodando
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sortedDistribution.map((item) => (
                  <DistributionRow key={`${item.campanhaId}-${item.conjuntoId}`} item={item} />
                ))}
              </div>
            </Panel>
          ) : null}

          {data.aiInsight ? (
            <InsightPanel
              title="IA acionável"
              insight={data.aiInsight}
              afterContent={
                <div
                  style={{
                    paddingTop: 10,
                    borderTop: '1px solid var(--ws-divider)',
                    fontSize: 12,
                    color: 'var(--ws-text-2)',
                    lineHeight: 1.6,
                    fontStyle: 'italic',
                  }}
                >
                  <span style={{ color: 'var(--ws-text-1)', fontStyle: 'inherit', fontWeight: 600 }}>
                    Causa identificada:
                  </span>{' '}
                  {data.aiInsight.rootCause}
                </div>
              }
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}
