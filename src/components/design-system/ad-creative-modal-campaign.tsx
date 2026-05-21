'use client'

import { useState, type ReactNode } from 'react'
import {
  BarChart3,
  ExternalLink,
  Image as ImageIcon,
  Layers3,
  Link2,
  Play,
  Target,
  Video,
  X,
} from 'lucide-react'
import { formatarMoeda, formatarNumero, formatarPorcentagem } from '@/lib/formatar'
import { proxyImagem } from '@/lib/imagem-proxy'
import { makeFallbackPoster } from '@/components/design-system/ad-creative-modal-overview'

export interface CreativeComparativo {
  adId: string
  name: string
  thumbnailUrl: string
  isCurrentAd: boolean
  leads: number
  cpl: number
  ctr: number
  spend: number
  status: 'Ativo' | 'Pausado' | 'Desativado'
}

export interface AdCreativeModalCampaignData {
  id: string
  adId: string
  name: string
  status: 'Ativo' | 'Pausado' | 'Desativado'
  assetType: 'IMAGE' | 'VIDEO'
  imageUrl: string
  metaUrl?: string

  campanha: { id: string; name: string }
  conjunto: { id: string; name: string }
  campanhaUrl?: string
  conjuntoUrl?: string

  leads: number
  cpl: number
  ctr: number
  spend: number
  linkClicks: number

  comparativo: CreativeComparativo[]

  headline?: string
  destinationUrl?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string

  platforms: {
    platform: 'Instagram' | 'Facebook'
    leads: number
    cpl: number
    ctr: number
    spend: number
  }[]
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function makeFallbackThumbnail(name: string) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" fill="none">
      <defs>
        <linearGradient id="bg" x1="18" y1="16" x2="144" y2="146" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="rgba(62,91,255,1)" />
          <stop offset="1" stop-color="rgba(122,90,248,1)" />
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="28" fill="url(#bg)" />
      <circle cx="126" cy="34" r="24" fill="rgba(255,255,255,0.16)" />
      <circle cx="36" cy="126" r="24" fill="rgba(255,255,255,0.10)" />
      <text x="80" y="95" text-anchor="middle" fill="white" font-size="42" font-weight="700" letter-spacing="1">${escapeXml(initials || 'AD')}</text>
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function statusVisual(status: AdCreativeModalCampaignData['status']) {
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
    default:
      return {
        bg: 'var(--ws-surface-2)',
        border: 'var(--ws-divider)',
        color: 'var(--ws-text-2)',
      }
  }
}

function assetVisual(assetType: AdCreativeModalCampaignData['assetType']) {
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

function PanelShell({
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

function DetailField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        background: 'var(--ws-surface-2)',
        border: '1px solid var(--ws-divider)',
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
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--ws-text-1)',
          lineHeight: 1.45,
          wordBreak: 'break-word',
          minWidth: 0,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function CampaignMetricTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: string
}) {
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
    </div>
  )
}

function CampaignBreadcrumb({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={typeof children === 'string' ? children : undefined}
      style={{
        display: 'inline-block',
        maxWidth: '40ch',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: 'var(--ws-blue)',
        textDecoration: 'none',
        fontWeight: 600,
      }}
    >
      {children}
    </a>
  )
}

function CampaignThumb({
  src,
  name,
  assetType,
}: {
  src: string
  name: string
  assetType: AdCreativeModalCampaignData['assetType']
}) {
  const fallback = assetType === 'VIDEO' ? makeFallbackPoster(name, assetType) : makeFallbackThumbnail(name)
  const [thumbSrc, setThumbSrc] = useState(src.startsWith('/mock/') ? fallback : proxyImagem(src) ?? src)

  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 11,
        overflow: 'hidden',
        border: '1px solid var(--ws-divider)',
        background: 'linear-gradient(180deg, rgba(14,20,42,0.06), rgba(14,20,42,0.12))',
        flexShrink: 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbSrc}
        alt={name}
        onError={() => setThumbSrc(fallback)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
        referrerPolicy="no-referrer"
      />
    </div>
  )
}

function compareCplVisual(cpl: number, minCpl: number) {
  if (cpl <= minCpl) {
    return {
      bg: 'var(--ws-green-soft)',
      border: 'rgba(15,168,86,0.24)',
      color: 'var(--ws-green)',
    }
  }

  if (cpl <= minCpl * 1.3) {
    return {
      bg: 'var(--ws-gold-soft)',
      border: 'rgba(242,101,34,0.24)',
      color: 'var(--ws-gold)',
    }
  }

  return {
    bg: 'var(--ws-coral-soft)',
    border: 'rgba(255,92,141,0.24)',
    color: 'var(--ws-coral)',
  }
}

function statusTone(status: AdCreativeModalCampaignData['status']) {
  return statusVisual(status)
}

function ComparisonRow({
  item,
  minCpl,
  maxLeads,
  assetType,
}: {
  item: CreativeComparativo
  minCpl: number
  maxLeads: number
  assetType: AdCreativeModalCampaignData['assetType']
}) {
  const tone = compareCplVisual(item.cpl, minCpl)
  const isPaused = item.status === 'Pausado'
  const barColor = item.isCurrentAd
    ? 'var(--ws-blue)'
    : isPaused
      ? 'rgba(148,163,184,0.55)'
      : 'rgba(148,163,184,0.78)'
  const fill = maxLeads > 0 ? (item.leads / maxLeads) * 100 : 0

  return (
    <div
      style={{
        background: item.isCurrentAd ? 'var(--ws-blue-soft)' : 'var(--ws-glass-bg)',
        border: `1px solid ${item.isCurrentAd ? 'rgba(62,91,255,0.28)' : 'var(--ws-divider)'}`,
        borderLeft: item.isCurrentAd ? '3px solid var(--ws-blue)' : '3px solid transparent',
        borderRadius: 'var(--ws-radius-md)',
        padding: 12,
        opacity: isPaused ? 0.55 : 1,
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 12, alignItems: 'center' }}>
        <CampaignThumb src={item.thumbnailUrl} name={item.name} assetType={assetType} />

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--ws-text-1)',
                lineHeight: 1.25,
                wordBreak: 'break-word',
                flex: '1 1 220px',
              }}
            >
              {item.name}
            </div>
            {item.isCurrentAd ? (
              <BadgePill label="você" bg="var(--ws-blue-soft)" border="rgba(62,91,255,0.24)" color="var(--ws-blue)" />
            ) : null}
            {isPaused ? (
              <BadgePill
                label="Pausado"
                bg="var(--ws-coral-soft)"
                border="rgba(255,92,141,0.24)"
                color="var(--ws-coral)"
              />
            ) : null}
          </div>

          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <BadgePill
              label={`Leads: ${formatarNumero(item.leads)}`}
              bg="var(--ws-blue-soft)"
              border="rgba(62,91,255,0.18)"
              color="var(--ws-blue)"
            />
            <BadgePill
              label={`CPL: ${formatarMoeda(item.cpl)}`}
              bg={tone.bg}
              border={tone.border}
              color={tone.color}
            />
            <BadgePill
              label={`CTR: ${formatarPorcentagem(item.ctr)}`}
              bg="var(--ws-purple-soft)"
              border="rgba(122,90,248,0.18)"
              color="var(--ws-purple)"
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            flex: 1,
            height: 8,
            borderRadius: 9999,
            background: 'var(--ws-surface-2)',
            border: '1px solid var(--ws-divider)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${fill}%`,
              height: '100%',
              borderRadius: 9999,
              background: barColor,
              transition: 'width 280ms ease',
            }}
          />
        </div>
        <span style={{ minWidth: 54, fontSize: 11, color: 'var(--ws-text-3)', textAlign: 'right' }}>
          {Math.round(fill)}%
        </span>
      </div>
    </div>
  )
}

function TechFieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <DetailField label={label}>
      {value}
    </DetailField>
  )
}

function platformTone(platform: 'Instagram' | 'Facebook') {
  if (platform === 'Instagram') {
    return {
      bg: 'var(--ws-purple-soft)',
      border: 'rgba(122,90,248,0.22)',
      color: 'var(--ws-purple)',
    }
  }

  return {
    bg: 'var(--ws-blue-soft)',
    border: 'rgba(62,91,255,0.22)',
    color: 'var(--ws-blue)',
  }
}

export function AdCreativeModalCampaign({ data }: { data: AdCreativeModalCampaignData }) {
  const previewFallback = makeFallbackPoster(data.name, data.assetType)
  const [previewSrc, setPreviewSrc] = useState(
    data.imageUrl.startsWith('/mock/') ? previewFallback : proxyImagem(data.imageUrl) ?? data.imageUrl,
  )

  const statusBadge = statusTone(data.status)
  const assetBadge = assetVisual(data.assetType)
  const comparativo = [...data.comparativo].sort((a, b) => b.leads - a.leads)
  const maxLeads = comparativo[0]?.leads ?? 0
  const minCpl = comparativo.length ? Math.min(...comparativo.map((item) => item.cpl)) : 0
  const hasTechSheet = Boolean(
    data.headline
    || data.destinationUrl
    || data.utmSource
    || data.utmMedium
    || data.utmCampaign
    || data.utmContent
    || data.utmTerm
  )
  const hasPlatforms = data.platforms.length > 1

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
              gap: 6,
              fontSize: 12,
              color: 'var(--ws-text-2)',
              lineHeight: 1.5,
            }}
          >
            <CampaignBreadcrumb href={data.campanhaUrl ?? data.metaUrl ?? '#'}>{data.campanha.name}</CampaignBreadcrumb>
            <span aria-hidden="true">›</span>
            <CampaignBreadcrumb href={data.conjuntoUrl ?? data.metaUrl ?? '#'}>{data.conjunto.name}</CampaignBreadcrumb>
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

              <div
                style={{
                  position: 'absolute',
                  left: 12,
                  right: 12,
                  bottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 9px',
                    borderRadius: 9999,
                    background: 'rgba(255,255,255,0.90)',
                    color: 'var(--ws-text-1)',
                    fontSize: 10,
                    fontWeight: 600,
                    boxShadow: '0 8px 20px rgba(14,20,42,0.12)',
                  }}
                >
                  <Target size={12} />
                  Prévia do criativo
                </div>
              </div>
            </div>

            {data.metaUrl ? (
              <a
                href={data.metaUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 'var(--ws-radius-md)',
                  border: 'none',
                  background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: '0 6px 18px rgba(62,91,255,0.32)',
                }}
              >
                Ver peça no Meta
                <ExternalLink size={14} />
              </a>
            ) : null}
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
          <PanelShell
            title="KPIs do contexto"
            icon={<BarChart3 size={14} />}
            accent="var(--ws-blue)"
          >
            <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.5 }}>
              Métricas deste criativo neste conjunto no período selecionado.
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 10,
              }}
            >
              <CampaignMetricTile label="Leads" value={formatarNumero(data.leads)} tone="var(--ws-green)" />
              <CampaignMetricTile label="CPL" value={formatarMoeda(data.cpl)} tone="var(--ws-coral)" />
              <CampaignMetricTile label="CTR" value={formatarPorcentagem(data.ctr)} tone="var(--ws-blue)" />
              <CampaignMetricTile label="Investimento" value={formatarMoeda(data.spend)} tone="var(--ws-purple)" />
            </div>
          </PanelShell>

          <PanelShell
            title="Comparativo do conjunto"
            icon={<Layers3 size={14} />}
            accent="var(--ws-gold)"
          >
            <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.5 }}>
              {comparativo.length} criativos neste conjunto, ordenados por leads.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {comparativo.map((item) => (
                <ComparisonRow
                  key={item.adId}
                  item={item}
                  minCpl={minCpl}
                  maxLeads={maxLeads}
                  assetType={data.assetType}
                />
              ))}
            </div>
          </PanelShell>

          {hasTechSheet ? (
            <PanelShell
              title="Ficha técnica"
              icon={<Link2 size={14} />}
              accent="var(--ws-green)"
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 8,
                }}
              >
                {data.headline ? <TechFieldRow label="Headline" value={data.headline} /> : null}

                {data.destinationUrl ? (
                  <TechFieldRow
                    label="URL Destino"
                    value={
                      <a
                        href={data.destinationUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          color: 'var(--ws-blue)',
                          textDecoration: 'none',
                          width: '100%',
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {data.destinationUrl}
                        </span>
                        <ExternalLink size={12} />
                      </a>
                    }
                  />
                ) : null}

                {data.utmSource ? <TechFieldRow label="utm_source" value={data.utmSource} /> : null}
                {data.utmMedium ? <TechFieldRow label="utm_medium" value={data.utmMedium} /> : null}
                {data.utmCampaign ? <TechFieldRow label="utm_campaign" value={data.utmCampaign} /> : null}
                {data.utmContent ? <TechFieldRow label="utm_content" value={data.utmContent} /> : null}
                {data.utmTerm ? <TechFieldRow label="utm_term" value={data.utmTerm} /> : null}
              </div>
            </PanelShell>
          ) : null}

          {hasPlatforms ? (
            <PanelShell
              title="Distribuição por plataforma"
              icon={<Layers3 size={14} />}
              accent="var(--ws-blue)"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.platforms.map((platform) => {
                  const tone = platformTone(platform.platform)
                  return (
                    <div
                      key={platform.platform}
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
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ws-text-1)' }}>{platform.platform}</span>
                        <span style={{ fontSize: 12, color: 'var(--ws-text-2)' }}>Leads: {formatarNumero(platform.leads)}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        <BadgePill label={`CPL ${formatarMoeda(platform.cpl)}`} bg={tone.bg} border={tone.border} color={tone.color} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </PanelShell>
          ) : null}
        </div>
      </div>
    </section>
  )
}
