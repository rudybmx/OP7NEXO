import { DS2CodePreview } from '../ds2-code-preview'
import { ProgressBar, ProgressCircle } from '@heroui/react'

export function DS2Progress() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Progress</h2>
      <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Barras e círculos de progresso — compound components.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'ProgressBar + ProgressCircle'}
      </p>

      <DS2CodePreview
        title="ProgressBar"
        code={`import { ProgressBar } from '@heroui/react'

<ProgressBar value={70} maxValue={100}>
  <ProgressBar.Output />
  <ProgressBar.Track>
    <ProgressBar.Fill />
  </ProgressBar.Track>
</ProgressBar>`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 380 }}>
          <ProgressBar value={70} maxValue={100}>
            <ProgressBar.Output />
            <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
          </ProgressBar>
          <ProgressBar value={45} maxValue={100} color="success">
            <ProgressBar.Output />
            <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
          </ProgressBar>
          <ProgressBar value={90} maxValue={100} color="danger">
            <ProgressBar.Output />
            <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
          </ProgressBar>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="ProgressBar — Indeterminado"
        code={`<ProgressBar isIndeterminate>
  <ProgressBar.Track>
    <ProgressBar.Fill />
  </ProgressBar.Track>
</ProgressBar>`}
      >
        <div style={{ width: '100%', maxWidth: 380 }}>
          <ProgressBar isIndeterminate>
            <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
          </ProgressBar>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="ProgressCircle"
        code={`import { ProgressCircle } from '@heroui/react'

<ProgressCircle value={70} maxValue={100}>
  <ProgressCircle.Track>
    <ProgressCircle.TrackCircle />
    <ProgressCircle.FillCircle />
  </ProgressCircle.Track>
</ProgressCircle>`}
      >
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            { value: 70, color: undefined },
            { value: 45, color: 'success' as const },
            { value: 90, color: 'danger' as const },
          ].map(({ value, color }) => (
            <ProgressCircle key={value} value={value} maxValue={100} color={color}>
              <ProgressCircle.Track>
                <ProgressCircle.TrackCircle />
                <ProgressCircle.FillCircle />
              </ProgressCircle.Track>
            </ProgressCircle>
          ))}
        </div>
      </DS2CodePreview>
    </div>
  )
}
