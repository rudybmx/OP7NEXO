'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calendar, Flag, MessageCircle, Plus, Trash2, X } from 'lucide-react'
import type { CardApi, KanbanCard, KanbanColuna, Prioridade, ResponsavelApi } from '@/types/kanban'
import type { CardPatch } from '@/hooks/use-paineis'
import { PRIORIDADE_CONFIG, PRIORIDADES, isVencido, formatarData } from './_shared'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

interface CardModalProps {
  card: KanbanCard | null
  colunas: KanbanColuna[]
  responsaveis: ResponsavelApi[]
  aberto: boolean
  modo?: 'lateral' | 'central'
  onFechar: () => void
  onAtualizar: (cardId: string, patch: CardPatch) => Promise<void> | void
  onExcluir: (cardId: string) => Promise<void> | void
  onComentar: (cardId: string, texto: string) => Promise<void> | void
  onSalvarValores: (cardId: string, valores: { campo_id: string; valor: unknown }[]) => Promise<void> | void
  onCriarCampo: (nome: string, tipo: string) => Promise<void> | void
  obterCard: (cardId: string) => Promise<CardApi>
}

const SEM_RESPONSAVEL = '__none__'

export function CardModal({
  card,
  colunas,
  responsaveis,
  aberto,
  modo = 'lateral',
  onFechar,
  onAtualizar,
  onExcluir,
  onComentar,
  onSalvarValores,
  onCriarCampo,
  obterCard,
}: CardModalProps) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [comentarioTexto, setComentarioTexto] = useState('')
  const [novoCampoNome, setNovoCampoNome] = useState('')
  const [showNovoCampo, setShowNovoCampo] = useState(false)
  const [comentarios, setComentarios] = useState<CardApi['comentarios']>([])

  // Sincroniza estado local ao abrir/trocar card.
  useEffect(() => {
    if (card) {
      setTitulo(card.titulo)
      setDescricao(card.descricao ?? '')
      setComentarios(card.comentarios?.map((c) => ({
        id: c.id,
        autor_user_id: null,
        autor_nome: c.autor,
        texto: c.texto,
        criado_em: c.criadoEm,
      })) ?? [])
    }
  }, [card])

  // Carrega o detalhe (comentários) ao abrir.
  useEffect(() => {
    if (!aberto || !card) return
    let cancelado = false
    obterCard(card.id)
      .then((detalhe) => {
        if (!cancelado) setComentarios(detalhe.comentarios ?? [])
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [aberto, card, obterCard])

  const refrescarComentarios = useCallback(
    async (cardId: string) => {
      try {
        const detalhe = await obterCard(cardId)
        setComentarios(detalhe.comentarios ?? [])
      } catch {
        /* noop */
      }
    },
    [obterCard],
  )

  if (!card) return null
  const cardId = card.id
  const coluna = colunas.find((c) => c.id === card.status)
  const vencido = isVencido(card.dataVencimento)

  function salvarTitulo() {
    const t = titulo.trim()
    if (t && t !== card!.titulo) onAtualizar(cardId, { titulo: t })
  }

  function salvarDescricao() {
    if (descricao !== (card!.descricao ?? '')) onAtualizar(cardId, { descricao: descricao || null })
  }

  async function enviarComentario() {
    const texto = comentarioTexto.trim()
    if (!texto) return
    setComentarioTexto('')
    await onComentar(cardId, texto)
    await refrescarComentarios(cardId)
  }

  function adicionarCampo() {
    const nome = novoCampoNome.trim()
    if (!nome) {
      setShowNovoCampo(false)
      return
    }
    onCriarCampo(nome, 'texto')
    setNovoCampoNome('')
    setShowNovoCampo(false)
  }

  function salvarValorCampo(campoId: string, valor: unknown) {
    onSalvarValores(cardId, [{ campo_id: campoId, valor }])
  }

  const Conteudo = (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-6 pt-6">
        <Textarea
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={salvarTitulo}
          rows={2}
          className="resize-none border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          placeholder="Título do card"
        />
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => onExcluir(cardId)}
            title="Excluir card"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            onClick={onFechar}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Propriedades */}
      <div className="flex flex-col gap-3 border-b border-border px-6 pb-5 pt-4">
        {/* Status */}
        <PropRow label="Status">
          <Select
            value={card.status}
            onValueChange={(v) => onAtualizar(cardId, { fase_id: v })}
          >
            <SelectTrigger className="h-8 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {colunas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: c.cor }} />
                    {c.nome}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PropRow>

        {/* Responsável */}
        <PropRow label="Responsável">
          <Select
            value={card.responsavelUserId ?? SEM_RESPONSAVEL}
            onValueChange={(v) =>
              onAtualizar(cardId, { responsavel_user_id: v === SEM_RESPONSAVEL ? null : v })
            }
          >
            <SelectTrigger className="h-8 w-56">
              <SelectValue placeholder="Sem responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
              {responsaveis.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PropRow>

        {/* Prioridade */}
        <PropRow label="Prioridade">
          <Select
            value={card.prioridade ?? SEM_RESPONSAVEL}
            onValueChange={(v) =>
              onAtualizar(cardId, { prioridade: v === SEM_RESPONSAVEL ? null : v })
            }
          >
            <SelectTrigger className="h-8 w-56">
              <SelectValue placeholder="Sem prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_RESPONSAVEL}>Sem prioridade</SelectItem>
              {PRIORIDADES.map((p) => (
                <SelectItem key={p} value={p}>
                  <span className="flex items-center gap-2">
                    <Flag className="size-3" /> {PRIORIDADE_CONFIG[p].label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PropRow>

        {/* Vencimento */}
        <PropRow label="Vencimento">
          <div className="flex items-center gap-2">
            <Calendar className={`size-3.5 ${vencido ? 'text-destructive' : 'text-muted-foreground'}`} />
            <Input
              type="date"
              value={card.dataVencimento ?? ''}
              onChange={(e) => onAtualizar(cardId, { data_vencimento: e.target.value || null })}
              className={`h-8 w-44 ${vencido ? 'text-destructive' : ''}`}
            />
            {vencido && <span className="text-micro font-semibold text-destructive">VENCIDO</span>}
          </div>
        </PropRow>

        {/* Campos custom */}
        {(card.camposCustom ?? []).map((campo) => (
          <PropRow key={campo.id} label={campo.nome}>
            {campo.tipo === 'checkbox' ? (
              <input
                type="checkbox"
                defaultChecked={Boolean(campo.valor)}
                onChange={(e) => salvarValorCampo(campo.id, e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
            ) : (
              <Input
                type={campo.tipo === 'numero' ? 'number' : campo.tipo === 'data' ? 'date' : 'text'}
                defaultValue={campo.valor != null ? String(campo.valor) : ''}
                onBlur={(e) => salvarValorCampo(campo.id, e.target.value)}
                placeholder="Valor..."
                className="h-8 w-56"
              />
            )}
          </PropRow>
        ))}

        {/* Adicionar campo */}
        {showNovoCampo ? (
          <div className="flex items-center gap-2 pl-[120px]">
            <Input
              autoFocus
              value={novoCampoNome}
              onChange={(e) => setNovoCampoNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') adicionarCampo()
                if (e.key === 'Escape') setShowNovoCampo(false)
              }}
              placeholder="Nome do campo..."
              className="h-8 w-44"
            />
            <Button size="sm" variant="secondary" onClick={adicionarCampo}>
              OK
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setShowNovoCampo(true)}
            className="ml-[120px] flex items-center gap-1.5 self-start text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            <Plus className="size-3" /> Adicionar campo
          </button>
        )}
      </div>

      {/* Descrição */}
      <div className="border-b border-border px-6 py-4">
        <div className="ds-kpi-label mb-2 text-muted-foreground">Descrição</div>
        <Textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          onBlur={salvarDescricao}
          placeholder="Adicionar descrição..."
          rows={4}
          className="text-sm"
        />
      </div>

      {/* Comentários */}
      <div className="flex-1 px-6 py-4">
        <div className="ds-kpi-label mb-3 flex items-center gap-1.5 text-muted-foreground">
          <MessageCircle className="size-3.5" /> Comentários
          {(comentarios ?? []).length > 0 && ` (${comentarios!.length})`}
        </div>

        <div className="mb-4 flex flex-col gap-2.5">
          {(comentarios ?? []).map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                {(c.autor_nome ?? 'U').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <div className="mb-0.5 text-xs font-semibold text-foreground">
                  {c.autor_nome ?? 'Usuário'}{' '}
                  <span className="font-normal text-muted-foreground">· {formatarData(c.criado_em?.slice(0, 10))}</span>
                </div>
                <div className="text-sm leading-relaxed text-muted-foreground">{c.texto}</div>
              </div>
            </div>
          ))}
          {(comentarios ?? []).length === 0 && (
            <div className="text-xs text-muted-foreground">Nenhum comentário ainda.</div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Textarea
            value={comentarioTexto}
            onChange={(e) => setComentarioTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarComentario()
            }}
            placeholder="Adicionar comentário... (Ctrl+Enter para enviar)"
            rows={2}
            className="text-sm"
          />
          {comentarioTexto.trim() && (
            <Button size="sm" className="self-start" onClick={enviarComentario}>
              Comentar
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  if (modo === 'central') {
    return (
      <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-[680px]" showCloseButton={false}>
          <DialogTitle className="sr-only">Detalhe do card</DialogTitle>
          {Conteudo}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[520px]" showCloseButton={false}>
        <SheetTitle className="sr-only">Detalhe do card</SheetTitle>
        {Conteudo}
      </SheetContent>
    </Sheet>
  )
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="ds-kpi-label w-[108px] shrink-0 truncate text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
