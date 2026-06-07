'use client'
import { useState } from 'react'
import { Avatar, Button, Chip, ScrollShadow, Input } from '@heroui/react'
import { DS2CodePreview } from '../ds2-code-preview'
import { Star, Reply, MoreHorizontal, Search, Paperclip } from 'lucide-react'
import { PromptInput } from '../ds2-prompt-input'

type Status = 'nova' | 'em_atendimento' | 'aguardando' | 'resolvido' | 'resgate'

interface MockConversa {
  id: string
  nome: string
  iniciais: string
  telefone?: string
  preview: string
  hora: string
  naoLidas: number
  status: Status
  starred: boolean
}

const mockConversas: MockConversa[] = [
  {
    id: '1',
    nome: 'Carlos Iglesias',
    iniciais: 'CI',
    telefone: '+55 11 9 9999-1234',
    preview: 'Oi, quero saber sobre o produto...',
    hora: '10:21',
    naoLidas: 2,
    status: 'em_atendimento',
    starred: true,
  },
  {
    id: '2',
    nome: 'Stripe',
    iniciais: 'ST',
    preview: 'Invoice INV-0241 is due tomorrow',
    hora: 'Ontem',
    naoLidas: 1,
    status: 'aguardando',
    starred: true,
  },
  {
    id: '3',
    nome: 'Ravi Anand',
    iniciais: 'RA',
    preview: 'Are we still on for dinner on Saturday?',
    hora: 'Dom',
    naoLidas: 0,
    status: 'nova',
    starred: false,
  },
  {
    id: '4',
    nome: 'Maya Okafor',
    iniciais: 'MO',
    preview: "Pinging ahead of Friday's design review...",
    hora: 'Seg',
    naoLidas: 0,
    status: 'resolvido',
    starred: false,
  },
  {
    id: '5',
    nome: 'Parker Wren',
    iniciais: 'PW',
    preview: 'Growth plan notes: define H1 north-star...',
    hora: 'Sex',
    naoLidas: 0,
    status: 'aguardando',
    starred: false,
  },
]

const mockMensagens: Record<string, { assunto: string; corpo: string }> = {
  '1': {
    assunto: 'Launch recap + next steps',
    corpo: "Quick recap from this morning's launch review so we have it in writing. The campaign went live at 08:00 and we've already seen 340 clicks. Next step: A/B test on the headline copy by Thursday.",
  },
  '2': {
    assunto: 'Invoice INV-0241 due',
    corpo: 'This is a reminder that Invoice INV-0241 for $1,200.00 is due tomorrow, June 8. Please log in to your dashboard to complete payment and avoid service interruption.',
  },
  '3': {
    assunto: 'Saturday dinner',
    corpo: "Hey! Are we still on for dinner on Saturday? I was thinking we could try that new place downtown. Let me know if 7pm works for you.",
  },
  '4': {
    assunto: 'Friday design review',
    corpo: "Pinging ahead of Friday's design review to confirm you'll have the updated mockups ready. I'd like to share them with the team before the meeting starts at 14:00.",
  },
  '5': {
    assunto: 'Growth plan H1 notes',
    corpo: 'Growth plan notes from our session: define H1 north-star metric, align on CAC target, ship referral loop by end of sprint 3. Full doc shared in Notion.',
  },
}

type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const statusChip: Record<Status, { label: string; color: ChipColor }> = {
  nova:           { label: 'Nova',           color: 'accent'  },
  em_atendimento: { label: 'Em atendimento', color: 'success' },
  aguardando:     { label: 'Aguardando',     color: 'warning' },
  resolvido:      { label: 'Resolvido',      color: 'default' },
  resgate:        { label: 'Resgate',        color: 'danger'  },
}

interface ConversaItemProps {
  conversa: MockConversa
  selected: boolean
  onClick: () => void
}

function ConversaItem({ conversa, selected, onClick }: ConversaItemProps) {
  const chip = statusChip[conversa.status]
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        width: '100%',
        padding: '10px 12px',
        background: selected ? 'oklch(0.6204 0.195 253.83 / 0.08)' : 'transparent',
        borderLeft: selected ? '2px solid oklch(0.6204 0.195 253.83)' : '2px solid transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.12s',
        position: 'relative',
      }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar size="sm">
          <Avatar.Fallback color={conversa.naoLidas > 0 ? 'accent' : undefined}>
            {conversa.iniciais}
          </Avatar.Fallback>
        </Avatar>
        {conversa.naoLidas > 0 && (
          <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            background: 'oklch(0.6204 0.195 253.83)',
            color: '#fff',
            borderRadius: '50%',
            width: 16,
            height: 16,
            fontSize: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
          }}>
            {conversa.naoLidas}
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{
            fontSize: 13,
            fontWeight: conversa.naoLidas > 0 ? 600 : 400,
            color: 'var(--ws-text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {conversa.nome}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {conversa.starred && (
              <Star size={11} fill="currentColor" style={{ color: '#c9a84c' }} />
            )}
            <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{conversa.hora}</span>
          </div>
        </div>
        <p style={{
          fontSize: 12,
          color: 'var(--ws-text-2)',
          margin: '0 0 4px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {conversa.preview}
        </p>
        <Chip size="sm" variant="soft" color={chip.color} style={{ height: 18, fontSize: 10 }}>
          {chip.label}
        </Chip>
      </div>
    </button>
  )
}

function InboxLayout() {
  const [selectedId, setSelectedId] = useState<string>('1')
  const [busca, setBusca] = useState('')
  const [reply, setReply] = useState('')

  const conversa = mockConversas.find(c => c.id === selectedId)
  const msg = selectedId ? mockMensagens[selectedId] : null
  const filtradas = mockConversas.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    c.preview.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div style={{
      display: 'flex',
      height: 520,
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
      background: 'var(--bg)',
    }}>
      {/* Left panel */}
      <div style={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--border)',
      }}>
        {/* Search */}
        <div style={{ padding: '10px 10px 8px', position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-3)', pointerEvents: 'none' }} />
          <Input
            placeholder="Buscar conversa..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ paddingLeft: 28 }}
          />
        </div>

        {/* List */}
        <ScrollShadow style={{ flex: 1, overflowY: 'auto' }}>
          {filtradas.map(c => (
            <ConversaItem
              key={c.id}
              conversa={c}
              selected={selectedId === c.id}
              onClick={() => setSelectedId(c.id)}
            />
          ))}
          {filtradas.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--ws-text-3)', textAlign: 'center', padding: 24 }}>
              Nenhuma conversa encontrada
            </p>
          )}
        </ScrollShadow>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {conversa && msg ? (
          <>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                  {msg.assunto}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar size="sm">
                    <Avatar.Fallback>{conversa.iniciais}</Avatar.Fallback>
                  </Avatar>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-1)' }}>{conversa.nome}</span>
                    {conversa.telefone && (
                      <span style={{ fontSize: 11, color: 'var(--ws-text-3)', marginLeft: 6 }}>{conversa.telefone}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{conversa.hora}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <Button isIconOnly size="sm" variant="ghost">
                  <Reply size={14} />
                </Button>
                <Button isIconOnly size="sm" variant="ghost">
                  <Star size={14} />
                </Button>
                <Button isIconOnly size="sm" variant="ghost">
                  <MoreHorizontal size={14} />
                </Button>
              </div>
            </div>

            {/* Body */}
            <ScrollShadow style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ws-text-1)', margin: 0 }}>
                {msg.corpo}
              </p>
            </ScrollShadow>

            {/* Reply box */}
            <div style={{ padding: '8px 12px 10px', borderTop: '1px solid var(--border)' }}>
              <PromptInput
                value={reply}
                onValueChange={setReply}
                onSubmit={() => setReply('')}
                status="ready"
                placeholder="Responder..."
                maxHeight={120}
                leadingActions={
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-3)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
                    <Paperclip size={15} />
                  </button>
                }
              />
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--ws-text-3)' }}>Selecione uma conversa</p>
          </div>
        )}
      </div>
    </div>
  )
}

export function DS2Atendimento() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ws-text-1)', margin: '0 0 4px' }}>
        Atendimento / Inbox
      </h2>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>
        Layout de inbox estilo Gmail para conversas WhatsApp — split panel com lista filtrável e painel de mensagem.
      </p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'ScrollShadow > ConversaItem (Avatar + Chip) | MessagePanel (TextField + Button)'}
      </p>

      <DS2CodePreview
        title="Item de Conversa"
        code={`import { Avatar, Chip } from '@heroui/react'
import { Star } from 'lucide-react'

// Avatar com iniciais + badge manual de não-lidas
<div style={{ position: 'relative' }}>
  <Avatar size="sm">
    <Avatar.Fallback color="accent">CI</Avatar.Fallback>
  </Avatar>
  <span style={{
    position: 'absolute', top: -4, right: -4,
    background: 'oklch(0.6204 0.195 253.83)', color: '#fff',
    borderRadius: '50%', width: 16, height: 16, fontSize: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>2</span>
</div>

// Status chip
<Chip size="sm" variant="soft" color="success">Em atendimento</Chip>
<Chip size="sm" variant="soft" color="warning">Aguardando</Chip>
<Chip size="sm" variant="soft" color="accent">Nova</Chip>
<Chip size="sm" variant="soft" color="default">Resolvido</Chip>
<Chip size="sm" variant="soft" color="danger">Resgate</Chip>

// Star indicator
<Star size={11} fill="currentColor" style={{ color: '#c9a84c' }} />`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 280, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {mockConversas.slice(0, 2).map(c => (
            <ConversaItem
              key={c.id}
              conversa={c}
              selected={false}
              onClick={() => {}}
            />
          ))}
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Lista com Busca"
        code={`import { ScrollShadow, TextField, Input } from '@heroui/react'
import { Search } from 'lucide-react'

<div style={{ width: 280, height: 400, display: 'flex', flexDirection: 'column' }}>
  <div style={{ padding: '10px 10px 8px' }}>
    <TextField>
      <Input
        placeholder="Buscar conversa..."
        startContent={<Search size={13} />}
      />
    </TextField>
  </div>
  <ScrollShadow style={{ flex: 1, overflowY: 'auto' }}>
    {conversas.map(c => <ConversaItem key={c.id} {...c} />)}
  </ScrollShadow>
</div>`}
      >
        <div style={{
          width: 280,
          height: 360,
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ padding: '10px 10px 8px', position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-3)', pointerEvents: 'none' }} />
            <Input placeholder="Buscar conversa..." style={{ paddingLeft: 28 }} />
          </div>
          <ScrollShadow style={{ flex: 1, overflowY: 'auto' }}>
            {mockConversas.map(c => (
              <ConversaItem key={c.id} conversa={c} selected={false} onClick={() => {}} />
            ))}
          </ScrollShadow>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Layout Completo"
        code={`'use client'
import { useState } from 'react'
import { Avatar, Button, Chip, ScrollShadow, TextField, Input } from '@heroui/react'
import { Reply, Star, MoreHorizontal, Search } from 'lucide-react'

export function AtendimentoInbox() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  return (
    <div style={{ display: 'flex', height: 520, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {/* Left: lista */}
      <div style={{ width: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 10px 8px' }}>
          <TextField>
            <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} startContent={<Search size={13} />} />
          </TextField>
        </div>
        <ScrollShadow style={{ flex: 1, overflowY: 'auto' }}>
          {conversas.map(c => <ConversaItem key={c.id} conversa={c} selected={selectedId === c.id} onClick={() => setSelectedId(c.id)} />)}
        </ScrollShadow>
      </div>

      {/* Right: mensagem */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {conversa ? (
          <>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{mensagem.assunto}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <Avatar size="sm"><Avatar.Fallback>{conversa.iniciais}</Avatar.Fallback></Avatar>
                  <span style={{ fontSize: 12 }}>{conversa.nome}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <Button isIconOnly size="sm" variant="ghost"><Reply size={14} /></Button>
                <Button isIconOnly size="sm" variant="ghost"><Star size={14} /></Button>
                <Button isIconOnly size="sm" variant="ghost"><MoreHorizontal size={14} /></Button>
              </div>
            </div>
            <ScrollShadow style={{ flex: 1, padding: 20 }}>
              <p style={{ fontSize: 14, lineHeight: 1.7 }}>{mensagem.corpo}</p>
            </ScrollShadow>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
              <TextField><Input placeholder="Responder..." /></TextField>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--ws-text-3)' }}>Selecione uma conversa</p>
          </div>
        )}
      </div>
    </div>
  )
}`}
      >
        <InboxLayout />
      </DS2CodePreview>
    </div>
  )
}
