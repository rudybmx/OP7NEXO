'use client'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface CodePreviewProps {
  title?: string
  description?: string
  code: string
  children: React.ReactNode
  defaultTab?: 'preview' | 'code'
}

function highlight(code: string): string {
  return code
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\b(import|export|from|const|let|var|function|return|type|interface|default|true|false|null|undefined)\b/g,
      '<span style="color:var(--ws-blue)">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
      '<span style="color:var(--ws-coral)">$1</span>')
    .replace(/(&lt;\/?[A-Za-z][A-Za-z0-9.]*)/g,
      '<span style="color:var(--ws-purple)">$1</span>')
    .replace(/(\/\/[^\n]*)/g,
      '<span style="color:var(--ws-text-3)">$1</span>')
}

export function DS2CodePreview({ title, description, code, children, defaultTab = 'preview' }: CodePreviewProps) {
  const [tab, setTab] = useState<'preview' | 'code'>(defaultTab)
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 12,
      marginBottom: 24,
      overflow: 'hidden',
    }}>
      {(title || description) && (
        <div style={{ padding: '16px 20px 0' }}>
          {title && <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ws-text-1)' }}>{title}</h4>}
          {description && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ws-text-2)' }}>{description}</p>}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, padding: '12px 20px 0', borderBottom: '1px solid var(--ws-glass-border)' }}>
        {(['preview', 'code'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 500,
              border: 'none',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              background: tab === t ? 'var(--ws-blue)' : 'transparent',
              color: tab === t ? '#fff' : 'var(--ws-text-2)',
              marginBottom: -1,
              transition: 'all 0.15s',
            }}
          >
            {t === 'preview' ? 'Preview' : 'Código'}
          </button>
        ))}
      </div>

      {/* Preview */}
      {tab === 'preview' && (
        <div style={{
          padding: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 12,
          minHeight: 100,
        }}>
          {children}
        </div>
      )}

      {/* Code */}
      {tab === 'code' && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={copy}
            title="Copiar código"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
              color: copied ? 'var(--ws-green)' : 'var(--ws-text-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              transition: 'all 0.15s',
              zIndex: 1,
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
          <pre
            style={{
              margin: 0,
              padding: '20px 20px 20px',
              overflowX: 'auto',
              fontSize: 12.5,
              lineHeight: 1.7,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              background: 'rgba(0,0,0,0.04)',
              color: 'var(--ws-text-1)',
              maxHeight: 400,
              overflowY: 'auto',
            }}
            dangerouslySetInnerHTML={{ __html: highlight(code) }}
          />
        </div>
      )}
    </div>
  )
}
