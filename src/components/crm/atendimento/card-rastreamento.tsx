'use client'

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

  const dataFormatada = primeiraConversaAt
    ? new Date(primeiraConversaAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const origemLabel = utmSource
    ? utmSource.replace(/_/g, ' ').toUpperCase()
    : 'ORGÂNICO'

  const meioLabel = utmMedium
    ? utmMedium.replace(/_/g, ' ').toUpperCase()
    : 'WHATSAPP'

  const headline = metaHeadline || campanhaOrigem || utmCampaign || '—'

  // Truncar body em 2 linhas (~150 chars)
  const bodyTruncado = metaBody
    ? metaBody.length > 150
      ? metaBody.slice(0, 150) + '...'
      : metaBody
    : null

  return (
    <div style={{
      background: 'rgba(201,168,76,0.08)',
      border: '1px solid rgba(201,168,76,0.20)',
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 16,
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>📊</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Rastreamento
          </span>
        </div>
        {dataFormatada && (
          <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>{dataFormatada}</span>
        )}
      </div>

      {/* Content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: metaImageUrl ? '100px 1fr' : '1fr', gap: 12 }}>
        {metaImageUrl && (
          <div style={{ width: 100, height: 100, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
            <img
              src={metaImageUrl}
              alt="criativo"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
            <div>
              <span style={{ fontSize: 9, color: 'var(--ws-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Origem:</span>{' '}
              <span style={{ fontSize: 11, color: 'var(--ws-text-1)', fontWeight: 500 }}>{origemLabel}</span>
            </div>
            <div>
              <span style={{ fontSize: 9, color: 'var(--ws-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Campanha:</span>{' '}
              <span style={{ fontSize: 11, color: 'var(--ws-text-1)', fontWeight: 500 }}>{campanhaOrigem || metaHeadline || '—'}</span>
            </div>
            <div>
              <span style={{ fontSize: 9, color: 'var(--ws-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Headline:</span>{' '}
              <span style={{ fontSize: 11, color: 'var(--ws-text-1)', fontWeight: 500 }}>{headline}</span>
            </div>
            <div>
              <span style={{ fontSize: 9, color: 'var(--ws-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Meio:</span>{' '}
              <span style={{ fontSize: 11, color: 'var(--ws-text-1)', fontWeight: 500 }}>{meioLabel}</span>
            </div>
          </div>

          {bodyTruncado && (
            <div>
              <span style={{ fontSize: 9, color: 'var(--ws-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Conteúdo:</span>
              <p style={{ fontSize: 11, color: 'var(--ws-text-2)', margin: '4px 0 0', lineHeight: 1.5 }}>
                {bodyTruncado}
              </p>
            </div>
          )}

          {metaSourceUrl && (
            <div>
              <span style={{ fontSize: 9, color: 'var(--ws-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Acesso:</span>{' '}
              <a
                href={metaSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: '#3E5BFF', fontWeight: 500 }}
              >
                {metaSourceUrl.length > 50 ? metaSourceUrl.slice(0, 50) + '...' : metaSourceUrl}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
