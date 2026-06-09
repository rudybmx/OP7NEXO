'use client'
import { useRef, useEffect, type ReactNode } from 'react'
import { Button } from '@heroui/react'
import { Send, Square, RotateCcw, AlertCircle } from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type PromptStatus = 'ready' | 'submitted' | 'streaming' | 'error'

export interface PromptInputProps {
  value?: string
  onValueChange?: (v: string) => void
  onSubmit?: () => void
  onStop?: () => void
  onRetry?: () => void
  status?: PromptStatus
  placeholder?: string
  maxHeight?: number
  variant?: 'primary' | 'secondary'
  leadingActions?: ReactNode
  trailingActions?: ReactNode
  attachments?: ReactNode
}

// ─────────────────────────────────────────────────────────────
// PromptSendButton (internal)
// ─────────────────────────────────────────────────────────────

function PromptSendButton({ status, onSubmit, onStop, onRetry }: {
  status: PromptStatus
  onSubmit?: () => void
  onStop?: () => void
  onRetry?: () => void
}) {
  if (status === 'streaming' || status === 'submitted') {
    return (
      <Button isIconOnly size="sm" variant="primary" onPress={onStop}>
        <Square size={13} fill="currentColor" />
      </Button>
    )
  }
  if (status === 'error') {
    return (
      <Button isIconOnly size="sm" variant="danger" onPress={onRetry}>
        <RotateCcw size={13} />
      </Button>
    )
  }
  return (
    <Button isIconOnly size="sm" variant="primary" onPress={onSubmit}>
      <Send size={13} />
    </Button>
  )
}

// ─────────────────────────────────────────────────────────────
// PromptInput
// ─────────────────────────────────────────────────────────────

export function PromptInput({
  value = '',
  onValueChange,
  onSubmit,
  onStop,
  onRetry,
  status = 'ready',
  placeholder = 'Digite uma mensagem...',
  maxHeight = 200,
  leadingActions,
  trailingActions,
  attachments,
}: PromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isLocked = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  }, [value, maxHeight])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLocked) {
      e.preventDefault()
      onSubmit?.()
    }
  }

  const border = status === 'error' ? '1px solid oklch(0.637 0.237 25.33)' : '1px solid var(--border)'

  return (
    <div style={{
      background: 'var(--bg)',
      border,
      borderRadius: 12,
      padding: '8px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {attachments && <div>{attachments}</div>}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        {leadingActions && <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>{leadingActions}</div>}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onValueChange?.(e.target.value)}
          onKeyDown={handleKey}
          disabled={isLocked}
          placeholder={isLocked ? 'Aguardando resposta...' : placeholder}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            border: 'none',
            background: 'transparent',
            outline: 'none',
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--ws-text-1)',
            maxHeight,
            overflow: 'auto',
            padding: 0,
            opacity: isLocked ? 0.5 : 1,
          }}
        />
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
          {trailingActions}
          <PromptSendButton status={status} onSubmit={onSubmit} onStop={onStop} onRetry={onRetry} />
        </div>
      </div>

      {status === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'oklch(0.637 0.237 25.33)' }}>
          <AlertCircle size={12} />
          Falha ao enviar. Tente novamente.
        </div>
      )}
    </div>
  )
}
