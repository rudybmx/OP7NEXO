import { DS2CodePreview } from '../ds2-code-preview'
import { Table, Chip, Button } from '@heroui/react'

const rows = [
  { id: '#4586936', nome: 'Alex Turner', email: 'alex@acme.com', role: 'Product Manager', tipo: 'Employee' },
  { id: '#4586937', nome: 'Emma Davis', email: 'emma@acme.com', role: 'Senior Designer', tipo: 'Employee' },
  { id: '#4586938', nome: 'James Wilson', email: 'james@acme.com', role: 'CTO', tipo: 'Admin' },
]

export function DS2Table() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Table</h2>
      <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Tabelas de dados com suporte a sorting, seleção e ações.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'Table > Table.ScrollContainer > Table.Content > Table.Header + Table.Body > Table.Row > Table.Cell'}
      </p>

      <DS2CodePreview
        title="Tabela Completa"
        code={`import { Table, Chip, Button } from '@heroui/react'

<Table>
  <Table.ScrollContainer>
    <Table.Content aria-label="Funcionários" selectionMode="multiple">
      <Table.Header>
        <Table.Column>Worker ID</Table.Column>
        <Table.Column>Member</Table.Column>
        <Table.Column>Role</Table.Column>
        <Table.Column>Type</Table.Column>
        <Table.Column>Actions</Table.Column>
      </Table.Header>
      <Table.Body>
        {rows.map(row => (
          <Table.Row key={row.id}>
            <Table.Cell>{row.id}</Table.Cell>
            <Table.Cell>{row.nome}</Table.Cell>
            <Table.Cell>{row.role}</Table.Cell>
            <Table.Cell><Chip size="sm" variant="soft">{row.tipo}</Chip></Table.Cell>
            <Table.Cell>
              <Button size="sm" variant="ghost">Edit</Button>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Content>
  </Table.ScrollContainer>
</Table>`}
      >
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Funcionários" selectionMode="multiple">
              <Table.Header>
                <Table.Column>Worker ID</Table.Column>
                <Table.Column>Member</Table.Column>
                <Table.Column>Role</Table.Column>
                <Table.Column>Type</Table.Column>
                <Table.Column>Actions</Table.Column>
              </Table.Header>
              <Table.Body>
                {rows.map(row => (
                  <Table.Row key={row.id}>
                    <Table.Cell><span style={{ fontSize: 12, color: 'var(--ws-text-2)' }}>{row.id}</span></Table.Cell>
                    <Table.Cell>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{row.nome}</div>
                        <div style={{ fontSize: 11, color: 'var(--ws-text-2)' }}>{row.email}</div>
                      </div>
                    </Table.Cell>
                    <Table.Cell><span style={{ color: 'var(--ws-blue)', fontSize: 13 }}>{row.role}</span></Table.Cell>
                    <Table.Cell><Chip size="sm" variant="soft">{row.tipo}</Chip></Table.Cell>
                    <Table.Cell>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button isIconOnly size="sm" variant="ghost">👁</Button>
                        <Button isIconOnly size="sm" variant="ghost">✏️</Button>
                        <Button isIconOnly size="sm" variant="danger">🗑</Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </DS2CodePreview>

      <DS2CodePreview
        title="Variante compacta"
        code={`<Table variant="secondary">
  <Table.ScrollContainer>
    <Table.Content aria-label="Compacta">
      <Table.Header>...</Table.Header>
      <Table.Body>...</Table.Body>
    </Table.Content>
  </Table.ScrollContainer>
</Table>`}
      >
        <Table variant="secondary">
          <Table.ScrollContainer>
            <Table.Content aria-label="Compacta">
              <Table.Header>
                <Table.Column>ID</Table.Column>
                <Table.Column>Nome</Table.Column>
                <Table.Column>Tipo</Table.Column>
              </Table.Header>
              <Table.Body>
                {rows.map(row => (
                  <Table.Row key={row.id}>
                    <Table.Cell>{row.id}</Table.Cell>
                    <Table.Cell>{row.nome}</Table.Cell>
                    <Table.Cell>{row.tipo}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </DS2CodePreview>
    </div>
  )
}
