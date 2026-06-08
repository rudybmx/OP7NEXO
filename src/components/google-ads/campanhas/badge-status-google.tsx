import type { StatusGoogle } from '@/types/google-ads'

const STATUS_CONFIG: Record<StatusGoogle, { label: string; bg: string; border: string; txt: string }> = {
  ENABLED: { label: 'Ativa',    bg: 'rgba(15,168,86,0.12)', border: '1px solid rgba(15,168,86,0.25)', txt: '#007a40' },
  PAUSED:  { label: 'Pausada',  bg: 'rgba(239,159,39,0.12)', border: '1px solid rgba(239,159,39,0.25)', txt: '#854f0b' },
  REMOVED: { label: 'Removida', bg: 'rgba(14,20,42,0.08)',  border: '1px solid rgba(14,20,42,0.15)', txt: '#8892b0' },
}

const FALLBACK = { label: '', bg: 'rgba(14,20,42,0.06)', border: '1px solid rgba(14,20,42,0.12)', txt: '#5f5e5a' }

export function BadgeStatusGoogle({ status }: { status: StatusGoogle }) {
  const c = STATUS_CONFIG[status] ?? { ...FALLBACK, label: status ? String(status) : '—' }
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
