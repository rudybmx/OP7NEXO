import type { EstrategiaLance } from '@/types/google-ads'

const ESTRATEGIA_CONFIG: Record<EstrategiaLance, { label: string; bg: string; border: string; txt: string }> = {
  TARGET_CPA:                { label: 'Target CPA',      bg: '#e6f1fb', border: '1px solid rgba(24,95,165,0.25)', txt: '#185fa5' },
  TARGET_ROAS:               { label: 'Target ROAS',     bg: '#eaf3de', border: '1px solid rgba(59,109,17,0.25)', txt: '#3b6d11' },
  MAXIMIZE_CONVERSIONS:      { label: 'Max. Conversões', bg: '#eeedfe', border: '1px solid rgba(60,52,137,0.25)', txt: '#3c3489' },
  MAXIMIZE_CONVERSION_VALUE: { label: 'Max. Valor',      bg: '#e1f5ee', border: '1px solid rgba(15,110,86,0.25)', txt: '#0f6e56' },
  MANUAL_CPC:                { label: 'Manual CPC',      bg: '#f0efec', border: '1px solid rgba(14,20,42,0.15)',  txt: '#5f5e5a' },
  ENHANCED_CPC:              { label: 'ECPC ⚠',          bg: '#fcebeb', border: '1px solid rgba(163,45,45,0.25)', txt: '#a32d2d' },
  TARGET_IMPRESSION_SHARE:   { label: 'Target IS',       bg: '#faeeda', border: '1px solid rgba(133,79,11,0.25)', txt: '#854f0b' },
  MAXIMIZE_CLICKS:           { label: 'Max. Cliques',    bg: '#faeeda', border: '1px solid rgba(133,79,11,0.25)', txt: '#854f0b' },
}

const FALLBACK = { label: '', bg: 'rgba(14,20,42,0.06)', border: '1px solid rgba(14,20,42,0.12)', txt: '#5f5e5a' }

export function BadgeEstrategia({ estrategia }: { estrategia: EstrategiaLance }) {
  const c = ESTRATEGIA_CONFIG[estrategia] ?? { ...FALLBACK, label: estrategia ? String(estrategia).replace(/_/g, ' ') : '—' }
  return (
    <span style={{
      background: c.bg,
      color: c.txt,
      border: c.border,
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 9999,
      whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  )
}
