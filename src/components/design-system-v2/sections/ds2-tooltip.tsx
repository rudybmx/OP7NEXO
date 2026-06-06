'use client'
import { DS2CodePreview } from '../ds2-code-preview'
import { Tooltip, Button } from '@heroui/react'

export function DS2Tooltip() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Tooltip</h2>
      <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Dicas contextuais — compound component.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'Tooltip (TooltipTrigger) > Tooltip.Trigger + Tooltip.Content'}
      </p>

      <DS2CodePreview
        title="Tooltip Básico"
        code={`import { Tooltip, Button } from '@heroui/react'

// Tooltip é o TooltipTrigger — wraps Trigger + Content
<Tooltip>
  <Tooltip.Trigger>
    <Button variant="primary">Hover aqui</Button>
  </Tooltip.Trigger>
  <Tooltip.Content>Dica de contexto</Tooltip.Content>
</Tooltip>`}
      >
        <Tooltip>
          <Tooltip.Trigger><Button variant="primary">Hover aqui</Button></Tooltip.Trigger>
          <Tooltip.Content>Dica de contexto</Tooltip.Content>
        </Tooltip>
      </DS2CodePreview>

      <DS2CodePreview
        title="Com seta"
        code={`<Tooltip>
  <Tooltip.Trigger>
    <Button variant="outline">Com seta</Button>
  </Tooltip.Trigger>
  <Tooltip.Content showArrow>
    Tooltip com seta apontando
  </Tooltip.Content>
</Tooltip>`}
      >
        <Tooltip>
          <Tooltip.Trigger><Button variant="outline">Com seta</Button></Tooltip.Trigger>
          <Tooltip.Content showArrow>Tooltip com seta apontando</Tooltip.Content>
        </Tooltip>
      </DS2CodePreview>

      <DS2CodePreview
        title="Posicionamento"
        code={`// placement via TooltipContent
<Tooltip>
  <Tooltip.Trigger><Button size="sm">Top</Button></Tooltip.Trigger>
  <Tooltip.Content placement="top">Topo</Tooltip.Content>
</Tooltip>

<Tooltip>
  <Tooltip.Trigger><Button size="sm">Bottom</Button></Tooltip.Trigger>
  <Tooltip.Content placement="bottom">Baixo</Tooltip.Content>
</Tooltip>`}
      >
        <div style={{ display: 'flex', gap: 12, padding: '20px 0' }}>
          {(['top', 'right', 'bottom', 'left'] as const).map(p => (
            <Tooltip key={p}>
              <Tooltip.Trigger><Button variant="outline" size="sm">{p}</Button></Tooltip.Trigger>
              <Tooltip.Content placement={p}>placement=&quot;{p}&quot;</Tooltip.Content>
            </Tooltip>
          ))}
        </div>
      </DS2CodePreview>
    </div>
  )
}
