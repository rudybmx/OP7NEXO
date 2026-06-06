import { DS2CodePreview } from '../ds2-code-preview'
import { Autocomplete } from '@heroui/react'
import { ListBox, ListBoxItem } from 'react-aria-components'

export function DS2Autocomplete() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Autocomplete</h2>
      <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Campo com filtro dinâmico — compound component.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'Autocomplete.Root > Autocomplete.Trigger > Autocomplete.Value + Autocomplete.Indicator + Autocomplete.ClearButton + Autocomplete.Popover > Autocomplete.Filter > ListBox'}
      </p>

      <DS2CodePreview
        title="Estrutura completa do Autocomplete"
        code={`import { Autocomplete } from '@heroui/react'
import { ListBox, ListBoxItem } from 'react-aria-components'

<Autocomplete.Root>
  <Autocomplete.Trigger>
    <Autocomplete.Value placeholder="Buscar..." />
    <Autocomplete.Indicator />
    <Autocomplete.ClearButton />
  </Autocomplete.Trigger>
  <Autocomplete.Popover>
    <Autocomplete.Filter>
      <ListBox aria-label="Cidades">
        <ListBoxItem id="sp">São Paulo</ListBoxItem>
        <ListBoxItem id="rj">Rio de Janeiro</ListBoxItem>
        <ListBoxItem id="bh">Belo Horizonte</ListBoxItem>
        <ListBoxItem id="cwb">Curitiba</ListBoxItem>
      </ListBox>
    </Autocomplete.Filter>
  </Autocomplete.Popover>
</Autocomplete.Root>`}
      >
        <div style={{ width: '100%', maxWidth: 320 }}>
          <Autocomplete.Root>
            <Autocomplete.Trigger>
              {/* @ts-expect-error — placeholder é suportado em runtime via react-aria; ComponentPropsWithRef não o captura na tipagem */}
              <Autocomplete.Value placeholder="Buscar cidade..." />
              <Autocomplete.Indicator />
              <Autocomplete.ClearButton />
            </Autocomplete.Trigger>
            <Autocomplete.Popover>
              <Autocomplete.Filter>
                <ListBox aria-label="Cidades">
                  <ListBoxItem id="sp">São Paulo</ListBoxItem>
                  <ListBoxItem id="rj">Rio de Janeiro</ListBoxItem>
                  <ListBoxItem id="bh">Belo Horizonte</ListBoxItem>
                  <ListBoxItem id="cwb">Curitiba</ListBoxItem>
                  <ListBoxItem id="poa">Porto Alegre</ListBoxItem>
                </ListBox>
              </Autocomplete.Filter>
            </Autocomplete.Popover>
          </Autocomplete.Root>
        </div>
      </DS2CodePreview>
    </div>
  )
}
