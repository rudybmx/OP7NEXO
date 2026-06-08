import type { AdStrength } from '@/types/google-ads'

const STRENGTH_CONFIG: Record<AdStrength, { label: string; bg: string; border: string; txt: string }> = {
  EXCELLENT: { label: '★ Excellent', bg: '#eaf3de', border: '1px solid rgba(59,109,17,0.25)',  txt: '#3b6d11' },
  GOOD:      { label: '◆ Good',      bg: '#e6f1fb', border: '1px solid rgba(24,95,165,0.25)',  txt: '#185fa5' },
  AVERAGE:   { label: '● Average',   bg: '#faeeda', border: '1px solid rgba(133,79,11,0.25)',  txt: '#854f0b' },
  POOR:      { label: '▼ Poor',      bg: '#fcebeb', border: '1px solid rgba(163,45,45,0.25)',  txt: '#a32d2d' },
  PENDING:   { label: '○ Pending',   bg: '#f0efec', border: '1px solid rgba(14,20,42,0.15)',   txt: '#5f5e5a' },
}

const FALLBACK = { label: '', bg: 'rgba(14,20,42,0.06)', border: '1px solid rgba(14,20,42,0.12)', txt: '#5f5e5a' }

// Só exibir para tipo PERFORMANCE_MAX
export function BadgeAdStrength({ strength }: { strength: AdStrength }) {
  const c = STRENGTH_CONFIG[strength] ?? { ...FALLBACK, label: strength ? String(strength) : '—' }
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
