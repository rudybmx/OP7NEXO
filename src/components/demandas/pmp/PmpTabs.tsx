'use client'

import { cn } from '@/lib/utils'

interface PmpTabsProps {
  activeTab: 'gantt' | 'resumo' | 'historico'
  onChange: (tab: 'gantt' | 'resumo' | 'historico') => void
}

const TABS: Array<{ id: 'gantt' | 'resumo' | 'historico'; label: string }> = [
  { id: 'gantt', label: 'Plano Ativo' },
  { id: 'resumo', label: 'Resumo' },
  { id: 'historico', label: 'Histórico' },
]

export default function PmpTabs({ activeTab, onChange }: PmpTabsProps) {
  return (
    <div className="flex gap-0" style={{ borderBottom: '1px solid var(--ws-glass-border)' }}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'px-4 py-2 text-[13px] transition-colors duration-200 ease-out',
            activeTab === tab.id
              ? 'border-b-2 border-[var(--ws-gold)] font-medium text-[#92722a]'
              : 'text-muted-foreground hover:text-foreground/70'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
