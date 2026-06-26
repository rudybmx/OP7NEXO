'use client'

import { useState } from 'react'
import { Plus, X, Pencil, Trash2, Check, Tag } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import type { Etiqueta } from '@/hooks/use-etiquetas'
import { ModalEtiqueta, type EtiquetaModalValor } from './modal-etiqueta'

interface EtiquetasContatoProps {
  contatoId: string
  etiquetasContato: Array<{ id: string; nome: string; cor: string }>
  etiquetasWorkspace: Etiqueta[]
  onAplicar: (contatoId: string, etiquetaId: string) => Promise<boolean>
  onRemover: (contatoId: string, etiquetaId: string) => Promise<boolean>
  onCriar: (nome: string, cor: string) => Promise<Etiqueta | null>
  onEditar: (id: string, patch: { nome?: string; cor?: string }) => Promise<Etiqueta | null>
  onExcluir: (id: string) => Promise<boolean>
  onAtualizar?: () => void
}

export function EtiquetasContato({
  contatoId,
  etiquetasContato,
  etiquetasWorkspace,
  onAplicar,
  onRemover,
  onCriar,
  onEditar,
  onExcluir,
  onAtualizar,
}: EtiquetasContatoProps) {
  const [popoverAberto, setPopoverAberto] = useState(false)
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<EtiquetaModalValor | null>(null)
  const [busy, setBusy] = useState(false)

  const aplicadas = new Set(etiquetasContato.map((e) => e.id))

  async function toggle(etiquetaId: string) {
    if (busy) return
    setBusy(true)
    const ok = aplicadas.has(etiquetaId)
      ? await onRemover(contatoId, etiquetaId)
      : await onAplicar(contatoId, etiquetaId)
    setBusy(false)
    if (ok) onAtualizar?.()
  }

  async function removerChip(etiquetaId: string) {
    if (busy) return
    setBusy(true)
    const ok = await onRemover(contatoId, etiquetaId)
    setBusy(false)
    if (ok) onAtualizar?.()
  }

  async function excluirEtiqueta(et: Etiqueta) {
    if (!window.confirm(`Excluir a etiqueta "${et.nome}"? Ela será removida de todos os contatos e conversas.`)) return
    const ok = await onExcluir(et.id)
    if (ok) onAtualizar?.()
  }

  async function salvarModal(dados: { nome: string; cor: string }) {
    if (editando) {
      const r = await onEditar(editando.id, dados)
      if (r) { onAtualizar?.(); return { ok: true } }
      return { ok: false, erro: 'Não foi possível salvar (nome já existe?)' }
    }
    const r = await onCriar(dados.nome, dados.cor)
    if (r) {
      // aplica automaticamente a etiqueta recém-criada ao contato
      const ok = await onAplicar(contatoId, r.id)
      if (ok) onAtualizar?.()
      return { ok: true }
    }
    return { ok: false, erro: 'Não foi possível criar (nome já existe?)' }
  }

  return (
    <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--ws-divider)', marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        Etiquetas
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {etiquetasContato.map((et) => (
          <span
            key={et.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 999,
              background: `${et.cor}22`,
              color: 'var(--ws-text-1)',
              border: `1px solid ${et.cor}66`,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 999, background: et.cor, flexShrink: 0 }} />
            {et.nome}
            <button
              type="button"
              aria-label={`Remover ${et.nome}`}
              onClick={() => removerChip(et.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-3)', display: 'inline-flex', padding: 0 }}
            >
              <X size={11} />
            </button>
          </span>
        ))}

        {/* Botão adicionar / seletor */}
        <Popover open={popoverAberto} onOpenChange={setPopoverAberto}>
          <PopoverTrigger asChild>
            <button
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 999,
                background: 'transparent',
                color: 'var(--ws-blue)',
                border: '1px dashed var(--ws-glass-border)',
                cursor: 'pointer',
              }}
            >
              <Plus size={12} /> Adicionar
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <button
              type="button"
              onClick={() => { setEditando(null); setModalAberto(true); setPopoverAberto(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px',
                borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                color: 'var(--ws-blue)', background: 'rgba(0,110,255,0.08)', border: 'none', marginBottom: 6,
              }}
            >
              <Plus size={14} /> Nova etiqueta
            </button>

            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {etiquetasWorkspace.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--ws-text-3)', padding: '8px' }}>Nenhuma etiqueta ainda</span>
              )}
              {etiquetasWorkspace.map((et) => {
                const marcada = aplicadas.has(et.id)
                return (
                  <div
                    key={et.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 8 }}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(et.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0,
                        background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0,
                      }}
                    >
                      <span style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        border: marcada ? `1px solid ${et.cor}` : '1px solid var(--ws-glass-border)',
                        background: marcada ? et.cor : 'transparent', color: '#fff',
                      }}>
                        {marcada && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span style={{ width: 10, height: 10, borderRadius: 999, flexShrink: 0, background: et.cor }} />
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--ws-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {et.nome}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Editar ${et.nome}`}
                      onClick={() => { setEditando({ id: et.id, nome: et.nome, cor: et.cor }); setModalAberto(true); setPopoverAberto(false) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-3)', display: 'inline-flex', padding: 2 }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir ${et.nome}`}
                      onClick={() => excluirEtiqueta(et)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-coral, #e05555)', display: 'inline-flex', padding: 2 }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>

        {etiquetasContato.length === 0 && etiquetasWorkspace.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--ws-text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Tag size={11} /> Sem etiquetas
          </span>
        )}
      </div>

      <ModalEtiqueta
        open={modalAberto}
        etiqueta={editando}
        onClose={() => setModalAberto(false)}
        onSalvar={salvarModal}
      />
    </div>
  )
}
