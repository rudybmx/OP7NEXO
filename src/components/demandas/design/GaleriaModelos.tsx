'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Sparkles, Upload, Trash2, Award, LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'
import { getToken } from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

export interface ModeloCard {
  id: string
  escopo: 'curado' | 'meu'
  nome: string
  nicho?: string | null
  objetivo?: string | null
  nivel_consciencia?: string | null
  gancho?: string | null
  badge?: string | null
  thumb_url?: string | null
  ai_porque?: string | null
  estrutura?: Record<string, any> | null
}

const OBJ_FILTROS = [
  { id: '', label: 'Todos' },
  { id: 'divulgar oferta', label: 'Oferta' },
  { id: 'geração de leads', label: 'Leads' },
  { id: 'agendamento no WhatsApp', label: 'WhatsApp' },
  { id: 'institucional / marca', label: 'Institucional' },
]
const NIVEL_LABEL: Record<string, string> = {
  direto: 'Direto ao ponto', educativo: 'Educativo / Autoridade', ugc: 'UGC / Prova social',
}

// converte a URL absoluta da API para o proxy do front (evita CORS na leitura)
const proxied = (url: string) => url.replace(/^https?:\/\/[^/]+/, '/api/proxy')

function Thumb({ m }: { m: ModeloCard }) {
  if (m.thumb_url) {
    return <img src={m.thumb_url} alt={m.nome} className="w-full h-32 object-cover" />
  }
  return (
    <div className="w-full h-32 flex flex-col items-center justify-center gap-1 bg-[linear-gradient(135deg,rgba(62,91,255,0.12),rgba(122,90,248,0.12))]">
      <LayoutGrid size={22} className="text-[var(--ws-blue)] opacity-50" />
      <span className="text-[9px] uppercase tracking-wider text-[var(--ws-text-3)]">{m.nicho || 'Modelo'}</span>
    </div>
  )
}

export function GaleriaModelos({ onUsarEstrutura, onUsarReferencia }: {
  onUsarEstrutura: (m: ModeloCard) => void
  onUsarReferencia: (dataUrl: string, nome?: string) => void
}) {
  const { workspaceAtual: wsId } = useWorkspace()
  const [modelos, setModelos] = useState<ModeloCard[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroObj, setFiltroObj] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const carregar = async () => {
    if (!wsId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/proxy/design/modelos?workspace_id=${wsId}`, {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      })
      if (!res.ok) throw new Error()
      setModelos(await res.json())
    } catch {
      toast.error('Erro ao carregar os modelos.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregar() /* eslint-disable-next-line */ }, [wsId])

  const curados = modelos.filter(m => m.escopo === 'curado' && (!filtroObj || m.objetivo === filtroObj))
  const meus = modelos.filter(m => m.escopo === 'meu')

  const onUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f || !wsId) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione uma imagem.'); return }
    const r = new FileReader()
    r.onload = async () => {
      const durl = String(r.result)
      const nome = f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Meu modelo'
      setEnviando(true)
      try {
        const res = await fetch('/api/proxy/design/modelos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
          body: JSON.stringify({ workspace_id: wsId, nome, image_base64: durl }),
        })
        if (!res.ok) throw new Error()
        toast.success('Modelo salvo em "Meus modelos"')
        carregar()
      } catch {
        toast.error('Erro ao salvar o modelo.')
      } finally {
        setEnviando(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    }
    r.readAsDataURL(f)
  }

  const excluir = async (id: string) => {
    if (!wsId) return
    try {
      const res = await fetch(`/api/proxy/design/modelos/${id}?workspace_id=${wsId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      })
      if (!res.ok) throw new Error()
      setModelos(prev => prev.filter(m => m.id !== id))
      toast.success('Modelo excluído')
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  const usarMeu = async (m: ModeloCard) => {
    if (!m.thumb_url) return
    try {
      const res = await fetch(proxied(m.thumb_url))
      const blob = await res.blob()
      const reader = new FileReader()
      reader.onload = () => onUsarReferencia(String(reader.result), m.nome)
      reader.readAsDataURL(blob)
    } catch {
      toast.error('Não consegui carregar a imagem do modelo.')
    }
  }

  const cardCls = 'flex flex-col rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] overflow-hidden shadow-sm'

  return (
    <div className="h-full overflow-y-auto p-6 scrollbar-hide animate-in fade-in duration-300">
      {/* Cabeçalho: filtros + carregar */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-3)]">Objetivo</span>
          {OBJ_FILTROS.map(o => (
            <button key={o.id} onClick={() => setFiltroObj(o.id)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${filtroObj === o.id ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'bg-[var(--ws-glass-bg)] text-[var(--ws-text-2)] border-[var(--ws-glass-border)]'}`}>
              {o.label}
            </button>
          ))}
        </div>
        <label className="cursor-pointer flex items-center gap-2 px-4 h-9 rounded-[var(--ws-radius-lg)] text-[11px] font-bold uppercase tracking-wider text-white bg-[var(--ws-blue)] hover:opacity-90 transition-all">
          {enviando
            ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Upload size={14} />}
          Carregar modelo
          <input ref={fileRef} type="file" accept="image/*" onChange={onUploadFile} className="hidden" />
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[12px] text-[var(--ws-text-3)]">Carregando modelos...</div>
      ) : (
        <>
          {/* Curados */}
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-1)] mb-3 flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--ws-gold)]" /> Modelos curados
            <span className="text-[9px] font-medium normal-case text-[var(--ws-text-3)]">(estruturas que convertem)</span>
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            {curados.map(m => (
              <div key={m.id} className={cardCls}>
                <div className="relative">
                  <Thumb m={m} />
                  {m.badge && (
                    <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--ws-gold)] text-white text-[9px] font-bold uppercase tracking-wider shadow">
                      <Award size={10} /> {m.badge}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 p-3 flex-1">
                  <div className="text-[13px] font-bold text-[var(--ws-text-1)]">{m.nome}</div>
                  <div className="flex flex-wrap gap-1">
                    {m.nicho && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] text-[var(--ws-text-3)]">{m.nicho}</span>}
                    {m.nivel_consciencia && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] text-[var(--ws-text-3)]">{NIVEL_LABEL[m.nivel_consciencia] || m.nivel_consciencia}</span>}
                  </div>
                  {m.ai_porque && <p className="text-[10px] leading-snug text-[var(--ws-text-2)] flex-1">{m.ai_porque}</p>}
                  <button onClick={() => onUsarEstrutura(m)}
                    className="mt-1 h-8 rounded-[var(--ws-radius-lg)] text-[10px] font-bold uppercase tracking-wider text-white bg-[var(--ws-blue)] hover:opacity-90 transition-all flex items-center justify-center gap-1.5">
                    <Sparkles size={12} /> Usar estrutura
                  </button>
                </div>
              </div>
            ))}
            {curados.length === 0 && (
              <div className="col-span-full text-[11px] text-[var(--ws-text-3)] italic py-6 text-center">Nenhum modelo curado para este filtro.</div>
            )}
          </div>

          {/* Meus modelos */}
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-1)] mb-3 flex items-center gap-2">
            <LayoutGrid size={14} className="text-[var(--ws-blue)]" /> Meus modelos
            <span className="text-[9px] font-medium normal-case text-[var(--ws-text-3)]">(referências que você salvou)</span>
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {meus.map(m => (
              <div key={m.id} className={cardCls}>
                <div className="relative group">
                  <Thumb m={m} />
                  <button onClick={() => excluir(m.id)} title="Excluir"
                    className="absolute top-2 right-2 p-1 rounded-md bg-black/40 text-white opacity-0 group-hover:opacity-100 hover:bg-[#a32d2d] transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 p-3 flex-1">
                  <div className="text-[13px] font-bold text-[var(--ws-text-1)] truncate">{m.nome}</div>
                  {m.nicho && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] text-[var(--ws-text-3)] w-fit">{m.nicho}</span>}
                  <button onClick={() => usarMeu(m)}
                    className="mt-1 h-8 rounded-[var(--ws-radius-lg)] text-[10px] font-bold uppercase tracking-wider text-[var(--ws-blue)] border border-[var(--ws-blue)]/40 bg-[rgba(62,91,255,0.06)] hover:bg-[rgba(62,91,255,0.12)] transition-all flex items-center justify-center gap-1.5">
                    Usar modelo
                  </button>
                </div>
              </div>
            ))}
            {meus.length === 0 && (
              <div className="col-span-full flex flex-col items-center gap-2 py-8 text-center">
                <Upload size={22} className="text-[var(--ws-text-3)] opacity-50" />
                <span className="text-[11px] text-[var(--ws-text-3)]">Nenhum modelo seu ainda. Use <b>Carregar modelo</b> para salvar uma referência.</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
