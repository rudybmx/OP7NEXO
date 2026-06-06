import { DS2CodePreview } from '../ds2-code-preview'
import { Avatar } from '@heroui/react'

export function DS2Avatar() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Avatar</h2>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Representação visual de usuários — compound component.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'<Avatar>'} + {'<Avatar.Image />'} + {'<Avatar.Fallback />'}
      </p>

      <DS2CodePreview
        title="Básico — com fallback (iniciais)"
        code={`import { Avatar } from '@heroui/react'

// Compound pattern obrigatório no v3.1
<Avatar>
  <Avatar.Fallback>RD</Avatar.Fallback>
</Avatar>

<Avatar size="sm">
  <Avatar.Fallback>AB</Avatar.Fallback>
</Avatar>`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar size="sm"><Avatar.Fallback>AB</Avatar.Fallback></Avatar>
          <Avatar size="md"><Avatar.Fallback>RD</Avatar.Fallback></Avatar>
          <Avatar size="lg"><Avatar.Fallback>OP</Avatar.Fallback></Avatar>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Com imagem"
        code={`<Avatar size="lg">
  <Avatar.Image src="https://i.pravatar.cc/150?img=1" alt="Diana" />
  <Avatar.Fallback>DI</Avatar.Fallback>
</Avatar>`}
      >
        <Avatar size="lg">
          <Avatar.Image src="https://i.pravatar.cc/150?img=1" alt="Foto" />
          <Avatar.Fallback>DI</Avatar.Fallback>
        </Avatar>
      </DS2CodePreview>

      <DS2CodePreview
        title="Variantes de cor (fallback)"
        description="Cores no Avatar.Fallback: default | accent | success | danger | warning"
        code={`<Avatar>
  <Avatar.Fallback>AA</Avatar.Fallback>
</Avatar>
<Avatar>
  <Avatar.Fallback color="accent">BB</Avatar.Fallback>
</Avatar>
<Avatar>
  <Avatar.Fallback color="success">CC</Avatar.Fallback>
</Avatar>
<Avatar>
  <Avatar.Fallback color="danger">DD</Avatar.Fallback>
</Avatar>`}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <Avatar><Avatar.Fallback>AA</Avatar.Fallback></Avatar>
          <Avatar><Avatar.Fallback color="accent">BB</Avatar.Fallback></Avatar>
          <Avatar><Avatar.Fallback color="success">CC</Avatar.Fallback></Avatar>
          <Avatar><Avatar.Fallback color="danger">DD</Avatar.Fallback></Avatar>
          <Avatar><Avatar.Fallback color="warning">EE</Avatar.Fallback></Avatar>
        </div>
      </DS2CodePreview>
    </div>
  )
}
