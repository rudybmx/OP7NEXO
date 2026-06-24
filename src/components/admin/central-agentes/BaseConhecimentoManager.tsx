'use client'

import React, { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { type KbInput, useBaseConhecimento } from '@/hooks/use-base-conhecimento'

const inputCls = 'w-full rounded-lg px-3 py-2 text-sm outline-none border'
const inputStyle: React.CSSProperties = { borderColor: 'var(--ws-glass-border)', background: 'var(--card)', color: 'var(--ws-text-1)' }

type Tipo = 'faq' | 'documento' | 'url'

export function BaseConhecimentoManager({ workspaceId, agenteId }: { workspaceId: string | null; agenteId: string | null }) {
  const { itens, carregando, carregar, adicionar, remover } = useBaseConhecimento(workspaceId, agenteId)
  const [tipo, setTipo] = useState<Tipo>('faq')
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [url, setUrl] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { carregar() }, [carregar])

  async function onAdd() {
    if (tipo === 'url' && !url.trim()) { toast.error('Informe a URL'); return }
    if (tipo !== 'url' && !conteudo.trim()) { toast.error('Informe o conteúdo'); return }
    setSalvando(true)
    try {
      const payload: KbInput = tipo === 'url'
        ? { tipo, titulo: titulo || null, url }
        : { tipo, titulo: titulo || null, conteudo }
      const r = await adicionar(payload)
      toast.success(`Indexado em ${r.chunks} trecho(s)`)
      setTitulo(''); setConteudo(''); setUrl('')
      carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao indexar')
    } finally {
      setSalvando(false)
    }
  }

  async function onDel(id: string) {
    try {
      await remover(id)
      carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao remover')
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex gap-2">
          <select className={inputCls} style={{ ...inputStyle, width: 140 }} value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
            <option value="faq">FAQ</option>
            <option value="documento">Documento</option>
            <option value="url">URL</option>
          </select>
          <input className={inputCls} style={inputStyle} placeholder="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        {tipo === 'url' ? (
          <input className={inputCls} style={inputStyle} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        ) : (
          <textarea className={inputCls} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="Cole o texto a indexar…" value={conteudo} onChange={(e) => setConteudo(e.target.value)} />
        )}
        <p className="text-xs" style={{ color: 'var(--ws-text-2)' }}>PDF não suportado nesta fase — cole o texto como Documento.</p>
        <button onClick={onAdd} disabled={salvando} className="px-3 py-2 text-sm rounded-lg font-medium inline-flex items-center gap-2" style={{ background: '#c9a84c', color: '#1a1205' }}>
          {salvando && <Loader2 size={15} className="animate-spin" />}Indexar
        </button>
      </div>

      <div className="space-y-1">
        {carregando && <Loader2 className="animate-spin" size={16} />}
        {!carregando && itens.length === 0 && <p className="text-xs" style={{ color: 'var(--ws-text-2)' }}>Nenhum item indexado.</p>}
        {itens.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--card)', border: '1px solid var(--ws-glass-border)' }}>
            <div className="min-w-0">
              <span className="text-xs font-medium" style={{ color: 'var(--ws-text-1)' }}>{it.titulo || '(sem título)'}</span>
              <span className="text-xs ml-2" style={{ color: 'var(--ws-text-2)' }}>{it.tipo}</span>
              <p className="text-xs truncate" style={{ color: 'var(--ws-text-2)' }}>{it.preview}</p>
            </div>
            <button onClick={() => onDel(it.id)} aria-label="Remover"><Trash2 size={15} style={{ color: 'var(--ws-coral)' }} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
