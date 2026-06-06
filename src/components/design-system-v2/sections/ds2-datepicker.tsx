import { DS2CodePreview } from '../ds2-code-preview'
import { DateField, Label } from '@heroui/react'
import { I18nProvider } from '@heroui/react'

export function DS2DatePicker() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Date Field / Picker</h2>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Input de data segmentado (DD/MM/AAAA) — compound component.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'DateField > Label + DateField.Group > DateField.Input > DateField.Segment'}
      </p>

      <DS2CodePreview
        title="DateField básico (pt-BR)"
        code={`import { DateField, Label } from '@heroui/react'
import { I18nProvider } from '@heroui/react'

// I18nProvider para pt-BR: formata DD/MM/AAAA
<I18nProvider locale="pt-BR">
  <DateField>
    <Label>Data de início</Label>
    <DateField.Group>
      <DateField.Input>
        {seg => <DateField.Segment segment={seg} />}
      </DateField.Input>
    </DateField.Group>
  </DateField>
</I18nProvider>`}
      >
        <I18nProvider locale="pt-BR">
          <div style={{ width: '100%', maxWidth: 300 }}>
            <DateField>
              <Label>Data de início</Label>
              <DateField.Group>
                <DateField.Input>
                  {(seg) => <DateField.Segment segment={seg} />}
                </DateField.Input>
              </DateField.Group>
            </DateField>
          </div>
        </I18nProvider>
      </DS2CodePreview>

      <DS2CodePreview
        title="Com Label e disabled"
        code={`<I18nProvider locale="pt-BR">
  <DateField isDisabled>
    <Label>Data (desabilitado)</Label>
    <DateField.Group>
      <DateField.Input>
        {seg => <DateField.Segment segment={seg} />}
      </DateField.Input>
    </DateField.Group>
  </DateField>
</I18nProvider>`}
      >
        <I18nProvider locale="pt-BR">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300 }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginBottom: 6, fontFamily: 'monospace' }}>normal</p>
              <DateField>
                <Label>Data de início</Label>
                <DateField.Group>
                  <DateField.Input>
                    {(seg) => <DateField.Segment segment={seg} />}
                  </DateField.Input>
                </DateField.Group>
              </DateField>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginBottom: 6, fontFamily: 'monospace' }}>isDisabled</p>
              <DateField isDisabled>
                <Label>Data de término</Label>
                <DateField.Group>
                  <DateField.Input>
                    {(seg) => <DateField.Segment segment={seg} />}
                  </DateField.Input>
                </DateField.Group>
              </DateField>
            </div>
          </div>
        </I18nProvider>
      </DS2CodePreview>

      <DS2CodePreview
        title="DatePicker completo (com calendário)"
        description="Requer composição com Calendar e DatePicker.Popover — padrão avançado"
        code={`import { DatePicker, DateField, Label } from '@heroui/react'
import { I18nProvider } from '@heroui/react'

// Estrutura completa com popup de calendário
<I18nProvider locale="pt-BR">
  <DatePicker.Root>
    <Label>Data</Label>
    {/* DateField.Group dentro do DatePicker para o input */}
    <DateField.Group>
      <DateField.Input>
        {seg => <DateField.Segment segment={seg} />}
      </DateField.Input>
      <DatePicker.TriggerIndicator />
    </DateField.Group>
    <DatePicker.Trigger />
    <DatePicker.Popover>
      {/* Calendar component aqui */}
    </DatePicker.Popover>
  </DatePicker.Root>
</I18nProvider>`}
      >
        <div style={{
          padding: '16px',
          background: 'rgba(255,165,0,0.08)',
          border: '1px solid rgba(255,165,0,0.2)',
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--ws-text-2)',
        }}>
          📅 DatePicker com calendário requer composição avançada com Calendar, DateInputGroup e Popover.
          Use o snippet de código ao lado como referência.
        </div>
      </DS2CodePreview>
    </div>
  )
}
