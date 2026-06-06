import { DS2CodePreview } from '../ds2-code-preview'
import { Pagination } from '@heroui/react'

export function DS2Pagination() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Pagination</h2>
      <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Navegação entre páginas — compound component.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'Pagination > Pagination.Content > Pagination.Item > Pagination.Previous + Pagination.Link + Pagination.Ellipsis + Pagination.Next'}
      </p>

      <DS2CodePreview
        title="Paginação Básica"
        code={`import { Pagination } from '@heroui/react'

<Pagination>
  <Pagination.Content>
    <Pagination.Item>
      <Pagination.Previous />
    </Pagination.Item>
    <Pagination.Item>
      <Pagination.Link isActive>1</Pagination.Link>
    </Pagination.Item>
    <Pagination.Item>
      <Pagination.Link>2</Pagination.Link>
    </Pagination.Item>
    <Pagination.Item>
      <Pagination.Link>3</Pagination.Link>
    </Pagination.Item>
    <Pagination.Item>
      <Pagination.Ellipsis />
    </Pagination.Item>
    <Pagination.Item>
      <Pagination.Link>10</Pagination.Link>
    </Pagination.Item>
    <Pagination.Item>
      <Pagination.Next />
    </Pagination.Item>
  </Pagination.Content>
</Pagination>`}
      >
        <Pagination>
          <Pagination.Content>
            <Pagination.Item><Pagination.Previous><Pagination.PreviousIcon /></Pagination.Previous></Pagination.Item>
            <Pagination.Item><Pagination.Link isActive>1</Pagination.Link></Pagination.Item>
            <Pagination.Item><Pagination.Link>2</Pagination.Link></Pagination.Item>
            <Pagination.Item><Pagination.Link>3</Pagination.Link></Pagination.Item>
            <Pagination.Item><Pagination.Ellipsis /></Pagination.Item>
            <Pagination.Item><Pagination.Link>10</Pagination.Link></Pagination.Item>
            <Pagination.Item><Pagination.Next><Pagination.NextIcon /></Pagination.Next></Pagination.Item>
          </Pagination.Content>
        </Pagination>
      </DS2CodePreview>

      <DS2CodePreview
        title="Tamanhos"
        code={`<Pagination size="sm">...</Pagination>
<Pagination size="md">...</Pagination>
<Pagination size="lg">...</Pagination>`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(['sm', 'md', 'lg'] as const).map(s => (
            <div key={s}>
              <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginBottom: 8, fontFamily: 'monospace' }}>size=&quot;{s}&quot;</p>
              <Pagination size={s}>
                <Pagination.Content>
                  <Pagination.Item><Pagination.Previous><Pagination.PreviousIcon /></Pagination.Previous></Pagination.Item>
                  <Pagination.Item><Pagination.Link isActive>1</Pagination.Link></Pagination.Item>
                  <Pagination.Item><Pagination.Link>2</Pagination.Link></Pagination.Item>
                  <Pagination.Item><Pagination.Link>3</Pagination.Link></Pagination.Item>
                  <Pagination.Item><Pagination.Next><Pagination.NextIcon /></Pagination.Next></Pagination.Item>
                </Pagination.Content>
              </Pagination>
            </div>
          ))}
        </div>
      </DS2CodePreview>
    </div>
  )
}
