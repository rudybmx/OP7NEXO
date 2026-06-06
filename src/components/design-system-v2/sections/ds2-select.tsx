import { DS2CodePreview } from '../ds2-code-preview'
import { Select, Label } from '@heroui/react'
import { ListBox, ListBoxItem } from 'react-aria-components'

export function DS2Select() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Select</h2>
      <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Seleção de opções — compound component baseado em react-aria.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'Select.Root > Label + Select.Trigger > Select.Value + Select.Indicator + Select.Popover > ListBox > ListBoxItem'}
      </p>

      <DS2CodePreview
        title="Select Básico"
        code={`import { Select, Label } from '@heroui/react'
import { ListBox, ListBoxItem } from 'react-aria-components'

<Select.Root>
  <Label>Módulo</Label>
  <Select.Trigger>
    <Select.Value placeholder="Selecione..." />
    <Select.Indicator />
  </Select.Trigger>
  <Select.Popover>
    <ListBox>
      <ListBoxItem id="crm">CRM</ListBoxItem>
      <ListBoxItem id="meta">Meta Ads</ListBoxItem>
      <ListBoxItem id="google">Google Ads</ListBoxItem>
    </ListBox>
  </Select.Popover>
</Select.Root>`}
      >
        <div style={{ width: '100%', maxWidth: 280 }}>
          <Select.Root>
            <Label>Módulo</Label>
            <Select.Trigger>
              {/* @ts-expect-error — placeholder é suportado em runtime via react-aria; ComponentPropsWithRef não o captura na tipagem */}
              <Select.Value placeholder="Selecione..." />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBoxItem id="crm">CRM</ListBoxItem>
                <ListBoxItem id="meta">Meta Ads</ListBoxItem>
                <ListBoxItem id="google">Google Ads</ListBoxItem>
                <ListBoxItem id="nps">NPS</ListBoxItem>
              </ListBox>
            </Select.Popover>
          </Select.Root>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Variantes"
        code={`<Select.Root variant="primary">...</Select.Root>
<Select.Root variant="secondary">...</Select.Root>`}
      >
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {(['primary', 'secondary'] as const).map(v => (
            <div key={v} style={{ minWidth: 200 }}>
              <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginBottom: 8, fontFamily: 'monospace' }}>variant=&quot;{v}&quot;</p>
              <Select.Root variant={v}>
                <Select.Trigger>
                  {/* @ts-expect-error — placeholder é suportado em runtime via react-aria; ComponentPropsWithRef não o captura na tipagem */}
                  <Select.Value placeholder="Selecione..." />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBoxItem id="a">Opção A</ListBoxItem>
                    <ListBoxItem id="b">Opção B</ListBoxItem>
                  </ListBox>
                </Select.Popover>
              </Select.Root>
            </div>
          ))}
        </div>
      </DS2CodePreview>
    </div>
  )
}
