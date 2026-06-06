import { DS2CodePreview } from '../ds2-code-preview'
import { Switch } from '@heroui/react'

export function DS2Switch() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Switch</h2>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Toggle booleano — compound component.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'Switch > Switch.Control > Switch.Thumb + Switch.Content'}
      </p>

      <DS2CodePreview
        title="Switch Básico"
        code={`import { Switch } from '@heroui/react'

// Compound pattern — sempre use Control + Thumb + Content
<Switch defaultSelected>
  <Switch.Control>
    <Switch.Thumb />
  </Switch.Control>
  <Switch.Content>Ativo</Switch.Content>
</Switch>

<Switch>
  <Switch.Control>
    <Switch.Thumb />
  </Switch.Control>
  <Switch.Content>Inativo</Switch.Content>
</Switch>`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Switch defaultSelected>
            <Switch.Control><Switch.Thumb /></Switch.Control>
            <Switch.Content>Ativo</Switch.Content>
          </Switch>
          <Switch>
            <Switch.Control><Switch.Thumb /></Switch.Control>
            <Switch.Content>Inativo</Switch.Content>
          </Switch>
          <Switch isDisabled defaultSelected>
            <Switch.Control><Switch.Thumb /></Switch.Control>
            <Switch.Content>Desabilitado</Switch.Content>
          </Switch>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Tamanhos"
        code={`<Switch size="sm" defaultSelected>
  <Switch.Control><Switch.Thumb /></Switch.Control>
  <Switch.Content>Small</Switch.Content>
</Switch>

<Switch size="md" defaultSelected>
  <Switch.Control><Switch.Thumb /></Switch.Control>
  <Switch.Content>Medium</Switch.Content>
</Switch>

<Switch size="lg" defaultSelected>
  <Switch.Control><Switch.Thumb /></Switch.Control>
  <Switch.Content>Large</Switch.Content>
</Switch>`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(['sm', 'md', 'lg'] as const).map(s => (
            <Switch key={s} size={s} defaultSelected>
              <Switch.Control><Switch.Thumb /></Switch.Control>
              <Switch.Content>{s.toUpperCase()}</Switch.Content>
            </Switch>
          ))}
        </div>
      </DS2CodePreview>
    </div>
  )
}
