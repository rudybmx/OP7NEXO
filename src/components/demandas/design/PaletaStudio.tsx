'use client'

import { useState } from 'react'
import { Palette, Shuffle, Copy, Check, Plus, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import type { Cor, Modo, Papel, PaletaT } from '@/lib/cor-harmonia'
import { gerarPaleta, aleatorio, normalizarPaleta, contraste, rotuloContraste, toHex } from '@/lib/cor-harmonia'

// Estúdio de Paleta (inspirado no gerador da Adobe Express): modos de entrada,
// harmonias na roda de cores, N swatches editáveis (hex + copiar + papel + peso),
// barra de proporção, aleatório e contraste WCAG. A paleta (cores em hex) é a
// FONTE DE VERDADE da cor — o prompt de imagem lê estas cores.

const MODOS: { id: Modo; label: string; desc: string }[] = [
  { id: 'analoga', label: 'Análoga', desc: 'Vizinhas na roda (±30°). Harmônica e suave.' },
  { id: 'mono', label: 'Monocromática', desc: 'Uma cor variando claro/escuro. Coesa e elegante.' },
  { id: 'complementar', label: 'Complementar', desc: 'Opostas (180°). Máximo contraste.' },
  { id: 'split', label: 'Split', desc: 'Base + 2 vizinhas da oposta (±150°). Contraste mais suave.' },
  { id: 'triade', label: 'Tríade', desc: '3 cores a 120°. Vibrante e equilibrada.' },
  { id: 'tetrade', label: 'Tétrade', desc: '4 cores (2 pares). Rica; exige equilíbrio.' },
  { id: 'custom', label: 'Personalizado', desc: 'Edite cada cor livremente.' },
]

const PAPEIS: { id: Papel; label: string }[] = [
  { id: 'dominante', label: 'Dominante' },
  { id: 'apoio', label: 'Apoio' },
  { id: 'destaque', label: 'Destaque' },
  { id: 'livre', label: 'Livre' },
]

const chip = 'h-8 px-2.5 rounded-[var(--ws-radius-lg)] text-sm border transition'
const inpHex = 'w-[88px] px-2 h-8 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-sm font-mono outline-none focus:border-[var(--ws-blue)]'

type Props = {
  paleta?: PaletaT
  onChange: (p: { cores: Cor[]; modo: Modo }) => void
  onImagem?: (dataUrl: string) => void
  analisandoImagem?: boolean
}

export function PaletaStudio({ paleta, onChange, onImagem, analisandoImagem }: Props) {
  const { cores, modo } = normalizarPaleta(paleta)
  const [base, setBase] = useState<string>(cores[0]?.hex || '#3E5BFF')
  const [entrada, setEntrada] = useState<'primaria' | 'imagem' | 'roda'>('primaria')
  const [copiado, setCopiado] = useState<number | null>(null)
  const [n, setN] = useState<number>(Math.min(8, Math.max(3, cores.length || 5)))

  const emit = (c: Cor[], m: Modo) => onChange({ cores: c, modo: m })
  const aplicarModo = (m: Modo) => {
    if (m === 'custom') { emit(cores.length ? cores : gerarPaleta(base, 'analoga', n), 'custom'); return }
    emit(gerarPaleta(base, m, n), m)
  }
  const setCor = (i: number, patch: Partial<Cor>, m: Modo = 'custom') =>
    emit(cores.map((c, j) => (j === i ? { ...c, ...patch } : c)), m)
  const addCor = () => emit([...cores, { hex: base, papel: 'livre', peso: 5 }], 'custom')
  const rmCor = (i: number) => emit(cores.filter((_, j) => j !== i), modo)

  const copiar = async (hex: string, i: number) => {
    try { await navigator.clipboard.writeText(hex) } catch { /* clipboard pode estar bloqueado */ }
    setCopiado(i); window.setTimeout(() => setCopiado(null), 1200)
  }

  const dom = cores.find(c => c.papel === 'dominante')?.hex || cores[0]?.hex || '#ffffff'
  const des = cores.find(c => c.papel === 'destaque')?.hex || cores[cores.length - 1]?.hex || '#111111'
  const rc = rotuloContraste(contraste(des, dom))
  const total = cores.reduce((a, c) => a + (c.peso || 0), 0) || 1
  const modoAtual = MODOS.find(m => m.id === modo)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Palette size={15} className="text-[var(--ws-blue)]" />
        <span className="ds-label">Paleta de cores</span>
        <span className="ds-help">— controle total: harmonia, hex e proporção 60/30/10.</span>
        <button type="button" onClick={() => emit(aleatorio(n), 'custom')}
          className={`${chip} ml-auto border-[var(--ws-glass-border)] hover:border-[var(--ws-blue)] inline-flex items-center gap-1`}>
          <Shuffle size={13} /> Gerar aleatórios
        </button>
      </div>

      {/* Modos de entrada */}
      <div className="flex gap-1 p-1 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] w-fit">
        {([['primaria', 'Cor primária'], ['imagem', 'Da imagem'], ['roda', 'Roda de cores']] as const).map(([id, lbl]) => (
          <button key={id} type="button" onClick={() => setEntrada(id)}
            className={`h-8 px-3 rounded text-sm ${entrada === id ? 'bg-[var(--ws-blue)] text-white' : 'text-[var(--ws-text-2)]'}`}>{lbl}</button>
        ))}
      </div>

      {entrada === 'primaria' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="ds-help">Cor-base</span>
            <input type="color" value={toHex(base)} onChange={e => setBase(e.target.value)}
              className="w-9 h-8 rounded cursor-pointer border border-[var(--ws-glass-border)] bg-transparent" />
            <span className="ds-help ml-2">Nº de cores</span>
            <input type="number" min={3} max={8} value={n}
              onChange={e => setN(Math.max(3, Math.min(8, Number(e.target.value) || 5)))}
              className="w-14 px-2 h-8 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-sm outline-none" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {MODOS.map(m => (
              <button key={m.id} type="button" title={m.desc} onClick={() => aplicarModo(m.id)}
                className={`${chip} ${modo === m.id ? 'bg-[rgba(62,91,255,0.12)] border-[var(--ws-blue)] text-[var(--ws-blue)]' : 'border-[var(--ws-glass-border)] hover:border-[var(--ws-blue)]'}`}>
                {m.label}
              </button>
            ))}
          </div>
          {modoAtual && <span className="ds-help">{modoAtual.desc}</span>}
        </div>
      )}

      {entrada === 'imagem' && (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="h-9 px-4 inline-flex items-center gap-2 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] text-sm cursor-pointer hover:border-[var(--ws-blue)]">
            {analisandoImagem ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />} Extrair de uma imagem
            <input type="file" accept="image/*" className="hidden" onChange={e => {
              const f = e.target.files?.[0]; if (!f || !onImagem) return
              const rd = new FileReader(); rd.onload = () => onImagem(String(rd.result)); rd.readAsDataURL(f)
            }} />
          </label>
          <span className="ds-help">A IA extrai a paleta da imagem (reusa o modelo reverso, custo zero).</span>
        </div>
      )}

      {entrada === 'roda' && (
        <span className="ds-help">A roda de cores arrastável chega na próxima fase. Por enquanto use “Cor primária” (base + harmonia) ou “Da imagem”.</span>
      )}

      {/* Swatches */}
      {cores.length === 0 ? (
        <span className="ds-help">Escolha uma cor-base e uma harmonia para montar a paleta.</span>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {cores.map((c, i) => (
              <div key={i} className="flex flex-col gap-1 p-2 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)]">
                <div className="flex items-center gap-1.5">
                  <input type="color" value={toHex(c.hex)} onChange={e => setCor(i, { hex: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-[var(--ws-glass-border)] bg-transparent" title="Editar cor" />
                  <input value={c.hex} onChange={e => setCor(i, { hex: e.target.value })} className={inpHex} spellCheck={false} />
                  <button type="button" onClick={() => copiar(c.hex, i)} title="Copiar hex"
                    className="w-7 h-7 inline-flex items-center justify-center rounded hover:text-[var(--ws-blue)]">
                    {copiado === i ? <Check size={13} className="text-[var(--ws-green)]" /> : <Copy size={13} />}
                  </button>
                  <button type="button" onClick={() => rmCor(i)} title="Remover" disabled={cores.length <= 2}
                    className="w-7 h-7 inline-flex items-center justify-center rounded hover:text-[#a32d2d] disabled:opacity-30"><X size={13} /></button>
                </div>
                <div className="flex items-center gap-1">
                  <select value={c.papel} onChange={e => setCor(i, { papel: e.target.value as Papel }, modo)}
                    className="h-7 px-1 rounded border border-[var(--ws-glass-border)] bg-transparent text-xs outline-none">
                    {PAPEIS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <input type="number" min={0} max={100} value={c.peso}
                    onChange={e => setCor(i, { peso: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }, modo)}
                    className="w-12 px-1 h-7 rounded border border-[var(--ws-glass-border)] bg-transparent text-xs outline-none" title="Peso (%)" />
                  <span className="ds-micro text-[var(--ws-text-3)]">%</span>
                </div>
              </div>
            ))}
            <button type="button" onClick={addCor} disabled={cores.length >= 8} title="Adicionar cor"
              className="w-9 self-stretch inline-flex items-center justify-center rounded-[var(--ws-radius-lg)] border border-dashed border-[var(--ws-glass-border)] hover:border-[var(--ws-blue)] disabled:opacity-30"><Plus size={15} /></button>
          </div>

          {/* Barra de proporção */}
          <div className="flex h-3 w-full overflow-hidden rounded-full border border-[var(--ws-glass-border)]">
            {cores.map((c, i) => (
              <div key={i} style={{ width: `${((c.peso || 0) / total) * 100}%`, background: toHex(c.hex) }} title={`${c.hex} · ${c.peso}%`} />
            ))}
          </div>

          {/* Contraste WCAG */}
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: toHex(dom), color: toHex(des) }}>Texto exemplo</span>
            <span className={`ds-help ${rc.ok ? 'text-[var(--ws-green)]' : 'text-[#854f0b]'}`}>Contraste destaque/dominante: {rc.label} {rc.ok ? '✓' : '⚠'}</span>
          </div>
        </>
      )}
    </div>
  )
}
