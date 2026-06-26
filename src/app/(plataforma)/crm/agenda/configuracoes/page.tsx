'use client'

import React, { useState } from 'react'
import { tabAtiva, tabInativa } from '@/lib/utils'
import { ConfigHorarios } from '@/components/agenda/config-horarios'
import { ConfigBloqueios } from '@/components/agenda/config-bloqueios'
import { ConfigLembretes } from '@/components/agenda/config-lembretes'
import { ConfigServicos } from '@/components/agenda/config-servicos'
import { Settings, Clock, ShieldAlert, Bell, ClipboardList } from 'lucide-react'

type TabId = 'horarios' | 'servicos' | 'bloqueios' | 'lembretes'

export default function ConfigAgendaPage() {
  const [activeTab, setActiveTab] = useState<TabId>('horarios')

  const TABS = [
    { id: 'horarios', label: 'Horários', icon: Clock },
    { id: 'servicos', label: 'Serviços', icon: ClipboardList },
    { id: 'bloqueios', label: 'Bloqueios', icon: ShieldAlert },
    { id: 'lembretes', label: 'Lembretes', icon: Bell },
  ] as const

  return (
    <div style={{ background: 'var(--ws-page-bg)', minHeight: '100%', padding: '24px' }}>
      <div className="max-w-6xl mx-auto space-y-8 h-full flex flex-col">
        
        {/* Header */}
        <div className="flex items-end justify-between">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3E5BFF] to-[#7A5AF8] flex items-center justify-center shadow-lg shadow-blue-500/20">
               <Settings className="text-white" size={24} />
             </div>
             <div>
               <h1 className="text-2xl font-bold text-white tracking-tight">Configurações da Agenda</h1>
               <p className="text-white/50 text-sm">Gerencie horários de funcionamento, bloqueios e notificações.</p>
             </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-8 border-b border-white/5">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 pb-4 px-1 transition-all duration-300 relative group`}
                style={isActive ? tabAtiva : tabInativa}
              >
                <Icon size={18} className={isActive ? 'text-[var(--ws-gold)]' : 'text-white/20 group-hover:text-white/40'} />
                <span className="text-sm font-semibold uppercase tracking-[0.1em]">
                  {tab.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0">
          {activeTab === 'horarios' && <ConfigHorarios />}
          {activeTab === 'servicos' && <ConfigServicos />}
          {activeTab === 'bloqueios' && <ConfigBloqueios />}
          {activeTab === 'lembretes' && <ConfigLembretes />}
        </div>
      </div>
    </div>
  )
}
