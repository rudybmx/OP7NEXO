import { DS2CodePreview } from '../ds2-code-preview'
import { Spinner } from '@heroui/react'

export function DS2Spinner() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Spinner</h2>
      <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 24px' }}>Indicador de carregamento animado. API simples — sem compound.</p>

      <DS2CodePreview
        title="Tamanhos"
        code={`import { Spinner } from '@heroui/react'

<Spinner size="sm" />
<Spinner size="md" />
<Spinner size="lg" />`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Cores"
        code={`<Spinner color="current" />
<Spinner color="accent" />
<Spinner color="success" />
<Spinner color="warning" />
<Spinner color="danger" />`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Spinner color="current" />
          <Spinner color="accent" />
          <Spinner color="success" />
          <Spinner color="warning" />
          <Spinner color="danger" />
        </div>
      </DS2CodePreview>
    </div>
  )
}
