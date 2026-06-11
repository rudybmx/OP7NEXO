'use client'

import React, { useState } from 'react'
import { Sparkles, LayoutGrid } from 'lucide-react'
import { GeradorCriativos, type SeedModelo } from './GeradorCriativos'
import { GaleriaModelos, type ModeloCard } from './GaleriaModelos'

// Estúdio = 2 abas: "Gerar" (gerador) e "Modelos" (galeria curada + Meus modelos).
// Ambas ficam montadas (toggle por display) para não perder o estado do gerador
// ao alternar. Escolher um modelo aplica um `seed` no gerador e volta pra aba Gerar.
export function EstudioCriativos() {
  const [aba, setAba] = useState<'gerar' | 'modelos'>('gerar')
  const [seed, setSeed] = useState<SeedModelo | null>(null)

  const usarEstrutura = (m: ModeloCard) => {
    setSeed({ tipo: 'estrutura', estrutura: m.estrutura || null, nonce: Date.now() })
    setAba('gerar')
  }
  const usarReferencia = (dataUrl: string, nome?: string) => {
    setSeed({ tipo: 'referencia', dataUrl, nome, nonce: Date.now() })
    setAba('gerar')
  }

  const tabs = [
    { id: 'gerar' as const, label: 'Gerar', icon: Sparkles },
    { id: 'modelos' as const, label: 'Modelos', icon: LayoutGrid },
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
          <GaleriaModelos onUsarEstrutura={usarEstrutura} onUsarReferencia={usarReferencia} />
        </div>
      </div>
    </div>
  )
}
