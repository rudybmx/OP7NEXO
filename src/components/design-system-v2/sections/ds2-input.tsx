import { DS2CodePreview } from '../ds2-code-preview'
import { TextField, Input, Label, FieldError, Description, TextArea } from '@heroui/react'

export function DS2Input() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Input / TextField</h2>
      <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>
        Campo de texto. Input sozinho = elemento HTML estilizado. TextField = wrapper react-aria com acessibilidade.
      </p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'TextField > Label + Input + Description + FieldError'}
      </p>

      <DS2CodePreview
        title="Input simples (sem label/acessibilidade)"
        code={`import { Input } from '@heroui/react'

// Input = styled HTML input, sem label embutida
<Input variant="primary" placeholder="Digite algo..." />
<Input variant="secondary" placeholder="Variante secondary..." />`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 340 }}>
          <Input variant="primary" placeholder="Digite algo..." />
          <Input variant="secondary" placeholder="Variante secondary..." />
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="TextField completo (label + validação + descrição)"
        code={`import { TextField, Input, Label, FieldError, Description } from '@heroui/react'

// TextField = react-aria wrapper com acessibilidade completa
<TextField>
  <Label>Nome completo</Label>
  <Input placeholder="Ex: João Silva" />
  <Description>Como aparece no seu perfil</Description>
  <FieldError />
</TextField>

<TextField isRequired isInvalid>
  <Label>E-mail</Label>
  <Input type="email" placeholder="email@empresa.com" />
  <FieldError>Digite um e-mail válido</FieldError>
</TextField>`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 340 }}>
          <TextField>
            <Label>Nome completo</Label>
            <Input placeholder="Ex: João Silva" />
            <Description>Como aparece no seu perfil</Description>
            <FieldError />
          </TextField>
          <TextField isRequired isInvalid>
            <Label>E-mail</Label>
            <Input type="email" placeholder="email@empresa.com" />
            <FieldError>Digite um e-mail válido</FieldError>
          </TextField>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Textarea"
        code={`import { TextArea } from '@heroui/react'

<TextArea
  variant="primary"
  placeholder="Descreva aqui..."
  rows={4}
/>`}
      >
        <div style={{ width: '100%', maxWidth: 340 }}>
          <TextArea variant="primary" placeholder="Descreva aqui..." rows={4} />
        </div>
      </DS2CodePreview>
    </div>
  )
}
