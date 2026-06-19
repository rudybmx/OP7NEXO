'use client'

import { useState } from 'react'
import { LayoutGrid, List, Search, Plus, Columns3, Maximize2, Lock, Unlock, ChevronDown, Check } from 'lucide-react'
import type { KanbanCard, KanbanBoard } from '@/types/kanban'
import { KanbanBoardComp } from './kanban-board'
import { ListaView } from './lista-view'
import { CardModal } from './card-modal'
import { KANBAN_MOCK } from '@/lib/kanban-mock-data'

type Visualizacao = 'kanban' | 'lista'
type ModoModal = 'lateral' | 'central'

// Seed de múltiplos boards
const BOARDS_INICIAIS: KanbanBoard[] = [
  KANBAN_MOCK,
  {
    ...KANBAN_MOCK,
    id: 'board-2', nome: 'Prospecção Ativa',
    cards: KANBAN_MOCK.cards.slice(0, 3).map(c => ({ ...c, id: c.id + '-b2' })),
  },
  {
    ...KANBAN_MOCK,
    id: 'board-3', nome: 'Onboarding Clientes',
    cards: KANBAN_MOCK.cards.slice(2, 5).map(c => ({ ...c, id: c.id + '-b3' })),
  },
]

export function PaineisCRM() {
  const [boards, setBoards] = useState<KanbanBoard[]>(BOARDS_INICIAIS)
  const [boardAtivoId, setBoardAtivoId] = useState(BOARDS_INICIAIS[0].id)
  const [visualizacao, setVisualizacao] = useState<Visualizacao>('kanban')
  const [cardSelecionado, setCardSelecionado] = useState<KanbanCard | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [modoModal, setModoModal] = useState<ModoModal>('lateral')
  const [reordenavel, setReordenavel] = useState(false)
  const [busca, setBusca] = useState('')
  const [seletorBoardAberto, setSeletorBoardAberto] = useState(false)

  const board = boards.find(b => b.id === boardAtivoId) ?? boards[0]

  function atualizarBoard(novoBoard: KanbanBoard) {
    setBoards(bs => bs.map(b => b.id === novoBoard.id ? novoBoard : b))
  }

  function abrirCard(card: KanbanCard) {
    setCardSelecionado(card); setModalAberto(true)
  }

  function atualizarCard(cardAtualizado: KanbanCard) {
    atualizarBoard({ ...board, cards: board.cards.map(c => c.id === cardAtualizado.id ? cardAtualizado : c) })
    setCardSelecionado(cardAtualizado)
  }

  function excluirCard(cardId: string) {
    atualizarBoard({ ...board, cards: board.cards.filter(c => c.id !== cardId) })
  }

  function novoCard() {
    const coluna = board.colunas[0]
    if (!coluna) return
    const novo: KanbanCard = {
      id: `card-${Date.now()}`, titulo: 'Novo card',
      status: coluna.id, criadoEm: new Date().toISOString().slice(0, 10),
      atualizadoEm: new Date().toISOString().slice(0, 10), ordem: 999,
      comentarios: [], camposCustom: [], tags: [],
    }
    atualizarBoard({ ...board, cards: [...board.cards, novo] })
    setCardSelecionado(novo); setModalAberto(true)
  }

  function novoBoard() {
    const nome = prompt('Nome do novo painel:')
    if (!nome?.trim()) return
    const novo: KanbanBoard = {
      id: `board-${Date.now()}`, nome: nome.trim(),
      colunas: KANBAN_MOCK.colunas.map(c => ({ ...c })),
      cards: [],
    }
    setBoards(bs => [...bs, novo])
    setBoardAtivoId(novo.id)
    setSeletorBoardAberto(false)
  }

  const boardFiltrado = busca
    ? { ...board, cards: board.cards.filter(c => c.titulo.toLowerCase().includes(busca.toLowerCase())) }
    : board

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'var(--font-sans-base)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>

        {/* Seletor de painel (multi-board) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setSeletorBoardAberto(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ws-text-1)', letterSpacing: '-0.02em', margin: 0 }}>
              {board.nome}
            </h1>
            <ChevronDown size={16} style={{ color: 'var(--ws-text-3)', marginTop: 2, transition: 'transform 150ms', transform: seletorBoardAberto ? 'rotate(180deg)' : 'none' }} />
          </button>
          <p style={{ fontSize: 13, color: 'var(--ws-text-3)', margin: '4px 0 0' }}>
            {board.cards.length} cards · {board.colunas.length} colunas
          </p>

          {/* Dropdown de painéis */}
          {seletorBoardAberto && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 8, zIndex: 200,
              background: 'rgba(255,255,255,0.95)', border: '1px solid var(--ws-glass-border)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              borderRadius: 12, boxShadow: 'var(--ws-glass-shadow-lg)',
              minWidth: 240, overflow: 'hidden', padding: '6px 0',
            }}>
              {boards.map(b => (
                <button
                  key={b.id}
                  onClick={() => { setBoardAtivoId(b.id); setSeletorBoardAberto(false) }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '9px 14px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 13, color: b.id === boardAtivoId ? '#3E5BFF' : '#0E142A',
                    fontWeight: b.id === boardAtivoId ? 500 : 400,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(62,91,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  {b.id === boardAtivoId && <Check size={12} style={{ color: '#3E5BFF', flexShrink: 0 }} />}
                  {b.id !== boardAtivoId && <div style={{ width: 12 }} />}
                  {b.nome}
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#8892b0' }}>{b.cards.length}</span>
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--ws-divider)', margin: '4px 0' }} />
              <button
                onClick={novoBoard}
                style={{ width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3E5BFF' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(62,91,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <Plus size={13} /> Novo painel
              </button>
            </div>
          )}
        </div>

        {/* Controles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Busca */}
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-3)', pointerEvents: 'none' }} />
            <input
              type="text" placeholder="Buscar..." value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ height: 32, paddingLeft: 30, paddingRight: 12, background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', backdropFilter: 'blur(10px)', borderRadius: 'var(--ws-radius-md)', fontSize: 12, color: 'var(--ws-text-1)', outline: 'none', width: 180, boxShadow: 'var(--ws-glass-shadow-sm)', fontFamily: 'inherit' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(62,91,255,0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(62,91,255,0.12)' }}
              onBlur={e => { e.target.style.borderColor = 'var(--ws-glass-border)'; e.target.style.boxShadow = 'var(--ws-glass-shadow-sm)' }}
            />
          </div>

          {/* Toggle group: modo modal + cadeado + visualização */}
          <div style={{ display: 'inline-flex', background: 'rgba(14,20,42,0.05)', border: '1px solid rgba(14,20,42,0.08)', borderRadius: 10, padding: 3, gap: 2, alignItems: 'center' }}>
            {/* Modo modal */}
            {([['lateral', Columns3, 'Abrir lateral'], ['central', Maximize2, 'Abrir central']] as const).map(([modo, Icon, title]) => (
              <button key={modo} onClick={() => setModoModal(modo)} title={title}
                style={{ padding: '4px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', background: modoModal === modo ? 'rgba(255,255,255,0.85)' : 'transparent', color: modoModal === modo ? '#3E5BFF' : 'var(--ws-text-3)', transition: 'all 150ms', display: 'flex', alignItems: 'center', boxShadow: modoModal === modo ? '0 2px 8px rgba(14,20,42,0.10)' : 'none' }}>
                <Icon size={13} />
              </button>
            ))}

            {/* Separador */}
            <div style={{ width: 1, height: 18, background: 'rgba(14,20,42,0.10)', margin: '0 2px' }} />

            {/* Cadeado de reordenação */}
            <button
              onClick={() => setReordenavel(v => !v)}
              title={reordenavel ? 'Bloquear ordem (drag off)' : 'Desbloquear para reordenar (drag on)'}
              style={{
                padding: '4px 8px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: reordenavel ? 'rgba(239,159,39,0.15)' : 'transparent',
                color: reordenavel ? '#EF9F27' : 'var(--ws-text-3)',
                transition: 'all 150ms', display: 'flex', alignItems: 'center',
                boxShadow: reordenavel ? '0 2px 8px rgba(239,159,39,0.20)' : 'none',
              }}
            >
              {reordenavel ? <Unlock size={13} /> : <Lock size={13} />}
            </button>

            {/* Separador */}
            <div style={{ width: 1, height: 18, background: 'rgba(14,20,42,0.10)', margin: '0 2px' }} />

            {/* Visualização */}
            {([['kanban', LayoutGrid, 'Kanban'], ['lista', List, 'Lista']] as const).map(([view, Icon, label]) => (
              <button key={view} onClick={() => setVisualizacao(view)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, background: visualizacao === view ? 'rgba(255,255,255,0.85)' : 'transparent', color: visualizacao === view ? '#3E5BFF' : 'var(--ws-text-3)', fontWeight: visualizacao === view ? 500 : 400, transition: 'all 150ms', boxShadow: visualizacao === view ? '0 2px 8px rgba(14,20,42,0.10)' : 'none' }}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          {/* Novo card */}
          <button
            onClick={novoCard}
            style={{ height: 32, padding: '0 14px', background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)', border: 'none', borderRadius: 'var(--ws-radius-md)', fontSize: 12, fontWeight: 600, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(62,91,255,0.35)', transition: 'all 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(62,91,255,0.50)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(62,91,255,0.35)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <Plus size={14} /> Novo card
          </button>
        </div>
      </div>

      {/* Stats rápidos */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {board.colunas.map(coluna => {
          const count = board.cards.filter(c => c.status === coluna.id).length
          return (
            <div key={coluna.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', backdropFilter: 'blur(10px)', borderRadius: 8, boxShadow: 'var(--ws-glass-shadow-sm)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: coluna.cor }} />
              <span style={{ fontSize: 11, color: 'var(--ws-text-2)' }}>{coluna.nome}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ws-text-1)' }}>{count}</span>
            </div>
          )
        })}
        {reordenavel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.25)', borderRadius: 8, fontSize: 11, color: '#854f0b', fontWeight: 500 }}>
            <Unlock size={11} /> Modo reordenação ativo — arraste cards e colunas
          </div>
        )}
      </div>

      {/* Board / Lista */}
      {visualizacao === 'kanban' ? (
        <KanbanBoardComp
          board={boardFiltrado}
          reordenavel={reordenavel}
          onCardClick={abrirCard}
          onBoardChange={atualizarBoard}
        />
      ) : (
        <ListaView
          board={boardFiltrado}
          reordenavel={reordenavel}
          onCardClick={abrirCard}
          onBoardChange={atualizarBoard}
        />
      )}

      <CardModal
        card={cardSelecionado}
        colunas={board.colunas}
        aberto={modalAberto}
        modo={modoModal}
        onFechar={() => { setModalAberto(false); setCardSelecionado(null) }}
        onAtualizar={atualizarCard}
        onExcluir={excluirCard}
      />
    </div>
  )
}
