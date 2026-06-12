'use client'

import React, { useState } from 'react'
import { Sparkles, LayoutGrid, History } from 'lucide-react'
import { usePersistedState } from '@/hooks/use-estado-persistido'
import { GeradorCriativos, type SeedModelo } from './GeradorCriativos'
import { GaleriaModelos, type ModeloCard } from './GaleriaModelos'
import { HistoricoCriativos } from './HistoricoCriativos'

// Estúdio = 3 abas: "Gerar" (gerador), "Modelos" (galeria curada + Meus modelos)
// e "Histórico" (criativos gerados). Todas ficam montadas (toggle por display)
// para não perder o estado do gerador. Escolher um modelo/histórico aplica um
// `seed` no gerador e volta pra aba Gerar.
export function EstudioCriativos() {
  const [aba, setAba] = usePersistedState<'gerar' | 'modelos' | 'historico'>('op7-estudio-aba', 'gerar')
  const [seed, setSeed] = useState<SeedModelo | null>(null)

  const usarEstrutura = (estrutura: Record<string, any> | null) => {
    setSeed({ tipo: 'estrutura', estrutura, nonce: Date.now() })
    setAba('gerar')
  }
  const usarReferencia = (dataUrl: string, nome?: string) => {
    setSeed({ tipo: 'referencia', dataUrl, nome, nonce: Date.now() })
    setAba('gerar')
  }

  const tabs = [
    { id: 'gerar' as const, label: 'Gerar', icon: Sparkles },
    { id: 'modelos' as const, label: 'Modelos', icon: LayoutGrid },
    { id: 'historico' as const, label: 'Histórico', icon: History },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 px-6 pt-4 shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className={`flex items-center gap-2 px-4 h-9 rounded-[var(--ws-radius-lg)] text-[12px] font-bold uppercase tracking-wider border transition-all ${aba === t.id ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'bg-[var(--ws-glass-bg)] text-[var(--ws-text-2)] border-[var(--ws-glass-border)] hover:border-[var(--ws-blue)]'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <div className={aba === 'gerar' ? 'h-full' : 'hidden'}>
          <GeradorCriativos seedModelo={seed} />
        </div>
        <div className={aba === 'modelos' ? 'h-full' : 'hidden'}>
          <GaleriaModelos onUsarEstrutura={(m: ModeloCard) => usarEstrutura(m.estrutura || null)} onUsarReferencia={usarReferencia} />
        </div>
        <div className={aba === 'historico' ? 'h-full' : 'hidden'}>
          <HistoricoCriativos onUsarEstrutura={usarEstrutura} onUsarImagem={(d) => usarReferencia(d)} />
        </div>
      </div>
    </div>
  )
}
