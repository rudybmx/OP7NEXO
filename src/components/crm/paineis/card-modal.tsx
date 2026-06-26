'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calendar, Flag, MessageCircle, Plus, Trash2, X, User, Bot, ExternalLink, Phone } from 'lucide-react'
import Link from 'next/link'
import type { CardApi, KanbanCard, KanbanColuna, ResponsavelApi } from '@/types/kanban'
import type { CardPatch } from '@/hooks/use-paineis'
import { PRIORIDADE_CONFIG, PRIORIDADES, isVencido, formatarDataHora, formatarTelefone } from './_shared'
import { SecaoAnaliseContato } from './secao-analise-contato'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

export interface AgenteOpcao {
  id: string
  nome: string
}

interface CardModalProps {
  card: KanbanCard | null
  colunas: KanbanColuna[]
  responsaveis: ResponsavelApi[]
  agentes: AgenteOpcao[]
  aberto: boolean
  onFechar: () => void
  onAtualizar: (cardId: string, patch: CardPatch) => Promise<void> | void
  onExcluir: (cardId: string) => Promise<void> | void
  onComentar: (cardId: string, texto: string) => Promise<void> | void
  onSalvarValores: (cardId: string, valores: { campo_id: string; valor: unknown }[]) => Promise<void> | void
  onCriarCampo: (nome: string, tipo: string) => Promise<void> | void
  obterCard: (cardId: string) => Promise<CardApi>
}

const SEM = '__none__'

export function CardModal({
  card,
  colunas,
  responsaveis,
  agentes,
  aberto,
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
  const [comentarios, setComentarios] = useState<NonNullable<CardApi['comentarios']>>([])

  useEffect(() => {
    if (card) {
      setTitulo(card.titulo)
      setDescricao(card.descricao ?? '')
    }
  }, [card])

  useEffect(() => {
    if (!aberto || !card) return
    let cancelado = false
    obterCard(card.id)
      .then((d) => {
        if (!cancelado) setComentarios(d.comentarios ?? [])
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [aberto, card, obterCard])

  const refrescarComentarios = useCallback(
    async (cardId: string) => {
      try {
        const d = await obterCard(cardId)
        setComentarios(d.comentarios ?? [])
      } catch {
        /* noop */
      }
    },
    [obterCard],
  )

  if (!card) return null
  const cardId = card.id
  const vencido = isVencido(card.dataVencimento)

  // valor do select de responsável: a:<id> | u:<id> | SEM
  const responsavelValue =
    card.responsavelTipo === 'agente' && card.responsavelAgenteId
      ? `a:${card.responsavelAgenteId}`
      : card.responsavelTipo === 'usuario' && card.responsavelUserId
        ? `u:${card.responsavelUserId}`
        : SEM

  function escolherResponsavel(v: string) {
    if (v === SEM) {
      onAtualizar(cardId, { responsavel_user_id: null, responsavel_agente_id: null })
    } else if (v.startsWith('a:')) {
      onAtualizar(cardId, { responsavel_agente_id: v.slice(2) })
    } else if (v.startsWith('u:')) {
      onAtualizar(cardId, { responsavel_user_id: v.slice(2) })
    }
  }

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

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent
        className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-[920px]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Detalhe do card</DialogTitle>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <Textarea
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={salvarTitulo}
            rows={1}
            className="resize-none border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
            placeholder="Nome do card"
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

        {/* Corpo 2 colunas */}
        <div className="grid max-h-[calc(92vh-64px)] grid-cols-1 overflow-y-auto md:grid-cols-[1fr_300px]">
          {/* ESQUERDA — conteúdo */}
          <div className="min-w-0 space-y-4 border-border p-6 md:border-r">
            {/* Contato */}
            {(card.nome || card.telefone || card.contatoId) && (
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="ds-kpi-label mb-1.5 text-muted-foreground">Contato</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {card.nome ?? 'Sem nome'}
                    </div>
                    {card.telefone && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3" /> {formatarTelefone(card.telefone)}
                      </div>
                    )}
                  </div>
                  {card.contatoId && (
                    <Link
                      href={`/crm/atendimento/contatos?contato_id=${card.contatoId}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/5"
                    >
                      Ver cadastro <ExternalLink className="size-3" />
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Análise IA (dado real do contato) */}
            <SecaoAnaliseContato contatoId={card.contatoId} ativo={aberto} />

            {/* Descrição */}
            <div>
              <div className="ds-kpi-label mb-1.5 text-muted-foreground">Descrição</div>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                onBlur={salvarDescricao}
                placeholder="Adicionar descrição..."
                rows={4}
                className="text-sm"
              />
            </div>

            {/* Comentários — linha do tempo imutável */}
            <div>
              <div className="ds-kpi-label mb-2 flex items-center gap-1.5 text-muted-foreground">
                <MessageCircle className="size-3.5" /> Histórico
                {comentarios.length > 0 && ` (${comentarios.length})`}
              </div>

              {comentarios.length > 0 ? (
                <ol className="relative mb-4 space-y-3 border-l border-border pl-4">
                  {comentarios.map((c) => (
                    <li key={c.id} className="relative">
                      <span className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-background bg-primary" />
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          {c.autor_nome ?? 'Usuário'}
                        </span>
                        <span className="text-micro text-muted-foreground">
                          {formatarDataHora(c.criado_em)}
                        </span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {c.texto}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mb-3 text-xs text-muted-foreground">
                  Sem registros ainda. Comentários ficam permanentes (não podem ser apagados).
                </p>
              )}

              <div className="flex flex-col gap-2">
                <Textarea
                  value={comentarioTexto}
                  onChange={(e) => setComentarioTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarComentario()
                  }}
                  placeholder="Registrar no histórico... (Ctrl+Enter para enviar)"
                  rows={2}
                  className="text-sm"
                />
                {comentarioTexto.trim() && (
                  <Button size="sm" className="self-start" onClick={enviarComentario}>
                    Registrar
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* DIREITA — propriedades */}
          <div className="space-y-4 bg-muted/20 p-6">
            {/* Status */}
            <Prop label="Status">
              <Select value={card.status} onValueChange={(v) => onAtualizar(cardId, { fase_id: v })}>
                <SelectTrigger className="h-8 w-full">
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
            </Prop>

            {/* Responsável: pessoas + agentes */}
            <Prop label="Responsável">
              <Select value={responsavelValue} onValueChange={escolherResponsavel}>
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem responsável</SelectItem>
                  {responsaveis.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1.5">
                        <User className="size-3" /> Pessoas
                      </SelectLabel>
                      {responsaveis.map((u) => (
                        <SelectItem key={u.id} value={`u:${u.id}`}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {agentes.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1.5">
                        <Bot className="size-3" /> Agentes IA
                      </SelectLabel>
                      {agentes.map((a) => (
                        <SelectItem key={a.id} value={`a:${a.id}`}>
                          <span className="flex items-center gap-2">
                            <Bot className="size-3 text-primary" /> {a.nome}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </Prop>

            {/* Prioridade */}
            <Prop label="Prioridade">
              <Select
                value={card.prioridade ?? SEM}
                onValueChange={(v) => onAtualizar(cardId, { prioridade: v === SEM ? null : v })}
              >
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="Sem prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem prioridade</SelectItem>
                  {PRIORIDADES.map((pp) => (
                    <SelectItem key={pp} value={pp}>
                      <span className="flex items-center gap-2">
                        <Flag className="size-3" /> {PRIORIDADE_CONFIG[pp].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Prop>

            {/* Vencimento */}
            <Prop label="Vencimento">
              <div className="flex items-center gap-2">
                <Calendar className={`size-3.5 ${vencido ? 'text-destructive' : 'text-muted-foreground'}`} />
                <Input
                  type="date"
                  value={card.dataVencimento ?? ''}
                  onChange={(e) => onAtualizar(cardId, { data_vencimento: e.target.value || null })}
                  className={`h-8 w-full ${vencido ? 'text-destructive' : ''}`}
                />
              </div>
              {vencido && <span className="mt-1 block text-micro font-semibold text-destructive">VENCIDO</span>}
            </Prop>

            {/* Campos custom */}
            {(card.camposCustom ?? []).map((campo) => (
              <Prop key={campo.id} label={campo.nome}>
                {campo.tipo === 'checkbox' ? (
                  <input
                    type="checkbox"
                    defaultChecked={Boolean(campo.valor)}
                    onChange={(e) => onSalvarValores(cardId, [{ campo_id: campo.id, valor: e.target.checked }])}
                    className="size-4 accent-[var(--primary)]"
                  />
                ) : campo.tipo === 'select' ? (
                  <Select
                    value={campo.valor != null ? String(campo.valor) : SEM}
                    onValueChange={(v) =>
                      onSalvarValores(cardId, [{ campo_id: campo.id, valor: v === SEM ? null : v }])
                    }
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM}>—</SelectItem>
                      {(campo.opcoes ?? []).map((op) => (
                        <SelectItem key={op} value={op}>
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={campo.tipo === 'numero' ? 'number' : campo.tipo === 'data' ? 'date' : 'text'}
                    defaultValue={campo.valor != null ? String(campo.valor) : ''}
                    onBlur={(e) => onSalvarValores(cardId, [{ campo_id: campo.id, valor: e.target.value }])}
                    placeholder="Valor..."
                    className="h-8 w-full"
                  />
                )}
              </Prop>
            ))}

            {/* Adicionar campo */}
            {showNovoCampo ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  value={novoCampoNome}
                  onChange={(e) => setNovoCampoNome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') adicionarCampo()
                    if (e.key === 'Escape') setShowNovoCampo(false)
                  }}
                  placeholder="Nome do campo..."
                  className="h-8"
                />
                <Button size="sm" variant="secondary" onClick={adicionarCampo}>
                  OK
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setShowNovoCampo(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                <Plus className="size-3" /> Adicionar campo
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="ds-kpi-label mb-1 text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}
