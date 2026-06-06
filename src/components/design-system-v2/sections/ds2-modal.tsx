'use client'
import { DS2CodePreview } from '../ds2-code-preview'
import { Modal, Button, useOverlayState } from '@heroui/react'

export function DS2Modal() {
  const state1 = useOverlayState()
  const state2 = useOverlayState()

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Modal</h2>
      <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Diálogos de sobreposição — compound component.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'Modal.Root > Modal.Trigger + Modal.Backdrop > Modal.Container > Modal.Dialog > ...'}
      </p>

      <DS2CodePreview
        title="Modal Básico"
        code={`import { Modal, Button } from '@heroui/react'
import { useState } from 'react'

const state = useOverlayState()

<Button variant="primary" onPress={state.open}>
  Abrir Modal
</Button>

<Modal.Root state={state}>
  <Modal.Backdrop>
    <Modal.Container>
      <Modal.Dialog>
        <Modal.Header>
          <Modal.Heading>Confirmar ação</Modal.Heading>
        </Modal.Header>
        <Modal.Body>
          <p>Tem certeza que deseja continuar?</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="ghost" onPress={state.close}>
            Cancelar
          </Button>
          <Button variant="primary" onPress={state.close}>
            Confirmar
          </Button>
        </Modal.Footer>
        <Modal.CloseTrigger />
      </Modal.Dialog>
    </Modal.Container>
  </Modal.Backdrop>
</Modal.Root>`}
      >
        <>
          <Button variant="primary" onPress={state1.open}>Abrir Modal</Button>
          <Modal.Root state={state1}>
            <Modal.Backdrop>
              <Modal.Container>
                <Modal.Dialog>
                  <Modal.Header>
                    <Modal.Heading>Confirmar ação</Modal.Heading>
                  </Modal.Header>
                  <Modal.Body>
                    <p>Tem certeza que deseja continuar com esta operação?</p>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button variant="ghost" onPress={state1.close}>Cancelar</Button>
                    <Button variant="primary" onPress={state1.close}>Confirmar</Button>
                  </Modal.Footer>
                  <Modal.CloseTrigger />
                </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>
          </Modal.Root>
        </>
      </DS2CodePreview>

      <DS2CodePreview
        title="Modal com Trigger embutido"
        code={`// Alternativa: Modal.Trigger dentro do Modal.Root
<Modal.Root>
  <Modal.Trigger>
    <Button variant="outline">Abrir com Trigger</Button>
  </Modal.Trigger>
  <Modal.Backdrop>
    <Modal.Container size="lg">
      <Modal.Dialog>
        <Modal.Header>
          <Modal.Heading>Modal Large</Modal.Heading>
        </Modal.Header>
        <Modal.Body>...</Modal.Body>
        <Modal.CloseTrigger />
      </Modal.Dialog>
    </Modal.Container>
  </Modal.Backdrop>
</Modal.Root>`}
      >
        <Modal.Root>
          <Modal.Trigger>
            <Button variant="outline">Abrir com Trigger</Button>
          </Modal.Trigger>
          <Modal.Backdrop>
            <Modal.Container size="lg">
              <Modal.Dialog>
                <Modal.Header>
                  <Modal.Heading>Modal Large</Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  <p>Este modal usa Modal.Trigger interno — não precisa de estado manual.</p>
                </Modal.Body>
                <Modal.Footer>
                  <Modal.CloseTrigger><Button variant="ghost">Fechar</Button></Modal.CloseTrigger>
                </Modal.Footer>
                <Modal.CloseTrigger />
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal.Root>
      </DS2CodePreview>
    </div>
  )
}
