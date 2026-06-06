'use client'
import { DS2CodePreview } from '../ds2-code-preview'
import { Dropdown, Button } from '@heroui/react'

export function DS2Dropdown() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Dropdown / Menu</h2>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Menus contextuais — compound component.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'Dropdown > Dropdown.Trigger + Dropdown.Popover > Dropdown.Menu > Dropdown.Item'}
      </p>

      <DS2CodePreview
        title="Dropdown Básico"
        code={`import { Dropdown, Button } from '@heroui/react'

<Dropdown>
  <Dropdown.Trigger>Ações ▾</Dropdown.Trigger>
  <Dropdown.Popover>
    <Dropdown.Menu aria-label="Ações">
      <Dropdown.Item id="edit">Editar</Dropdown.Item>
      <Dropdown.Item id="copy">Duplicar</Dropdown.Item>
      <Dropdown.Item id="delete">Excluir</Dropdown.Item>
    </Dropdown.Menu>
  </Dropdown.Popover>
</Dropdown>`}
      >
        <Dropdown>
          <Dropdown.Trigger>Ações ▾</Dropdown.Trigger>
          <Dropdown.Popover>
            <Dropdown.Menu aria-label="Ações">
              <Dropdown.Item id="edit">Editar</Dropdown.Item>
              <Dropdown.Item id="copy">Duplicar</Dropdown.Item>
              <Dropdown.Item id="delete">Excluir</Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </DS2CodePreview>

      <DS2CodePreview
        title="Com seções"
        code={`<Dropdown>
  <Dropdown.Trigger>Conta</Dropdown.Trigger>
  <Dropdown.Popover>
    <Dropdown.Menu aria-label="Conta">
      <Dropdown.Section>
        <Dropdown.Item id="profile">Meu Perfil</Dropdown.Item>
        <Dropdown.Item id="settings">Configurações</Dropdown.Item>
      </Dropdown.Section>
      <Dropdown.Section>
        <Dropdown.Item id="logout">Sair</Dropdown.Item>
      </Dropdown.Section>
    </Dropdown.Menu>
  </Dropdown.Popover>
</Dropdown>`}
      >
        <Dropdown>
          <Dropdown.Trigger>Conta ▾</Dropdown.Trigger>
          <Dropdown.Popover>
            <Dropdown.Menu aria-label="Conta">
              <Dropdown.Section>
                <Dropdown.Item id="profile">Meu Perfil</Dropdown.Item>
                <Dropdown.Item id="settings">Configurações</Dropdown.Item>
              </Dropdown.Section>
              <Dropdown.Section>
                <Dropdown.Item id="logout">Sair</Dropdown.Item>
              </Dropdown.Section>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </DS2CodePreview>
    </div>
  )
}
