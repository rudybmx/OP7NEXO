import { DS2CodePreview } from '../ds2-code-preview'
import { Slider } from '@heroui/react'

export function DS2Slider() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)', margin: '0 0 4px' }}>Slider</h2>
      <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>Seleção de valor em intervalo — compound component.</p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'Slider > Slider.Output + Slider.Track > Slider.Fill + Slider.Thumb'}
      </p>

      <DS2CodePreview
        title="Slider Básico"
        code={`import { Slider } from '@heroui/react'

<Slider defaultValue={40} minValue={0} maxValue={100} step={10}>
  <Slider.Output />
  <Slider.Track>
    <Slider.Fill />
    <Slider.Thumb index={0} />
  </Slider.Track>
</Slider>`}
      >
        <div style={{ width: '100%', maxWidth: 360 }}>
          <Slider defaultValue={40} minValue={0} maxValue={100} step={10}>
            <Slider.Output />
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb index={0} />
            </Slider.Track>
          </Slider>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Range Slider (dois handles)"
        code={`// Para range: defaultValue como array
<Slider defaultValue={[20, 80]} minValue={0} maxValue={100}>
  <Slider.Output />
  <Slider.Track>
    <Slider.Fill />
    <Slider.Thumb index={0} />
    <Slider.Thumb index={1} />
  </Slider.Track>
</Slider>`}
      >
        <div style={{ width: '100%', maxWidth: 360 }}>
          <Slider defaultValue={[20, 80]} minValue={0} maxValue={100}>
            <Slider.Output />
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb index={0} />
              <Slider.Thumb index={1} />
            </Slider.Track>
          </Slider>
        </div>
      </DS2CodePreview>

      <DS2CodePreview
        title="Com passo (step)"
        code={`<Slider defaultValue={50} step={25} minValue={0} maxValue={100}>
  <Slider.Output />
  <Slider.Track>
    <Slider.Fill />
    <Slider.Thumb index={0} />
    <Slider.Marks />
  </Slider.Track>
</Slider>`}
      >
        <div style={{ width: '100%', maxWidth: 360 }}>
          <Slider defaultValue={50} step={25} minValue={0} maxValue={100}>
            <Slider.Output />
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb index={0} />
              <Slider.Marks />
            </Slider.Track>
          </Slider>
        </div>
      </DS2CodePreview>
    </div>
  )
}
