import type { TipoCampanha } from '@/types/google-ads'

const TIPO_CONFIG: Record<TipoCampanha, { label: string; bg: string; border: string; txt: string }> = {
  SEARCH:          { label: 'Search',      bg: '#e6f1fb', border: '1px solid rgba(24,95,165,0.25)', txt: '#185fa5' },
  PERFORMANCE_MAX: { label: 'Perf. Max',   bg: '#eaf3de', border: '1px solid rgba(59,109,17,0.25)', txt: '#3b6d11' },
  DISPLAY:         { label: 'Display',     bg: '#faeeda', border: '1px solid rgba(133,79,11,0.25)', txt: '#854f0b' },
  VIDEO:           { label: 'Video',       bg: '#fcebeb', border: '1px solid rgba(163,45,45,0.25)', txt: '#a32d2d' },
  SHOPPING:        { label: 'Shopping',    bg: '#eeedfe', border: '1px solid rgba(60,52,137,0.25)', txt: '#3c3489' },
  DEMAND_GEN:      { label: 'Demand Gen',  bg: '#e1f5ee', border: '1px solid rgba(15,110,86,0.25)', txt: '#0f6e56' },
}

const FALLBACK = { label: '', bg: 'rgba(14,20,42,0.06)', border: '1px solid rgba(14,20,42,0.12)', txt: '#5f5e5a' }

export function BadgeTipoCampanha({ tipo }: { tipo: TipoCampanha }) {
  const c = TIPO_CONFIG[tipo] ?? { ...FALLBACK, label: tipo ? String(tipo).replace(/_/g, ' ') : '—' }
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
