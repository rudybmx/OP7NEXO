'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useAjustesResposta } from '@/hooks/use-ajustes-resposta'

export function ModalSugerirResposta({
  conversaId,
  mensagemId,
  respostaOriginal,
  onClose,
}: {
  conversaId: string
  mensagemId: string
  respostaOriginal: string
  onClose: () => void
}) {
  const { sugerir } = useAjustesResposta()
  const [texto, setTexto] = useState('')
  const [categoria, setCategoria] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const t = texto.trim()
    if (!t) {
      toast.error('Escreva a resposta sugerida')
      return
    }
    setSalvando(true)
    try {
      await sugerir(conversaId, {
        mensagem_id: mensagemId,
        resposta_original: respostaOriginal,
        resposta_sugerida: t,
        categoria: categoria.trim() || null,
      })
      toast.success('Sugestão salva na central do agente')
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar sugestão')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sugerir resposta melhor</DialogTitle>
          <DialogDescription>
            Fica salva na central do agente para curadoria e treino futuro. Não altera a mensagem já enviada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="ds-label mb-1 text-muted-foreground">Resposta do agente</div>
            <div className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-sm text-muted-foreground">
              {respostaOriginal || '—'}
            </div>
          </div>
          <div>
            <div className="ds-label mb-1">Resposta sugerida</div>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Como o agente deveria ter respondido…"
            />
          </div>
          <div>
            <div className="ds-label mb-1 text-muted-foreground">Categoria (opcional)</div>
            <input
              className="w-full rounded-md border bg-card px-3 py-2 text-sm"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="ex.: tom, oportunidade, factual"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar sugestão'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
