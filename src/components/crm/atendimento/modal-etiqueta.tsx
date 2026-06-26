'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  ETIQUETA_CORES,
  ETIQUETA_NUM_COLUNAS,
  ETIQUETA_COR_PADRAO,
  corDoCheck,
} from './etiqueta-cores'

export interface EtiquetaModalValor {
  id: string
  nome: string
  cor: string
}

interface ModalEtiquetaProps {
  open: boolean
  /** Quando presente, o modal abre em modo edição. */
  etiqueta?: EtiquetaModalValor | null
  onClose: () => void
  /** Cria ou edita; retorna true em sucesso. Mensagem de erro opcional para feedback. */
  onSalvar: (dados: { nome: string; cor: string }) => Promise<{ ok: boolean; erro?: string }>
}

export function ModalEtiqueta({ open, etiqueta, onClose, onSalvar }: ModalEtiquetaProps) {
  const editando = Boolean(etiqueta)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(ETIQUETA_COR_PADRAO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Reinicializa o formulário sempre que abre (ou troca o alvo de edição).
  useEffect(() => {
    if (open) {
      setNome(etiqueta?.nome ?? '')
      setCor(etiqueta?.cor ?? ETIQUETA_COR_PADRAO)
      setErro(null)
      setSalvando(false)
    }
  }, [open, etiqueta])

  async function salvar() {
    const limpo = nome.trim()
    if (!limpo) {
      setErro('Informe o nome da etiqueta')
      return
    }
    setSalvando(true)
    setErro(null)
    const res = await onSalvar({ nome: limpo, cor })
    setSalvando(false)
    if (res.ok) {
      onClose()
    } else {
      setErro(res.erro || 'Não foi possível salvar a etiqueta')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-[min(440px,calc(100vw-32px))] gap-0 rounded-2xl border-0 bg-white p-0 text-gray-800"
      >
        <DialogTitle className="px-6 pt-6 text-center text-base font-semibold text-gray-800">
          {editando ? 'Editar etiqueta' : 'Nova etiqueta'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {editando ? 'Editar nome e cor da etiqueta' : 'Criar uma nova etiqueta com nome e cor'}
        </DialogDescription>

        <div className="flex flex-col gap-5 px-6 pb-6 pt-5">
          {/* Nome */}
          <div className="flex flex-col gap-2">
            <label htmlFor="etiqueta-nome" className="text-sm font-medium text-gray-700">
              Nome da Etiqueta
            </label>
            <input
              id="etiqueta-nome"
              type="text"
              value={nome}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') salvar() }}
              maxLength={80}
              className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:bg-gray-200/70"
              placeholder=""
            />
          </div>

          {/* Cor */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Cor</label>
            <span className="text-xs text-gray-400">Selecione a cor da etiqueta</span>
            <div
              className="mt-3 grid gap-2.5"
              style={{ gridTemplateColumns: `repeat(${ETIQUETA_NUM_COLUNAS}, minmax(0, 1fr))` }}
            >
              {ETIQUETA_CORES.map((hex) => {
                const sel = hex.toLowerCase() === cor.toLowerCase()
                return (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Cor ${hex}`}
                    aria-pressed={sel}
                    onClick={() => setCor(hex)}
                    className="relative flex aspect-square items-center justify-center rounded-full transition-transform hover:scale-110"
                    style={{ background: hex, boxShadow: sel ? '0 0 0 2px #fff, 0 0 0 4px rgba(0,0,0,0.25)' : undefined }}
                  >
                    {sel && <Check size={13} strokeWidth={3} color={corDoCheck(hex)} />}
                  </button>
                )
              })}
            </div>
          </div>

          {erro && <p className="text-xs text-red-500">{erro}</p>}

          {/* Footer */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || !nome.trim()}
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: '#006EFF' }}
            >
              {salvando && <Loader2 size={15} className="animate-spin" />}
              {editando ? 'Salvar' : 'Criar etiqueta'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
