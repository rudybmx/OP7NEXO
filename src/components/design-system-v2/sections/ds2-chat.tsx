'use client'
import { useState, useRef, useEffect, type ReactNode, type ChangeEvent } from 'react'
import { Avatar, Button, Chip, ScrollShadow, Input } from '@heroui/react'
import { DS2CodePreview } from '../ds2-code-preview'
import {
  Paperclip,
  FileText, FileImage, FileVideo, FileAudio, File,
  X, ChevronDown, Plus, Mic, Smile,
  ThumbsUp, ThumbsDown, Copy, RefreshCw,
} from 'lucide-react'
import { PromptInput, type PromptStatus } from '../ds2-prompt-input'

// ─────────────────────────────────────────────────────────────
// ① CHAT ATTACHMENT
// ─────────────────────────────────────────────────────────────

type MediaType = 'image' | 'video' | 'audio' | 'document' | 'unknown'

function inferMediaType(mimeType?: string): MediaType {
  if (!mimeType) return 'unknown'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('application/') || mimeType.startsWith('text/')) return 'document'
  return 'unknown'
}

function MediaIcon({ mediaType, size = 20 }: { mediaType: MediaType; size?: number }) {
  switch (mediaType) {
    case 'image':    return <FileImage size={size} />
    case 'video':    return <FileVideo size={size} />
    case 'audio':    return <FileAudio size={size} />
    case 'document': return <FileText size={size} />
    default:         return <File size={size} />
  }
}

interface ChatAttachmentProps {
  mediaType?: MediaType
  mimeType?: string
  name: string
  src?: string
  onRemove?: () => void
  children?: ReactNode
}

function ChatAttachment({ mediaType, mimeType, name, src, onRemove, children }: ChatAttachmentProps) {
  const resolvedType = mediaType ?? inferMediaType(mimeType)
  const ext = name.split('.').pop()?.toUpperCase() ?? ''

  return (
    <div style={{
      position: 'relative',
      width: 80,
      height: 80,
      borderRadius: 8,
      border: '1px solid var(--border)',
      background: 'var(--bg2)',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {children ?? (
        resolvedType === 'image' && src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : resolvedType === 'video' && src ? (
          <video src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 8 }}>
            <MediaIcon mediaType={resolvedType} size={24} />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ws-text-3)', letterSpacing: '0.04em' }}>{ext}</span>
          </div>
        )
      )}
      {/* Name overlay */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'rgba(0,0,0,0.55)', padding: '3px 5px',
      }}>
        <span style={{ fontSize: 9, color: '#fff', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            position: 'absolute', top: 3, right: 3,
            background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%',
            width: 18, height: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}
        >
          <X size={10} color="#fff" />
        </button>
      )}
    </div>
  )
}

function ChatAttachmentGroup({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ③ CHAT MESSAGE
// ─────────────────────────────────────────────────────────────

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  avatar?: string
  avatarInitials?: string
  isStreaming?: boolean
  actions?: ReactNode
  attachments?: ReactNode
}

function ChatMessage({ role, content, timestamp, avatarInitials = 'AI', isStreaming, actions, attachments }: ChatMessageProps) {
  if (role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
        <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {attachments && <div>{attachments}</div>}
          <div style={{
            background: 'oklch(0.6204 0.195 253.83)',
            color: '#fff',
            borderRadius: '16px 16px 4px 16px',
            padding: '10px 14px',
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            {content}
          </div>
          {timestamp && (
            <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{timestamp}</span>
          )}
        </div>
      </div>
    )
  }

  // assistant
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
      <Avatar size="sm">
        <Avatar.Fallback color="accent">{avatarInitials}</Avatar.Fallback>
      </Avatar>
      <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: '4px 16px 16px 16px',
          padding: '10px 14px',
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--ws-text-1)',
        }}>
          {content}
          {isStreaming && (
            <span style={{ display: 'inline-block', width: 8, height: 14, background: 'oklch(0.6204 0.195 253.83)', marginLeft: 3, borderRadius: 2, verticalAlign: 'text-bottom', animation: 'pulse 1s infinite' }} />
          )}
        </div>
        {timestamp && (
          <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{timestamp}</span>
        )}
        {actions && <div style={{ display: 'flex', gap: 2 }}>{actions}</div>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ④ CHAT CONVERSATION (stick-to-bottom viewport)
// ─────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const INITIAL_MESSAGES: Message[] = [
  { id: '1', role: 'assistant', content: 'Olá! Como posso ajudar você hoje?', timestamp: '10:00' },
  { id: '2', role: 'user',      content: 'Quero entender como funciona o módulo de atendimento.', timestamp: '10:01' },
  { id: '3', role: 'assistant', content: 'Claro! O módulo de atendimento centraliza suas conversas do WhatsApp em um único lugar. Você pode filtrar por status, atribuir atendentes e acompanhar o histórico de cada cliente. Quer que eu detalhe alguma parte específica?', timestamp: '10:01' },
  { id: '4', role: 'user',      content: 'Como funciona o status de "aguardando"?', timestamp: '10:02' },
]

function ChatConversation() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES)
  const [input, setInput]       = useState('')
  const [status, setStatus]     = useState<PromptStatus>('ready')
  const [showScroll, setShowScroll] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  function scrollToBottom(smooth = true) {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
  }

  useEffect(() => { scrollToBottom(false) }, [])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScroll(dist > 80)
  }

  async function handleSubmit() {
    if (!input.trim()) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setStatus('streaming')
    setTimeout(() => scrollToBottom(), 50)

    await new Promise(r => setTimeout(r, 1400))

    const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Status "aguardando" indica que o cliente respondeu mas nenhum atendente retomou a conversa ainda. Você pode configurar notificações automáticas para esse cenário nas configurações do workspace.', timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
    setMessages(prev => [...prev, aiMsg])
    setStatus('ready')
    setTimeout(() => scrollToBottom(), 50)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 480, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar size="sm"><Avatar.Fallback color="accent">AI</Avatar.Fallback></Avatar>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>Assistente OP7</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>
            {status === 'streaming' ? 'Digitando...' : 'Online'}
          </div>
        </div>
      </div>

      {/* Messages viewport */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', position: 'relative' }}
      >
        {messages.map(m => (
          <ChatMessage
            key={m.id}
            role={m.role}
            content={m.content}
            timestamp={m.timestamp}
            avatarInitials="AI"
            actions={m.role === 'assistant' ? (
              <>
                <button title="Copiar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 4, color: 'var(--ws-text-3)', display: 'flex', alignItems: 'center' }} onClick={() => navigator.clipboard?.writeText(m.content)}>
                  <Copy size={12} />
                </button>
                <button title="Bom" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 4, color: 'var(--ws-text-3)', display: 'flex', alignItems: 'center' }}>
                  <ThumbsUp size={12} />
                </button>
                <button title="Ruim" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 4, color: 'var(--ws-text-3)', display: 'flex', alignItems: 'center' }}>
                  <ThumbsDown size={12} />
                </button>
                <button title="Regenerar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 4, color: 'var(--ws-text-3)', display: 'flex', alignItems: 'center' }}>
                  <RefreshCw size={12} />
                </button>
              </>
            ) : undefined}
          />
        ))}

        {status === 'streaming' && (
          <ChatMessage
            role="assistant"
            content=""
            avatarInitials="AI"
            isStreaming
          />
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {showScroll && (
        <div style={{ position: 'absolute', bottom: 90, right: 24, zIndex: 10 }}>
          <button
            onClick={() => scrollToBottom()}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '50%',
              width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            <ChevronDown size={16} />
          </button>
        </div>
      )}

      {/* PromptInput */}
      <div style={{ padding: '8px 12px 12px' }}>
        <PromptInput
          value={input}
          onValueChange={setInput}
          onSubmit={handleSubmit}
          onStop={() => setStatus('ready')}
          status={status}
          placeholder="Pergunte algo..."
          leadingActions={
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-3)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
              <Paperclip size={15} />
            </button>
          }
          trailingActions={
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-3)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
              <Mic size={15} />
            </button>
          }
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Attachment demo
// ─────────────────────────────────────────────────────────────

function AttachmentDemo() {
  const [attachments, setAttachments] = useState([
    { id: '1', name: 'brief.pdf',       mimeType: 'application/pdf',  src: undefined },
    { id: '2', name: 'screenshot.png',  mimeType: 'image/png',        src: 'https://picsum.photos/seed/a1/80/80' },
    { id: '3', name: 'demo.mp4',        mimeType: 'video/mp4',        src: undefined },
    { id: '4', name: 'notes.txt',       mimeType: 'text/plain',       src: undefined },
  ])
  const fileRef = useRef<HTMLInputElement>(null)

  function remove(id: string) {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  function addFiles(files: FileList | null) {
    if (!files) return
    const newItems = [...files].map(f => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      mimeType: f.type,
      src: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }))
    setAttachments(prev => [...prev, ...newItems])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ChatAttachmentGroup>
        {attachments.map(a => (
          <ChatAttachment
            key={a.id}
            name={a.name}
            mimeType={a.mimeType}
            src={a.src}
            onRemove={() => remove(a.id)}
          />
        ))}
      </ChatAttachmentGroup>
      <div style={{ display: 'flex', gap: 8 }}>
        <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
        <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
          <Plus size={13} />
          Adicionar arquivo
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PromptInput states demo
// ─────────────────────────────────────────────────────────────

function PromptStatusDemo() {
  const statuses: PromptStatus[] = ['ready', 'submitted', 'streaming', 'error']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {statuses.map(s => (
        <div key={s}>
          <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginBottom: 4, fontFamily: 'monospace' }}>status=&quot;{s}&quot;</p>
          <PromptInput
            key={s}
            value={s === 'ready' ? '' : 'Como funciona o módulo de atendimento?'}
            status={s}
            placeholder="Digite uma mensagem..."
          />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Messages showcase
// ─────────────────────────────────────────────────────────────

function MessageShowcase() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 500 }}>
      <ChatMessage
        role="user"
        content="Quero entender como funciona o módulo de atendimento."
        timestamp="10:01"
      />
      <ChatMessage
        role="assistant"
        content="Claro! O módulo centraliza suas conversas do WhatsApp. Você pode filtrar por status, atribuir atendentes e acompanhar o histórico de cada cliente."
        timestamp="10:01"
        avatarInitials="AI"
        actions={
          <>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 4, color: 'var(--ws-text-3)', display: 'flex', alignItems: 'center' }} title="Copiar">
              <Copy size={12} />
            </button>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 4, color: 'var(--ws-text-3)', display: 'flex', alignItems: 'center' }} title="Bom">
              <ThumbsUp size={12} />
            </button>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 4, color: 'var(--ws-text-3)', display: 'flex', alignItems: 'center' }} title="Regenerar">
              <RefreshCw size={12} />
            </button>
          </>
        }
      />
      <ChatMessage
        role="user"
        content="Pode me mostrar com anexo?"
        timestamp="10:02"
        attachments={
          <ChatAttachmentGroup>
            <ChatAttachment name="brief.pdf" mimeType="application/pdf" />
          </ChatAttachmentGroup>
        }
      />
      <ChatMessage
        role="assistant"
        content="Claro, veja o documento que você enviou..."
        timestamp="10:02"
        avatarInitials="AI"
        isStreaming
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// DS2 section export
// ─────────────────────────────────────────────────────────────

export function DS2Chat() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ws-text-1)', margin: '0 0 4px' }}>
        Chat / AI
      </h2>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>
        Componentes de chat para interfaces AI — attachments, composer, mensagens e conversation feed.
      </p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'ChatAttachment · ChatAttachmentGroup · PromptInput · ChatMessage · ChatConversation'}
      </p>

      {/* ① ChatAttachment */}
      <DS2CodePreview
        title="ChatAttachment — previews de arquivo"
        code={`import { ChatAttachment, ChatAttachmentGroup } from './chat'

// Group de múltiplos anexos
<ChatAttachmentGroup>
  <ChatAttachment
    name="brief.pdf"
    mimeType="application/pdf"
    onRemove={() => remove('1')}
  />
  <ChatAttachment
    name="screenshot.png"
    mimeType="image/png"
    src="/screenshot.png"
    onRemove={() => remove('2')}
  />
  <ChatAttachment
    name="demo.mp4"
    mimeType="video/mp4"
    onRemove={() => remove('3')}
  />
</ChatAttachmentGroup>

// mediaType inferido do mimeType:
// image/* → image  |  video/* → video
// audio/* → audio  |  application/* → document`}
      >
        <AttachmentDemo />
      </DS2CodePreview>

      {/* ② PromptInput states */}
      <DS2CodePreview
        title="PromptInput — estados do compositor"
        code={`import { PromptInput } from './chat'

// ready — campo habilitado, botão Send
<PromptInput value={text} onValueChange={setText} onSubmit={submit} status="ready" />

// submitted / streaming — campo bloqueado, botão Stop
<PromptInput value={text} onSubmit={submit} onStop={stop} status="streaming" />

// error — borda vermelha, botão Retry
<PromptInput value={text} onRetry={retry} status="error" />

// Com ações extras (leadingActions / trailingActions)
<PromptInput
  status="ready"
  leadingActions={<button><Paperclip size={15} /></button>}
  trailingActions={<button><Mic size={15} /></button>}
  placeholder="Pergunte algo..."
/>

// Enter envia, Shift+Enter quebra linha`}
      >
        <PromptStatusDemo />
      </DS2CodePreview>

      {/* ③ ChatMessage */}
      <DS2CodePreview
        title="ChatMessage — bolhas de mensagem"
        code={`import { ChatMessage, ChatAttachment, ChatAttachmentGroup } from './chat'

// Mensagem do usuário
<ChatMessage
  role="user"
  content="Como funciona o atendimento?"
  timestamp="10:01"
/>

// Mensagem do assistente com actions
<ChatMessage
  role="assistant"
  content="O módulo centraliza suas conversas..."
  timestamp="10:01"
  avatarInitials="AI"
  actions={
    <>
      <button onClick={() => copy(content)}><Copy size={12} /></button>
      <button><ThumbsUp size={12} /></button>
      <button><RefreshCw size={12} /></button>
    </>
  }
/>

// Mensagem com anexo
<ChatMessage
  role="user"
  content="Veja esse arquivo"
  attachments={
    <ChatAttachmentGroup>
      <ChatAttachment name="brief.pdf" mimeType="application/pdf" />
    </ChatAttachmentGroup>
  }
/>

// Cursor de streaming (isStreaming=true mostra cursor piscando)
<ChatMessage role="assistant" content="" isStreaming />`}
      >
        <MessageShowcase />
      </DS2CodePreview>

      {/* ④ ChatConversation completa */}
      <DS2CodePreview
        title="ChatConversation — feed interativo completo"
        code={`'use client'
import { useState, useRef, useEffect } from 'react'
import { ChatConversation, ChatMessage, PromptInput } from './chat'

export function AIChatPage() {
  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<PromptStatus>('ready')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Stick-to-bottom automático
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  async function handleSubmit() {
    if (!input.trim()) return
    setMessages(prev => [...prev, { role: 'user', content: input }])
    setInput('')
    setStatus('streaming')

    const response = await fetchAI(input)  // sua chamada de API
    setMessages(prev => [...prev, { role: 'assistant', content: response }])
    setStatus('ready')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Viewport */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.map(m => <ChatMessage key={m.id} {...m} />)}
        {status === 'streaming' && <ChatMessage role="assistant" content="" isStreaming />}
        <div ref={bottomRef} />  {/* Scroll anchor */}
      </div>

      {/* Composer */}
      <div style={{ padding: '8px 12px 12px' }}>
        <PromptInput
          value={input}
          onValueChange={setInput}
          onSubmit={handleSubmit}
          onStop={() => setStatus('ready')}
          status={status}
          leadingActions={<button><Paperclip size={15} /></button>}
        />
      </div>
    </div>
  )
}`}
      >
        <ChatConversation />
      </DS2CodePreview>
    </div>
  )
}
