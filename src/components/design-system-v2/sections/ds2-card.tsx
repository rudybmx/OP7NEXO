import { DS2CodePreview } from '../ds2-code-preview'
import { Card, Button } from '@heroui/react'

export function DS2Card() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Card</h2>
      <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Contêiner de conteúdo — compound component.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'Card + Card.Header + Card.Title + Card.Description + Card.Content + Card.Footer'}
      </p>

      <DS2CodePreview
        title="Card Completo"
        code={`import { Card, Button } from '@heroui/react'

<Card>
  <Card.Header>
    <Card.Title>Receita Mensal</Card.Title>
    <Card.Description>Comparado ao mês anterior</Card.Description>
  </Card.Header>
  <Card.Content>
    <p style={{ fontSize: 28, fontWeight: 700 }}>R$ 228.441</p>
    <p style={{ color: 'green' }}>↑ 3.3%</p>
  </Card.Content>
  <Card.Footer>
    <Button variant="ghost" size="sm">Ver detalhes</Button>
  </Card.Footer>
</Card>`}
      >
        <Card style={{ maxWidth: 320, minWidth: 260 }}>
          <Card.Header>
            <Card.Title>Receita Mensal</Card.Title>
            <Card.Description>Comparado ao mês anterior</Card.Description>
          </Card.Header>
          <Card.Content>
            <p style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 700, color: 'var(--ws-text-1)' }}>R$ 228.441</p>
            <p style={{ margin: 0, fontSize: 12, color: '#16a34a' }}>↑ 3.3% vs mês anterior</p>
          </Card.Content>
          <Card.Footer>
            <Button variant="ghost" size="sm">Ver detalhes</Button>
          </Card.Footer>
        </Card>
      </DS2CodePreview>

      <DS2CodePreview
        title="Card simples — apenas Content"
        code={`<Card>
  <Card.Content>
    <p>Conteúdo simples sem header ou footer.</p>
  </Card.Content>
</Card>`}
      >
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {(['default', 'transparent'] as const).map(v => (
            <Card key={v} variant={v} style={{ minWidth: 160, textAlign: 'center' }}>
              <Card.Content>
                <p style={{ margin: 0, fontSize: 13 }}>variant=&quot;{v}&quot;</p>
              </Card.Content>
            </Card>
          ))}
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Grid de KPI Cards"
        description="Padrão para dashboard — 4 colunas"
        code={`const kpis = [
  { label: 'Receita', value: 'R$ 228.441', delta: '+3.3%', ok: true },
  { label: 'Despesas', value: 'R$ 25.108', delta: '+3.3%', ok: false },
  { label: 'Vendas', value: '458', delta: '+3.3%', ok: true },
  { label: 'Lucro', value: 'R$ 203.133', delta: '+4.1%', ok: true },
]

<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
  {kpis.map(k => (
    <Card key={k.label}>
      <Card.Content>
        <p style={{ fontSize: 11, color: 'var(--ws-text-2)', textTransform: 'uppercase' }}>
          {k.label}
        </p>
        <p style={{ fontSize: 22, fontWeight: 700 }}>{k.value}</p>
        <span style={{ fontSize: 11, color: k.ok ? 'green' : 'red' }}>{k.delta}</span>
      </Card.Content>
    </Card>
  ))}
</div>`}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, width: '100%' }}>
          {[
            { label: 'Receita', value: 'R$ 228.441', delta: '+3.3%', ok: true },
            { label: 'Despesas', value: 'R$ 25.108', delta: '+3.3%', ok: false },
            { label: 'Vendas', value: '458', delta: '+3.3%', ok: true },
            { label: 'Lucro', value: 'R$ 203.133', delta: '+4.1%', ok: true },
          ].map(k => (
            <Card key={k.label}>
              <Card.Content>
                <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--ws-text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</p>
                <p style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)' }}>{k.value}</p>
                <span style={{ fontSize: 11, color: k.ok ? '#16a34a' : '#dc2626' }}>{k.delta}</span>
              </Card.Content>
            </Card>
          ))}
        </div>
      </DS2CodePreview>
    </div>
  )
}
