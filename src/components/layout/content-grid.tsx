interface ContentGridProps {
  children: React.ReactNode
  cols?: 1 | 2 | 3 | 4
  gap?: 'sm' | 'md' | 'lg'
  responsive?: boolean
}

const GAP_VALUES = {
  sm:  12,
  md:  16,
  lg:  24,
}

export function ContentGrid({
  children,
  cols = 1,
  gap = 'md',
  responsive = true,
}: ContentGridProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: GAP_VALUES[gap],
      }}
      data-cols={cols}
      data-responsive={responsive}
      className={responsive ? `content-grid content-grid-${cols}` : undefined}
    >
      {children}
    </div>
  )
}
