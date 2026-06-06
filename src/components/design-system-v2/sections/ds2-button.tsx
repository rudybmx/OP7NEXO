import { DS2CodePreview } from '../ds2-code-preview'
import { Button, ButtonGroup } from '@heroui/react'

export function DS2Button() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Button</h2>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Ações primárias e secundárias da interface.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        variant: &quot;primary&quot; | &quot;secondary&quot; | &quot;tertiary&quot; | &quot;danger&quot; | &quot;ghost&quot; | &quot;danger-soft&quot; | &quot;outline&quot;
      </p>

      <DS2CodePreview
        title="Variantes"
        code={`import { Button } from '@heroui/react'

<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="tertiary">Tertiary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="danger">Danger</Button>
<Button variant="danger-soft">Danger Soft</Button>`}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="tertiary">Tertiary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="danger-soft">Danger Soft</Button>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Tamanhos"
        code={`<Button variant="primary" size="sm">Small</Button>
<Button variant="primary" size="md">Medium</Button>
<Button variant="primary" size="lg">Large</Button>`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="primary" size="md">Medium</Button>
          <Button variant="primary" size="lg">Large</Button>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Estados"
        code={`<Button isDisabled>Desabilitado</Button>
<Button isIconOnly variant="ghost">★</Button>
<Button fullWidth variant="primary">Full Width</Button>`}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, width: '100%', maxWidth: 400 }}>
          <Button isDisabled>Desabilitado</Button>
          <Button isIconOnly variant="ghost">★</Button>
          <Button fullWidth variant="primary">Full Width</Button>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="ButtonGroup"
        code={`import { ButtonGroup, Button } from '@heroui/react'

<ButtonGroup>
  <Button variant="outline">Dia</Button>
  <Button variant="outline">Semana</Button>
  <Button variant="primary">Mês</Button>
</ButtonGroup>`}
      >
        <ButtonGroup>
          <Button variant="outline">Dia</Button>
          <Button variant="outline">Semana</Button>
          <Button variant="primary">Mês</Button>
        </ButtonGroup>
      </DS2CodePreview>
    </div>
  )
}
