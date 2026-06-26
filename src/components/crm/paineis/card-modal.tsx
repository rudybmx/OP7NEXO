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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

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

function iniciais(nome?: string | null): string {
  if (!nome) return '?'
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

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

  const responsavelValue =
    card.responsavelTipo === 'agente' && card.responsavelAgenteId
      ? `a:${card.responsavelAgenteId}`
      : card.responsavelTipo === 'usuario' && card.responsavelUserId
        ? `u:${card.responsavelUserId}`
        : SEM

  function escolherResponsavel(v: string) {
    if (v === SEM) onAtualizar(cardId, { responsavel_user_id: null, responsavel_agente_id: null })
    else if (v.startsWith('a:')) onAtualizar(cardId, { responsavel_agente_id: v.slice(2) })
    else if (v.startsWith('u:')) onAtualizar(cardId, { responsavel_user_id: v.slice(2) })
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
        className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[900px]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Detalhe do card</DialogTitle>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b px-6 py-4">
          <Textarea
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={salvarTitulo}
            rows={1}
            className="min-h-9 resize-none border-0 bg-transparent px-0 py-1 text-base font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent"
            placeholder="Nome do card"
          />
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" onClick={() => onExcluir(cardId)} title="Excluir card" className="text-muted-foreground hover:text-destructive">
              <Trash2 className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onFechar} title="Fechar" className="text-muted-foreground">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Corpo 2 colunas */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[1fr_280px]">
          {/* ESQUERDA — conteúdo */}
          <div className="min-w-0 space-y-5 p-6">
            {/* Contato */}
            {(card.nome || card.telefone || card.contatoId) && (
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Contato
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                        {iniciais(card.nome)}
                      </AvatarFallback>
                    </Avatar>
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
                  </div>
                  {card.contatoId && (
                    <Button asChild variant="outline" size="xs" className="shrink-0">
                      <Link href={`/crm/atendimento/contatos?contato_id=${card.contatoId}`}>
                        Ver cadastro <ExternalLink className="size-3" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Análise IA */}
            <SecaoAnaliseContato contatoId={card.contatoId} ativo={aberto} />

            {/* Descrição */}
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Descrição
              </div>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                onBlur={salvarDescricao}
                placeholder="Adicionar descrição..."
                rows={4}
                className="resize-none text-sm"
              />
            </div>

            {/* Histórico (timeline imutável) */}
            <div>
              <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <MessageCircle className="size-3.5" /> Histórico
                {comentarios.length > 0 && <span className="text-muted-foreground/70">· {comentarios.length}</span>}
              </div>

              {comentarios.length > 0 ? (
                <ol className="mb-4 space-y-4">
                  {comentarios.map((c) => (
                    <li key={c.id} className="flex gap-3">
                      <Avatar className="mt-0.5 size-7 shrink-0">
                        <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground">
                          {iniciais(c.autor_nome)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium text-foreground">{c.autor_nome ?? 'Usuário'}</span>
                          <span className="text-micro text-muted-foreground">{formatarDataHora(c.criado_em)}</span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {c.texto}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mb-3 text-xs text-muted-foreground">
                  Sem registros ainda. O histórico é permanente — comentários não podem ser apagados.
                </p>
              )}

              <div className="flex flex-col items-end gap-2">
                <Textarea
                  value={comentarioTexto}
                  onChange={(e) => setComentarioTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarComentario()
                  }}
                  placeholder="Registrar no histórico... (Ctrl+Enter para enviar)"
                  rows={2}
                  className="resize-none text-sm"
                />
                {comentarioTexto.trim() && (
                  <Button size="sm" onClick={enviarComentario}>
                    Registrar
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* DIREITA — propriedades */}
          <div className="space-y-4 border-t p-6 md:border-l md:border-t-0">
            <Prop label="Status">
              <Select value={card.status} onValueChange={(v) => onAtualizar(cardId, { fase_id: v })}>
                <SelectTrigger className="h-9 w-full">
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

            <Prop label="Responsável">
              <Select value={responsavelValue} onValueChange={escolherResponsavel}>
                <SelectTrigger className="h-9 w-full">
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

            <Prop label="Prioridade">
              <Select
                value={card.prioridade ?? SEM}
                onValueChange={(v) => onAtualizar(cardId, { prioridade: v === SEM ? null : v })}
              >
                <SelectTrigger className="h-9 w-full">
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

            <Prop label="Vencimento">
              <div className="relative">
                <Calendar
                  className={`pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 ${
                    vencido ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                />
                <Input
                  type="date"
                  value={card.dataVencimento ?? ''}
                  onChange={(e) => onAtualizar(cardId, { data_vencimento: e.target.value || null })}
                  className={`h-9 w-full pl-8 ${vencido ? 'border-destructive/40 text-destructive' : ''}`}
                />
              </div>
              {vencido && <span className="mt-1 block text-micro font-semibold text-destructive">Vencido</span>}
            </Prop>

            {/* Campos custom */}
            {(card.camposCustom ?? []).map((campo) => (
              <Prop key={campo.id} label={campo.nome}>
                {campo.tipo === 'checkbox' ? (
                  <label className="flex h-9 items-center">
                    <input
                      type="checkbox"
                      defaultChecked={Boolean(campo.valor)}
                      onChange={(e) => onSalvarValores(cardId, [{ campo_id: campo.id, valor: e.target.checked }])}
                      className="size-4 accent-[var(--primary)]"
                    />
                  </label>
                ) : campo.tipo === 'select' ? (
                  <Select
                    value={campo.valor != null ? String(campo.valor) : SEM}
                    onValueChange={(v) => onSalvarValores(cardId, [{ campo_id: campo.id, valor: v === SEM ? null : v }])}
                  >
                    <SelectTrigger className="h-9 w-full">
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
                    className="h-9 w-full"
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
                  className="h-9"
                />
                <Button size="sm" variant="secondary" onClick={adicionarCampo}>
                  OK
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNovoCampo(true)}
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
              >
                <Plus className="size-3.5" /> Adicionar campo
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}
