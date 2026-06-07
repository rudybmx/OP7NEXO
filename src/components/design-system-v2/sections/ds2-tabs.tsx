import { DS2CodePreview } from '../ds2-code-preview'
import { Tabs } from '@heroui/react'

export function DS2Tabs() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Tabs</h2>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Navegação entre seções — compound component.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'Tabs.Root > Tabs.ListContainer > Tabs.List > Tabs.Tab | Tabs.Panel'}
      </p>

      <DS2CodePreview
        title="Tabs Básico"
        code={`import { Tabs } from '@heroui/react'

<Tabs.Root defaultSelectedKey="overview">
  <Tabs.ListContainer>
    <Tabs.List aria-label="Seções">
      <Tabs.Tab id="overview">Visão Geral</Tabs.Tab>
      <Tabs.Tab id="sales">Vendas</Tabs.Tab>
      <Tabs.Tab id="expenses">Despesas</Tabs.Tab>
    </Tabs.List>
  </Tabs.ListContainer>
  <Tabs.Panel id="overview">Conteúdo Overview</Tabs.Panel>
  <Tabs.Panel id="sales">Conteúdo Sales</Tabs.Panel>
  <Tabs.Panel id="expenses">Conteúdo Expenses</Tabs.Panel>
</Tabs.Root>`}
      >
        <Tabs.Root defaultSelectedKey="overview">
          <Tabs.ListContainer>
            <Tabs.List aria-label="Seções">
              <Tabs.Tab id="overview" className="!text-[13px]">Visão Geral</Tabs.Tab>
              <Tabs.Tab id="sales" className="!text-[13px]">Vendas</Tabs.Tab>
              <Tabs.Tab id="expenses" className="!text-[13px]">Despesas</Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
          <Tabs.Panel id="overview" style={{ padding: '16px 0', fontSize: 13, color: 'var(--ws-text-2)' }}>
            Conteúdo da aba Visão Geral
          </Tabs.Panel>
          <Tabs.Panel id="sales" style={{ padding: '16px 0', fontSize: 13, color: 'var(--ws-text-2)' }}>
            Conteúdo da aba Vendas
          </Tabs.Panel>
          <Tabs.Panel id="expenses" style={{ padding: '16px 0', fontSize: 13, color: 'var(--ws-text-2)' }}>
            Conteúdo da aba Despesas
          </Tabs.Panel>
        </Tabs.Root>
      </DS2CodePreview>

      <DS2CodePreview
        title="Variantes"
        code={`<Tabs.Root variant="primary">...</Tabs.Root>
<Tabs.Root variant="secondary">...</Tabs.Root>`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {(['primary', 'secondary'] as const).map(v => (
            <div key={v}>
              <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginBottom: 8, fontFamily: 'monospace' }}>variant=&quot;{v}&quot;</p>
              <Tabs.Root variant={v} defaultSelectedKey="tab1">
                <Tabs.ListContainer>
                  <Tabs.List aria-label={v}>
                    <Tabs.Tab id="tab1" className="!text-[13px]">Campanhas</Tabs.Tab>
                    <Tabs.Tab id="tab2" className="!text-[13px]">Anúncios</Tabs.Tab>
                    <Tabs.Tab id="tab3" className="!text-[13px]">Relatórios</Tabs.Tab>
                  </Tabs.List>
                </Tabs.ListContainer>
              </Tabs.Root>
            </div>
          ))}
        </div>
      </DS2CodePreview>
    </div>
  )
}
