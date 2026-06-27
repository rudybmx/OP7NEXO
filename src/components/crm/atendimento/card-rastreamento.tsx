'use client'

import { IconeInstagram, IconeFacebook, detectarPlataforma } from './icones-marca'

interface CardRastreamentoProps {
  metaHeadline?: string | null
  metaBody?: string | null
  metaImageUrl?: string | null
  metaSourceUrl?: string | null
  campanhaOrigem?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  primeiraConversaAt?: string | null
}

// Azul de marca (#006EFF) — frame do cartão.
const BRAND = '0,110,255'

// Identidade de cada plataforma: ícone, cor reconhecível e rótulo.
const PLATAFORMAS = {
  instagram: { Icon: IconeInstagram, cor: '#E1306C', label: 'Veio de um anúncio no Instagram' },
  facebook: { Icon: IconeFacebook, cor: '#1877F2', label: 'Veio de um anúncio no Facebook' },
  meta: { Icon: IconeFacebook, cor: '#006EFF', label: 'Veio de um anúncio (Meta)' },
} as const

export function CardRastreamento({
  metaHeadline,
  metaBody,
  metaImageUrl,
  metaSourceUrl,
  campanhaOrigem,
  utmSource,
  utmMedium,
  utmCampaign,
  primeiraConversaAt,
}: CardRastreamentoProps) {
  const hasData = metaHeadline || campanhaOrigem || utmSource || metaBody
  if (!hasData) return null

  const plataforma = detectarPlataforma(metaSourceUrl, utmSource)
  const { Icon, cor, label } = PLATAFORMAS[plataforma]

  const dataFormatada = primeiraConversaAt
    ? new Date(primeiraConversaAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const campanha = campanhaOrigem || metaHeadline || utmCampaign || null
  const headline = metaHeadline && metaHeadline !== campanha ? metaHeadline : null

  // Truncar body em ~2 linhas (~150 chars)
  const bodyTruncado = metaBody
    ? metaBody.length > 150
      ? metaBody.slice(0, 150) + '...'
      : metaBody
    : null

  return (
    <div style={{
      background: `rgba(${BRAND},0.06)`,
      border: `1px solid rgba(${BRAND},0.18)`,
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 16,
      position: 'relative',
    }}>
      {/* Header: ícone da plataforma + rótulo + data */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Icon size={16} style={{ color: cor, flexShrink: 0 }} />
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color: `rgb(${BRAND})`,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {label}
          </span>
        </div>
        {dataFormatada && (
          <span style={{ fontSize: 10, color: 'var(--ws-text-3)', flexShrink: 0 }}>{dataFormatada}</span>
        )}
      </div>

      {/* Content grid: criativo à esquerda + dados à direita */}
      <div style={{ display: 'grid', gridTemplateColumns: metaImageUrl ? '100px 1fr' : '1fr', gap: 12 }}>
        {metaImageUrl && (
          <div style={{ width: 100, height: 100, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
            <img
              src={metaImageUrl}
              alt="criativo da campanha"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          {campanha && (
            <div>
              <span style={{ fontSize: 9, color: 'var(--ws-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Campanha:</span>{' '}
              <span style={{ fontSize: 12, color: 'var(--ws-text-1)', fontWeight: 600 }}>{campanha}</span>
            </div>
          )}

          {headline && (
            <div>
              <span style={{ fontSize: 9, color: 'var(--ws-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Headline:</span>{' '}
              <span style={{ fontSize: 11, color: 'var(--ws-text-1)', fontWeight: 500 }}>{headline}</span>
            </div>
          )}

          {bodyTruncado && (
            <div>
              <span style={{ fontSize: 9, color: 'var(--ws-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Conteúdo:</span>
              <p style={{ fontSize: 11, color: 'var(--ws-text-2)', margin: '4px 0 0', lineHeight: 1.5 }}>
                {bodyTruncado}
              </p>
            </div>
          )}

          {metaSourceUrl && (
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 9, color: 'var(--ws-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>URL da campanha:</span>{' '}
              <a
                href={metaSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: `rgb(${BRAND})`, fontWeight: 500, wordBreak: 'break-all' }}
              >
                {metaSourceUrl.length > 60 ? metaSourceUrl.slice(0, 60) + '...' : metaSourceUrl}
              </a>
            </div>
          )}

          {(utmSource || utmMedium) && (
            <div style={{ fontSize: 9, color: 'var(--ws-text-3)' }}>
              {utmSource ? utmSource.replace(/_/g, ' ') : ''}
              {utmMedium ? ` · ${utmMedium}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
