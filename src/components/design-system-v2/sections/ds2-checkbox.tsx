import { DS2CodePreview } from '../ds2-code-preview'
import { Checkbox } from '@heroui/react'

export function DS2Checkbox() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Checkbox</h2>
      <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Seleção booleana — compound component.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'Checkbox > Checkbox.Control > Checkbox.Indicator + Checkbox.Content'}
      </p>

      <DS2CodePreview
        title="Checkbox Básico"
        code={`import { Checkbox } from '@heroui/react'

<Checkbox defaultSelected>
  <Checkbox.Control>
    <Checkbox.Indicator />
  </Checkbox.Control>
  <Checkbox.Content>Selecionado</Checkbox.Content>
</Checkbox>

<Checkbox>
  <Checkbox.Control>
    <Checkbox.Indicator />
  </Checkbox.Control>
  <Checkbox.Content>Desmarcado</Checkbox.Content>
</Checkbox>

<Checkbox isIndeterminate>
  <Checkbox.Control>
    <Checkbox.Indicator />
  </Checkbox.Control>
  <Checkbox.Content>Indeterminado</Checkbox.Content>
</Checkbox>`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Checkbox defaultSelected>
            <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
            <Checkbox.Content>Selecionado</Checkbox.Content>
          </Checkbox>
          <Checkbox>
            <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
            <Checkbox.Content>Desmarcado</Checkbox.Content>
          </Checkbox>
          <Checkbox isIndeterminate>
            <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
            <Checkbox.Content>Indeterminado</Checkbox.Content>
          </Checkbox>
          <Checkbox isDisabled>
            <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
            <Checkbox.Content>Desabilitado</Checkbox.Content>
          </Checkbox>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Variantes"
        code={`<Checkbox variant="primary" defaultSelected>...</Checkbox>
<Checkbox variant="secondary" defaultSelected>...</Checkbox>`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(['primary', 'secondary'] as const).map(v => (
            <Checkbox key={v} variant={v} defaultSelected>
              <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
              <Checkbox.Content>variant=&quot;{v}&quot;</Checkbox.Content>
            </Checkbox>
          ))}
        </div>
      </DS2CodePreview>
    </div>
  )
}
