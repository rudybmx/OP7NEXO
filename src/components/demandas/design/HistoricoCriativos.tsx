'use client'

import React, { useEffect, useState } from 'react'
import { Sparkles, Image as ImageIcon, History, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { getToken } from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

interface HistItemCard {
  id: string
  imagem_url: string
  creative_format?: string | null
  criado_em?: string | null
  estrutura?: Record<string, any> | null
}

// URL absoluta da API → proxy do front (evita CORS ao ler a imagem como blob)
const proxied = (url: string) => url.replace(/^https?:\/\/[^/]+/, '/api/proxy')

export function HistoricoCriativos({ onUsarEstrutura, onUsarImagem }: {
  onUsarEstrutura: (estrutura: Record<string, any> | null) => void
  onUsarImagem: (dataUrl: string) => void
}) {
  const { workspaceAtual: wsId } = useWorkspace()
  const [itens, setItens] = useState<HistItemCard[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmar, setConfirmar] = useState<HistItemCard | null>(null)
  const [apagando, setApagando] = useState(false)

  useEffect(() => {
    if (!wsId) return
    setLoading(true)
    fetch(`/api/proxy/design/historico?workspace_id=${wsId}`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setItens)
      .catch(() => toast.error('Erro ao carregar o histórico.'))
      .finally(() => setLoading(false))
  }, [wsId])

  const apagar = async () => {
    if (!wsId || !confirmar) return
    const id = confirmar.id
    setApagando(true)
    try {
      const res = await fetch(`/api/proxy/design/historico/${id}?workspace_id=${wsId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      })
      if (!res.ok) throw new Error()
      setItens(prev => prev.filter(x => x.id !== id))
      toast.success('Criativo apagado do histórico.')
      setConfirmar(null)
    } catch {
      toast.error('Não consegui apagar o criativo.')
    } finally {
      setApagando(false)
    }
  }

  const usarImagem = async (it: HistItemCard) => {
    try {
      const res = await fetch(proxied(it.imagem_url))
      const blob = await res.blob()
      const reader = new FileReader()
      reader.onload = () => onUsarImagem(String(reader.result))
      reader.readAsDataURL(blob)
    } catch {
      toast.error('Não consegui carregar a imagem.')
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 scrollbar-hide animate-in fade-in duration-300">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-1)] mb-3 flex items-center gap-2">
        <History size={14} className="text-[var(--ws-blue)]" /> Histórico de criativos
        <span className="text-[9px] font-medium normal-case text-[var(--ws-text-3)]">(tudo que você já gerou)</span>
      </h3>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[12px] text-[var(--ws-text-3)]">Carregando histórico...</div>
      ) : itens.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <ImageIcon size={26} className="text-[var(--ws-text-3)] opacity-50" />
          <span className="text-[11px] text-[var(--ws-text-3)]">Nenhum criativo gerado ainda. Gere na aba <b>Gerar</b> e eles aparecem aqui.</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {itens.map(it => (
            <div key={it.id} className="flex flex-col rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] overflow-hidden shadow-sm">
              <div className="w-full aspect-[9/16] bg-[var(--ws-navy)] flex items-center justify-center overflow-hidden">
                <img src={it.imagem_url} alt="Criativo" className="max-w-full max-h-full object-contain" />
              </div>
              <div className="flex flex-col gap-1.5 p-3 flex-1">
                <div className="text-[12px] font-bold text-[var(--ws-text-1)] truncate">{it.estrutura?.headline || 'Criativo'}</div>
                <div className="flex flex-wrap gap-1">
                  {it.estrutura?.objetivo && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] text-[var(--ws-text-3)]">{it.estrutura.objetivo}</span>}
                  {it.criado_em && <span className="text-[9px] px-1.5 py-0.5 rounded text-[var(--ws-text-3)]">{new Date(it.criado_em).toLocaleDateString('pt-BR')}</span>}
                </div>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => onUsarEstrutura(it.estrutura || null)}
                    className="flex-1 h-8 rounded-[var(--ws-radius-lg)] text-[10px] font-bold uppercase tracking-wider text-white bg-[var(--ws-blue)] hover:opacity-90 transition-all flex items-center justify-center gap-1.5">
                    <Sparkles size={12} /> Usar estrutura
                  </button>
                  <button onClick={() => usarImagem(it)} title="Usar a imagem como Modelo de exemplo"
                    className="px-3 h-8 rounded-[var(--ws-radius-lg)] text-[10px] font-bold uppercase tracking-wider text-[var(--ws-blue)] border border-[var(--ws-blue)]/40 bg-[rgba(62,91,255,0.06)] hover:bg-[rgba(62,91,255,0.12)] transition-all">
                    Usar imagem
                  </button>
                  <button onClick={() => setConfirmar(it)} title="Apagar do histórico" aria-label="Apagar do histórico"
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-[var(--ws-radius-lg)] text-[#a32d2d] border border-[#a32d2d]/30 hover:bg-[rgba(163,45,45,0.08)] transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => { if (!apagando) setConfirmar(null) }}>
          <div onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-[var(--ws-radius-xl)] border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] backdrop-blur-md p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 shrink-0 rounded-full bg-[rgba(163,45,45,0.12)] flex items-center justify-center">
                <AlertTriangle size={18} className="text-[#a32d2d]" />
              </div>
              <div className="min-w-0">
                <h4 className="text-[14px] font-bold text-[var(--ws-text-1)]">Apagar criativo?</h4>
                <p className="text-[12px] text-[var(--ws-text-2)] mt-1">Isso remove o criativo do histórico. Não dá pra desfazer.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmar(null)} disabled={apagando}
                className="flex-1 h-9 rounded-[var(--ws-radius-lg)] text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-2)] border border-[var(--ws-glass-border)] hover:border-[var(--ws-text-3)] disabled:opacity-50 transition-all">
                Cancelar
              </button>
              <button onClick={apagar} disabled={apagando}
                className="flex-1 h-9 rounded-[var(--ws-radius-lg)] text-[11px] font-bold uppercase tracking-wider text-white bg-[#a32d2d] hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {apagando ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Apagando...</> : <><Trash2 size={13} /> Apagar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
