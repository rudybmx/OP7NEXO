import { DS2CodePreview } from '../ds2-code-preview'
import { Chip } from '@heroui/react'

export function DS2Chip() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Chip</h2>
      <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Labels compactas para status, categorias e filtros.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        variant: &quot;primary&quot; | &quot;secondary&quot; | &quot;soft&quot; | &quot;tertiary&quot;
      </p>

      <DS2CodePreview
        title="Variantes"
        code={`import { Chip } from '@heroui/react'

<Chip variant="primary">Primary</Chip>
<Chip variant="secondary">Secondary</Chip>
<Chip variant="soft">Soft</Chip>
<Chip variant="tertiary">Tertiary</Chip>`}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Chip variant="primary">Primary</Chip>
          <Chip variant="secondary">Secondary</Chip>
          <Chip variant="soft">Soft</Chip>
          <Chip variant="tertiary">Tertiary</Chip>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Cores"
        description="color: default | accent | success | warning | danger"
        code={`<Chip variant="soft" color="default">Default</Chip>
<Chip variant="soft" color="accent">Accent</Chip>
<Chip variant="soft" color="success">Success</Chip>
<Chip variant="soft" color="warning">Warning</Chip>
<Chip variant="soft" color="danger">Danger</Chip>`}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Chip variant="soft" color="default">Default</Chip>
          <Chip variant="soft" color="accent">Accent</Chip>
          <Chip variant="soft" color="success">Success</Chip>
          <Chip variant="soft" color="warning">Warning</Chip>
          <Chip variant="soft" color="danger">Danger</Chip>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Tamanhos"
        code={`<Chip size="sm">Small</Chip>
<Chip size="md">Medium</Chip>
<Chip size="lg">Large</Chip>`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Chip size="sm">Small</Chip>
          <Chip size="md">Medium</Chip>
          <Chip size="lg">Large</Chip>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Uso prático — status de sync"
        code={`// Como usado em contas-ads
<Chip size="sm" variant="soft" color="success">Ativo</Chip>
<Chip size="sm" variant="soft" color="danger">Erro</Chip>
<Chip size="sm" variant="soft" color="warning">Pendente</Chip>
<Chip size="sm" variant="soft" color="accent">Running</Chip>`}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <Chip size="sm" variant="soft" color="success">Ativo</Chip>
          <Chip size="sm" variant="soft" color="danger">Erro</Chip>
          <Chip size="sm" variant="soft" color="warning">Pendente</Chip>
          <Chip size="sm" variant="soft" color="accent">Running</Chip>
        </div>
      </DS2CodePreview>
    </div>
  )
}
