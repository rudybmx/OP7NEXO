import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { ProvedorTema } from '@/components/provedores/provedor-tema'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
})

const FAVICON_URL = 'https://pub-db8ed4fb33634589a6ce5fb07e85cb46.r2.dev/logo/bihmks/logo%20branca%20bmk.png'

export const metadata: Metadata = {
  title: "BMK Marketing",
  description: "Dashboard de gestão BMK Marketing",
  icons: {
    icon: FAVICON_URL,
    shortcut: FAVICON_URL,
    apple: FAVICON_URL,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} h-full`}
    >
      <body suppressHydrationWarning className="min-h-full">
        <ProvedorTema>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </ProvedorTema>
      </body>
    </html>
  )
}
