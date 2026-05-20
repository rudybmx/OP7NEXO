'use client'

import { useState, type ReactNode } from 'react'
import { Image as ImageIcon, LayoutGrid, Megaphone, Target, Video, Sparkles } from 'lucide-react'
import {
  AdCreativeModalAds,
  type AdCreativeModalAdsData,
} from '@/components/design-system/ad-creative-modal-ads'
import {
  AdCreativeModalOverview,
  type AdCreativeModalOverviewData,
} from '@/components/design-system/ad-creative-modal-overview'
import {
  AdCreativeModalCampaign,
  type AdCreativeModalCampaignData,
} from '@/components/design-system/ad-creative-modal-campaign'

type DemoVariant = 'overview' | 'campaign' | 'ads'

type VariantItem = {
  id: DemoVariant
  label: string
  description: string
  icon: ReactNode
  disabled?: boolean
}

const VARIANTS: VariantItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Prévia com imagem, vídeo, rankings e insight de IA.',
    icon: <LayoutGrid size={14} />,
  },
  {
    id: 'campaign',
    label: 'Campaign',
    description: 'Contexto de campanha, conjunto e comparativo do grupo.',
    icon: <Target size={14} />,
  },
  {
    id: 'ads',
    label: 'Ads',
    description: 'Diagnóstico, tracking e causa raiz do anúncio.',
    icon: <Megaphone size={14} />,
  },
]

const mockOverview: AdCreativeModalOverviewData = {
  id: 'creative-001',
  name: 'ODC / dentista / maior rede',
  status: 'Ativo',
  assetType: 'IMAGE',
  imageUrl: '/mock/creative-001.jpg',
  metaUrl: 'https://www.facebook.com/ads/...',
  period: 'últimos 7 dias',
  rankInPeriod: 1,
  totalInPeriod: 5,

  leads: {
    value: 128,
    formatted: '128',
    delta: {
      value: 23.4,
      direction: 'up',
      isPositive: true,
      label: 'em relação ao período anterior',
    },
  },
  cpl: {
    value: 42.37,
    formatted: 'R$ 42,37',
    delta: {
      value: 21.1,
      direction: 'up',
      isPositive: false,
      label: 'em relação à meta de R$ 35',
    },
  },
  ctr: {
    value: 3.8,
    formatted: '3,8%',
    delta: {
      value: 0.4,
      direction: 'up',
      isPositive: true,
      label: 'em relação à média da conta',
    },
  },
  spend: {
    value: 5423.32,
    formatted: 'R$ 5.423,32',
  },
  scoreIA: 86,

  trend: [
    { date: '2026-05-06', cpl: 38.2, leads: 8 },
    { date: '2026-05-07', cpl: 40.1, leads: 11 },
    { date: '2026-05-08', cpl: 39.5, leads: 14 },
    { date: '2026-05-09', cpl: 41.2, leads: 18 },
    { date: '2026-05-10', cpl: 43.8, leads: 22 },
    { date: '2026-05-11', cpl: 44.1, leads: 19 },
    { date: '2026-05-12', cpl: 42.37, leads: 16 },
  ],

  reach: 48320,
  frequencia: 2.4,

  platforms: [
    { platform: 'Instagram', leads: 82, cpl: 38.2, ctr: 4.1, spend: 3133.24 },
    { platform: 'Facebook', leads: 46, cpl: 51.09, ctr: 2.9, spend: 2350.14 },
  ],

  qualityRankings: [
    { type: 'Quality', rank: 'Above Average' },
    { type: 'Engagement', rank: 'Average' },
    { type: 'Conversion', rank: 'Above Average' },
  ],

  aiInsight: {
    text:
      'CTR acima da média da conta (+0.4pp). CPL 21% acima da meta — puxado pelo Facebook. Frequência em zona de atenção, mas o alcance ainda está saudável. Recomendação: aguardar 48h. Se o CPL não ceder, reduzir o orçamento no Facebook e manter o Instagram.',
    recommendation: 'Aguardar',
    confidence: 78,
  },
}

const mockVideo: AdCreativeModalOverviewData = {
  ...mockOverview,
  assetType: 'VIDEO',
  imageUrl: '/mock/creative-001-video.jpg',
  videoMetrics: {
    hookRate: 0.0,
    holdRate: 19.2,
    ctrLink: 3.7,
    retention: [
      { checkpoint: '3s', value: 0 },
      { checkpoint: '25%', value: 38 },
      { checkpoint: '50%', value: 20 },
      { checkpoint: '75%', value: 15 },
      { checkpoint: '100%', value: 9 },
    ],
  },
}

const mockCampaign: AdCreativeModalCampaignData = {
  id: 'creative-001',
  adId: '120242675117640661',
  name: 'ODC / dentista / maior rede',
  status: 'Ativo',
  assetType: 'IMAGE',
  imageUrl: '/mock/creative-001.jpg',
  metaUrl: 'https://www.facebook.com/ads/...',

  campanha: {
    id: '120242675117640661',
    name: 'ODC / LEADS / WhatsApp / PR / mar26',
  },
  conjunto: {
    id: '120242595960400661',
    name: 'PR | WhatsApp | teste 3 / 30+',
  },
  campanhaUrl: 'https://www.facebook.com/adsmanager/manage/campaigns',
  conjuntoUrl: 'https://www.facebook.com/adsmanager/manage/adsets',

  leads: 82,
  cpl: 38.2,
  ctr: 4.1,
  spend: 3133.24,
  linkClicks: 214,

  comparativo: [
    {
      adId: '120242675117640661',
      name: 'ODC / dentista / maior rede',
      thumbnailUrl: '/mock/creative-001.jpg',
      isCurrentAd: true,
      leads: 82,
      cpl: 38.2,
      ctr: 4.1,
      spend: 3133.24,
      status: 'Ativo',
    },
    {
      adId: '120242675117640662',
      name: 'ODC / dentista / 1.4',
      thumbnailUrl: '/mock/creative-002.jpg',
      isCurrentAd: false,
      leads: 46,
      cpl: 51.09,
      ctr: 2.9,
      spend: 2350.14,
      status: 'Ativo',
    },
    {
      adId: '120242675117640663',
      name: 'ODC / dentista / franquia',
      thumbnailUrl: '/mock/creative-003.jpg',
      isCurrentAd: false,
      leads: 21,
      cpl: 89.43,
      ctr: 1.4,
      spend: 1878.03,
      status: 'Pausado',
    },
  ],

  destinationUrl: 'https://wa.me/5511999999999',
  utmSource: 'facebook',
  utmMedium: 'paid',
  utmCampaign: 'odc-leads-pr-mar26',
  utmContent: 'dentista-maior-rede',

  platforms: [
    { platform: 'Instagram', leads: 62, cpl: 35.4, ctr: 4.6, spend: 2194.8 },
    { platform: 'Facebook', leads: 20, cpl: 46.92, ctr: 2.9, spend: 938.4 },
  ],
}

const mockAds: AdCreativeModalAdsData = {
  id: 'creative-001',
  adId: '120242675117640661',
  name: 'ODC / dentista / maior rede',
  status: 'Ativo',
  assetType: 'VIDEO',
  imageUrl: '/mock/creative-001.jpg',
  metaUrl: 'https://www.facebook.com/ads/...',
  diasRodando: 23,

  campanha: {
    id: '120242675117640661',
    name: 'ODC / LEADS / WhatsApp / PR / mar26',
  },
  conjunto: {
    id: '120242595960400661',
    name: 'PR | WhatsApp | teste 3 / 30+',
  },
  campanhaUrl: 'https://www.facebook.com/adsmanager/manage/campaigns',
  conjuntoUrl: 'https://www.facebook.com/adsmanager/manage/adsets',

  diagnosticStatus: 'Atenção',
  signals: [
    {
      label: 'CPL',
      value: 'R$ 42,37',
      status: 'Atenção',
      delta: '+21% vs meta R$35',
    },
    {
      label: 'CTR',
      value: '3,8%',
      status: 'Saudável',
      delta: '+0,4pp vs média da conta',
    },
    {
      label: 'Frequência',
      value: '2,4',
      status: 'Atenção',
      delta: 'zona de cuidado',
    },
    {
      label: 'Pontuação IA',
      value: '86/100',
      status: 'Saudável',
    },
  ],

  funnel: {
    impressions: 48320,
    clicks: 1834,
    leads: 128,
    ctr: 3.8,
    cvr: 6.98,
    ctrStatus: 'Saudável',
    cvrStatus: 'Atenção',
    gargalo: 'CVR',
  },

  videoMetrics: {
    hookRate: 0.0,
    holdRate: 19.2,
    ctrLink: 3.7,
    retention: [
      { checkpoint: '3s', value: 0 },
      { checkpoint: '25%', value: 38 },
      { checkpoint: '50%', value: 20 },
      { checkpoint: '75%', value: 15 },
      { checkpoint: '100%', value: 9 },
    ],
  },

  tracking: [
    { key: 'URL Destino', value: 'https://wa.me/5511999999999', configured: true },
    { key: 'utm_source', value: 'facebook', configured: true },
    { key: 'utm_medium', value: 'paid', configured: true },
    { key: 'utm_campaign', value: 'odc-leads-pr-mar26', configured: true },
    { key: 'utm_content', configured: false },
    { key: 'utm_term', configured: false },
  ],
  trackingScore: { configured: 4, total: 6 },

  distribution: [
    {
      campanhaId: '120242675117640661',
      campanhaNome: 'ODC / LEADS / WhatsApp / PR / mar26',
      conjuntoId: '120242595960400661',
      conjuntoNome: 'PR | WhatsApp | teste 3 / 30+',
      status: 'Ativo',
      leads: 82,
      cpl: 38.2,
      spend: 3133.24,
    },
    {
      campanhaId: '120242675117640662',
      campanhaNome: 'ODC / LEADS / WhatsApp / SP / Abril 26',
      conjuntoId: '120242595960400662',
      conjuntoNome: 'SP | WhatsApp | 25-45',
      status: 'Pausado',
      leads: 12,
      cpl: 67.4,
      spend: 808.8,
    },
  ],

  aiInsight: {
    text:
      'CTR saudável indica criativo com boa atenção. O gargalo está na conversão (CVR 6,9% abaixo da média de 9,2%). Frequência em zona de atenção mas não crítica. Recomendação: testar nova landing page ou CTA antes de pausar.',
    recommendation: 'Aguardar',
    rootCause: 'CVR baixo sugere atrito na página de destino, não no criativo',
    confidence: 81,
  },
}

function VariantButton({
  active,
  disabled,
  icon,
  label,
  description,
  onClick,
}: {
  active: boolean
  disabled?: boolean
  icon: ReactNode
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: '1 1 240px',
        minWidth: 0,
        border: `1px solid ${
          active ? 'rgba(62,91,255,0.28)' : 'var(--ws-glass-border)'
        }`,
        background: active ? 'var(--ws-blue-soft)' : 'var(--ws-glass-bg)',
        borderRadius: 'var(--ws-radius-lg)',
        padding: 14,
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: 'var(--ws-text-1)',
        boxShadow: active ? 'var(--ws-glass-shadow-sm)' : 'none',
        transition: 'var(--ws-transition)',
        opacity: disabled && !active ? 0.68 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 9,
            background: active ? 'white' : 'var(--ws-surface-2)',
            border: '1px solid var(--ws-divider)',
            color: active ? 'var(--ws-blue)' : 'var(--ws-text-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ws-text-1)' }}>{label}</div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--ws-text-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {disabled ? 'Em breve' : 'Variante'}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.55 }}>{description}</div>
    </button>
  )
}

function PreviewButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        flex: '0 1 180px',
        minWidth: 0,
        border: `1px solid ${active ? 'rgba(62,91,255,0.28)' : 'var(--ws-divider)'}`,
        background: active ? 'var(--ws-blue-soft)' : 'var(--ws-surface-2)',
        borderRadius: 9999,
        padding: '10px 14px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        color: 'var(--ws-text-1)',
        boxShadow: active ? 'var(--ws-glass-shadow-sm)' : 'none',
        transition: 'var(--ws-transition)',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 9999,
          background: active ? 'white' : 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-divider)',
          color: active ? 'var(--ws-blue)' : 'var(--ws-text-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
    </button>
  )
}

export default function ModalAnunciosDesignSystemPage() {
  const [variant, setVariant] = useState<DemoVariant>('overview')
  const [previewAsset, setPreviewAsset] = useState<'IMAGE' | 'VIDEO'>('IMAGE')
  const activeVariantLabel = variant === 'overview' ? 'Overview' : variant === 'campaign' ? 'Campaign' : 'Ads'
  const showAssetSwitcher = variant === 'overview'

  return (
    <div
      style={{
        minHeight: '100%',
        padding: '28px clamp(18px, 3vw, 32px) 36px',
        background: 'var(--ws-page-bg)',
      }}
    >
      <div style={{ maxWidth: 1500, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div
          style={{
            background: 'var(--ws-glass-bg)',
            border: '1px solid var(--ws-glass-border)',
            borderRadius: 'var(--ws-radius-lg)',
            backdropFilter: 'blur(16px)',
            boxShadow: 'var(--ws-glass-shadow)',
            padding: 20,
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
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
            }}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0, maxWidth: 860 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 9px',
                    borderRadius: 9999,
                    border: '1px solid rgba(62,91,255,0.20)',
                    background: 'var(--ws-blue-soft)',
                    color: 'var(--ws-blue)',
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  <Sparkles size={12} />
                  Sistema de design
                </span>
              </div>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, color: 'var(--ws-text-1)', lineHeight: 1.15 }}>
                AdCreativeModal
              </h1>
              <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ws-text-2)', lineHeight: 1.7, maxWidth: 780 }}>
                Prévia encaixada da variante <strong style={{ color: 'var(--ws-text-1)' }}>{activeVariantLabel}</strong>.
                Overview cobre imagem e vídeo; Campaign mostra o comparativo do conjunto; Ads traz diagnóstico, tracking e causa raiz.
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--ws-glass-bg)',
            border: '1px solid var(--ws-glass-border)',
            borderRadius: 'var(--ws-radius-lg)',
            backdropFilter: 'blur(16px)',
            boxShadow: 'var(--ws-glass-shadow)',
            padding: 18,
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
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
            }}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {VARIANTS.map((item) => (
              <VariantButton
                key={item.id}
                active={variant === item.id}
                disabled={item.disabled}
                icon={item.icon}
                label={item.label}
                description={item.description}
                onClick={() => setVariant(item.id)}
              />
            ))}
          </div>
        </div>

        {showAssetSwitcher ? (
          <div
            style={{
              background: 'var(--ws-glass-bg)',
              border: '1px solid var(--ws-glass-border)',
              borderRadius: 'var(--ws-radius-lg)',
              backdropFilter: 'blur(16px)',
              boxShadow: 'var(--ws-glass-shadow)',
              padding: 18,
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
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
              }}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--ws-text-3)',
                    marginBottom: 6,
                  }}
                >
                  Estado da prévia
                </div>
                <div style={{ fontSize: 13, color: 'var(--ws-text-2)', lineHeight: 1.55 }}>
                  Alterna entre os estados de imagem e vídeo para validar a renderização da seção condicional.
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <PreviewButton
                  active={previewAsset === 'IMAGE'}
                  icon={<ImageIcon size={13} />}
                  label="Imagem"
                  onClick={() => setPreviewAsset('IMAGE')}
                />
                <PreviewButton
                  active={previewAsset === 'VIDEO'}
                  icon={<Video size={13} />}
                  label="Vídeo"
                  onClick={() => setPreviewAsset('VIDEO')}
                />
              </div>
            </div>
          </div>
        ) : null}

        <div style={{ maxWidth: 1380, width: '100%', margin: '0 auto' }}>
          {variant === 'campaign' ? (
            <AdCreativeModalCampaign data={mockCampaign} />
          ) : variant === 'ads' ? (
            <AdCreativeModalAds data={mockAds} />
          ) : (
            <AdCreativeModalOverview key={previewAsset} data={previewAsset === 'VIDEO' ? mockVideo : mockOverview} />
          )}
        </div>
      </div>
    </div>
  )
}
