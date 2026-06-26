'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  LayoutGrid,
  List,
  Search,
  Plus,
  Lock,
  Unlock,
  ChevronDown,
  Check,
  Bot,
  Sparkles,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import type { KanbanCard } from '@/types/kanban'
import { useWorkspace } from '@/lib/workspace-context'
import { usePaineis } from '@/hooks/use-paineis'
import { useAgentesDisponiveis } from '@/hooks/use-agentes-disponiveis'
import { usePersistedState } from '@/hooks/use-estado-persistido'
import { KanbanBoardComp } from './kanban-board'
import { ListaView } from './lista-view'
import { CardModal } from './card-modal'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type Visualizacao = 'kanban' | 'lista'

export function PaineisCRM() {
  const { workspaceAtual } = useWorkspace()
  const p = usePaineis(workspaceAtual)
  const { agentes } = useAgentesDisponiveis(workspaceAtual ?? undefined)
  const {
    boards,
    boardId,
    setBoardId,
    board,
    responsaveis,
    isLoading,
    error,
    extrairMensagem,
  } = p

  const [visualizacao, setVisualizacao] = usePersistedState<Visualizacao>('paineis:visualizacao', 'kanban')
  const [reordenavel, setReordenavel] = useState(false)
  const [busca, setBusca] = useState('')

  const [cardSelecionadoId, setCardSelecionadoId] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  const [novoPainelAberto, setNovoPainelAberto] = useState(false)
  const [novoPainelNome, setNovoPainelNome] = useState('')
  const [confirmacao, setConfirmacao] = useState<{ msg: string; resolve: (b: boolean) => void } | null>(null)

  const resumoAtivo = boards.find((b) => b.id === boardId)
  const cardSelecionado: KanbanCard | null =
    (board?.cards.find((c) => c.id === cardSelecionadoId) ?? null)

  // ── helpers ──────────────────────────────────────────────────────────────
  function pedirConfirmacao(msg: string): Promise<boolean> {
    return new Promise((resolve) => setConfirmacao({ msg, resolve }))
  }

  async function comErro<T>(fn: () => Promise<T>, fallback: string): Promise<T | undefined> {
    try {
      return await fn()
    } catch (e) {
      toast.error(extrairMensagem(e, fallback))
      return undefined
    }
  }

  function abrirCard(card: KanbanCard) {
    setCardSelecionadoId(card.id)
    setModalAberto(true)
  }
  function fecharModal() {
    setModalAberto(false)
    setCardSelecionadoId(null)
  }

  // ── ações ──────────────────────────────────────────────────────────────
  async function criarPainel() {
    const nome = novoPainelNome.trim()
    if (!nome) return
    await comErro(async () => {
      await p.criarPainel(nome)
      toast.success(`Painel "${nome}" criado.`)
    }, 'Erro ao criar painel.')
    setNovoPainelNome('')
    setNovoPainelAberto(false)
  }

  async function excluirPainel() {
    if (!resumoAtivo || resumoAtivo.sistema) return
    if (!(await pedirConfirmacao(`Excluir o painel "${resumoAtivo.nome}"?`))) return
    await comErro(async () => {
      await p.excluirPainel(resumoAtivo.id)
      toast.success('Painel excluído.')
    }, 'Erro ao excluir painel.')
  }

  async function novoCard() {
    if (!board || board.colunas.length === 0) return
    const primeira = [...board.colunas].sort((a, b) => a.ordem - b.ordem)[0]
    const novo = await comErro(
      () => Promise.resolve(p.criarCard(primeira.id, 'Novo card')),
      'Erro ao criar card.',
    )
    if (novo) {
      setCardSelecionadoId(novo.id)
      setModalAberto(true)
    }
  }

  // filtros de busca
  const cardsFiltrados =
    board && busca
      ? board.cards.filter((c) => c.titulo.toLowerCase().includes(busca.toLowerCase()))
      : (board?.cards ?? [])

  // ── render: estados ────────────────────────────────────────────────────
  if (!workspaceAtual) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Selecione um workspace para ver os painéis.</div>
    )
  }

  return (
    <div className="p-6 md:px-8" style={{ fontFamily: 'var(--font-sans-base)' }}>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        {/* Seletor de painel */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 outline-none">
                <h1 className="ds-page-title truncate text-foreground">{resumoAtivo?.nome ?? 'Painéis'}</h1>
                <ChevronDown className="size-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {boards.map((b) => (
                  <DropdownMenuItem key={b.id} onSelect={() => setBoardId(b.id)}>
                    {b.id === boardId ? (
                      <Check className="size-3.5 text-primary" />
                    ) : (
                      <span className="size-3.5" />
                    )}
                    <span className="flex-1 truncate">{b.nome}</span>
                    {b.sistema && <Sparkles className="size-3 text-primary" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setNovoPainelAberto(true)}>
                  <Plus className="size-3.5" /> Novo painel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Sub-linha: metadados + flags do painel */}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {board && (
              <span>
                {board.cards.length} cards · {board.colunas.length} fases
              </span>
            )}
            {resumoAtivo?.sistema && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-micro font-semibold text-primary">
                <Bot className="size-3" /> Sistema
              </span>
            )}
            {resumoAtivo && (
              <span className="inline-flex items-center gap-1.5">
                <Switch
                  checked={resumoAtivo.automacao_ativa}
                  onCheckedChange={(v) =>
                    comErro(() => Promise.resolve(p.toggleAutomacao(resumoAtivo.id, v)), 'Erro ao alterar automação.')
                  }
                  className="scale-75"
                  aria-label="Automação"
                />
                Automação
              </span>
            )}
            {resumoAtivo && (
              <button
                onClick={() =>
                  comErro(
                    () => Promise.resolve(p.toggleBloqueio(resumoAtivo.id, !resumoAtivo.bloqueado)),
                    'Erro ao alterar bloqueio.',
                  )
                }
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium transition-colors ${
                  resumoAtivo.bloqueado
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                title={resumoAtivo.bloqueado ? 'Estrutura de fases bloqueada' : 'Estrutura de fases liberada'}
              >
                {resumoAtivo.bloqueado ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                {resumoAtivo.bloqueado ? 'Fases bloqueadas' : 'Fases livres'}
              </button>
            )}
            {!resumoAtivo?.sistema && resumoAtivo && (
              <button onClick={excluirPainel} className="text-micro text-muted-foreground hover:text-destructive">
                Excluir painel
              </button>
            )}
          </div>
        </div>

        {/* Controles */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-8 w-44 pl-8 text-sm"
            />
          </div>

          {/* Cadeado de reordenação (UI local) */}
          <Button
            variant={reordenavel ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setReordenavel((v) => !v)}
            title={reordenavel ? 'Travar arrasto' : 'Liberar arrasto'}
          >
            {reordenavel ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
          </Button>

          {/* Visualização */}
          <ToggleGroup
            type="single"
            value={visualizacao}
            onValueChange={(v) => v && setVisualizacao(v as Visualizacao)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="kanban" aria-label="Kanban">
              <LayoutGrid className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="lista" aria-label="Lista">
              <List className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>

          <Button size="sm" onClick={novoCard} disabled={!board || board.colunas.length === 0}>
            <Plus className="size-3.5" /> Novo card
          </Button>
        </div>
      </div>

      {/* Stats por fase */}
      {board && (
        <div className="mb-5 flex flex-wrap gap-2">
          {[...board.colunas]
            .sort((a, b) => a.ordem - b.ordem)
            .map((coluna) => {
              const count = board.cards.filter((c) => c.status === coluna.id).length
              return (
                <div
                  key={coluna.id}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 shadow-sm"
                >
                  <span className="size-1.5 rounded-full" style={{ background: coluna.cor }} />
                  <span className="text-xs text-muted-foreground">{coluna.nome}</span>
                  <span className="text-xs font-semibold text-foreground">{count}</span>
                </div>
              )
            })}
          {reordenavel && (
            <div className="flex items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              <Unlock className="size-3" /> Modo reordenação ativo — arraste cards e fases
            </div>
          )}
        </div>
      )}

      {/* Corpo */}
      {isLoading && !board ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando painéis…
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-sm text-destructive">
          <AlertCircle className="size-5" />
          {extrairMensagem(error, 'Erro ao carregar painéis.')}
          <Button variant="outline" size="sm" onClick={() => p.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : !board ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Nenhum painel encontrado.</div>
      ) : visualizacao === 'kanban' ? (
        <KanbanBoardComp
          colunas={board.colunas}
          cards={cardsFiltrados}
          bloqueado={board.bloqueado}
          reordenavel={reordenavel}
          onCardClick={abrirCard}
          onCriarCard={(faseId, titulo) =>
            comErro(() => Promise.resolve(p.criarCard(faseId, titulo)), 'Erro ao criar card.')
          }
          onMoverCard={(cardId, faseId, ordem) =>
            comErro(() => Promise.resolve(p.moverCard(cardId, faseId, ordem)), 'Erro ao mover card.')
          }
          onReordenarFases={(ordem) =>
            comErro(() => Promise.resolve(p.reordenarFases(ordem)), 'Erro ao reordenar fases.')
          }
          onCriarFase={(nome) => comErro(() => Promise.resolve(p.criarFase(nome)), 'Erro ao criar fase.')}
          onRenomearFase={(faseId, nome) =>
            comErro(() => Promise.resolve(p.atualizarFase(faseId, { nome })), 'Erro ao renomear fase.')
          }
          onExcluirFase={async (faseId) => {
            if (!(await pedirConfirmacao('Excluir esta fase? Mova os cards antes.'))) return
            await comErro(() => Promise.resolve(p.excluirFase(faseId)), 'Erro ao excluir fase.')
          }}
        />
      ) : (
        <ListaView
          colunas={board.colunas}
          cards={cardsFiltrados}
          reordenavel={reordenavel}
          onCardClick={abrirCard}
          onCriarCard={(faseId, titulo) =>
            comErro(() => Promise.resolve(p.criarCard(faseId, titulo)), 'Erro ao criar card.')
          }
          onMoverCard={(cardId, faseId, ordem) =>
            comErro(() => Promise.resolve(p.moverCard(cardId, faseId, ordem)), 'Erro ao mover card.')
          }
        />
      )}

      {/* Modal do card */}
      <CardModal
        card={modalAberto ? cardSelecionado : null}
        colunas={board?.colunas ?? []}
        responsaveis={responsaveis}
        agentes={agentes.map((a) => ({ id: a.id, nome: a.nome }))}
        aberto={modalAberto && !!cardSelecionado}
        onFechar={fecharModal}
        onAtualizar={(cardId, patch) =>
          comErro(() => Promise.resolve(p.atualizarCard(cardId, patch)), 'Erro ao salvar card.')
        }
        onExcluir={async (cardId) => {
          if (!(await pedirConfirmacao('Excluir este card?'))) return
          await comErro(() => Promise.resolve(p.excluirCard(cardId)), 'Erro ao excluir card.')
          fecharModal()
        }}
        onComentar={(cardId, texto) =>
          comErro(() => Promise.resolve(p.comentar(cardId, texto)), 'Erro ao comentar.')
        }
        onSalvarValores={(cardId, valores) =>
          comErro(() => Promise.resolve(p.salvarValores(cardId, valores)), 'Erro ao salvar campo.')
        }
        onCriarCampo={(nome, tipo) =>
          comErro(() => Promise.resolve(p.criarCampo(nome, tipo)), 'Erro ao criar campo.')
        }
        obterCard={p.obterCard}
      />

      {/* Dialog: novo painel */}
      <Dialog open={novoPainelAberto} onOpenChange={setNovoPainelAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo painel</DialogTitle>
            <DialogDescription>Crie um painel kanban personalizado para este workspace.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={novoPainelNome}
            onChange={(e) => setNovoPainelNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') criarPainel()
            }}
            placeholder="Nome do painel"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoPainelAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={criarPainel} disabled={!novoPainelNome.trim()}>
              Criar painel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmação destrutiva reutilizável */}
      <Dialog
        open={!!confirmacao}
        onOpenChange={(o) => {
          if (!o && confirmacao) {
            confirmacao.resolve(false)
            setConfirmacao(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar</DialogTitle>
            <DialogDescription>{confirmacao?.msg}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                confirmacao?.resolve(false)
                setConfirmacao(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                confirmacao?.resolve(true)
                setConfirmacao(null)
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
