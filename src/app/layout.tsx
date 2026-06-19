import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ProvedorTema } from '@/components/provedores/provedor-tema'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans-base',
  display: 'swap',
})

export const metadata: Metadata = {
  title: "Op7 Nexo",
  description: "Dashboard de gestão Op7 Nexo",
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
      className={`${inter.variable} h-full`}
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
