import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageShellProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  headerRight?: React.ReactNode
  breadcrumb?: BreadcrumbItem[]
  tabs?: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  padding?: 'compact' | 'default' | 'none'
}

const MAX_WIDTHS = {
  sm:   640,
  md:   768,
  lg:   1024,
  xl:   1280,
  full: undefined,
}

const PADDING_VALUES = {
  compact: '12px 16px 20px',
  default: '20px 24px 32px',
  none:    '0',
}

export function PageShell({
  children,
  title,
  subtitle,
  headerRight,
  breadcrumb,
  tabs,
  maxWidth = 'xl',
  padding = 'default',
}: PageShellProps) {
  const maxW = MAX_WIDTHS[maxWidth]
  const hasHeader = title || subtitle || headerRight || breadcrumb?.length

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100%',
    }}>
      {hasHeader && (
        <header style={{
          padding: '24px 24px 0',
          flexShrink: 0,
        }}>
          {breadcrumb && breadcrumb.length > 0 && (
            <nav style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginBottom: 8,
            }}>
              {breadcrumb.map((item, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {i > 0 && <ChevronRight size={12} style={{ color: 'var(--ws-text-3)' }} />}
                  {item.href
                    ? (
                      <Link href={item.href} style={{
                        fontSize: 12,
                        color: i === breadcrumb.length - 1 ? 'var(--ws-text-2)' : 'var(--ws-blue)',
                        textDecoration: 'none',
                      }}>
                        {item.label}
                      </Link>
                    )
                    : (
                      <span style={{ fontSize: 12, color: 'var(--ws-text-2)' }}>
                        {item.label}
                      </span>
                    )
                  }
                </span>
              ))}
            </nav>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: subtitle ? 'flex-start' : 'center',
            gap: 16,
          }}>
            <div>
              {title && (
                <h1 style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 700,
                  color: 'var(--ws-text-1)',
                  lineHeight: 1.3,
                  letterSpacing: '-0.01em',
                }}>
                  {title}
                </h1>
              )}
              {subtitle && (
                <p style={{
                  margin: '3px 0 0',
                  fontSize: 13,
                  color: 'var(--ws-text-2)',
                  lineHeight: 1.5,
                }}>
                  {subtitle}
                </p>
              )}
            </div>
            {headerRight && (
              <div style={{ flexShrink: 0 }}>
                {headerRight}
              </div>
            )}
          </div>
        </header>
      )}

      {tabs && (
        <div style={{ padding: '0 24px', marginTop: hasHeader ? 16 : 0, flexShrink: 0 }}>
          {tabs}
        </div>
      )}

      <div style={{
        padding: PADDING_VALUES[padding],
        maxWidth: maxW,
        width: '100%',
        flex: 1,
      }}>
        {children}
      </div>
    </div>
  )
}
