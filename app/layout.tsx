import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/sonner'
import { AuthListener } from '@/components/layout/auth-listener'
import { ThemeProvider } from '@/components/layout/theme-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kartotéka — Egyházi Nyilvántartási Rendszer',
  description: 'Erdélyi Református Egyházkerület digitális nyilvántartási rendszere',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KARTOTEKA',
  },
  icons: {
    icon: '/EREK.png',
    apple: '/EREK.png',
  },
}

// PWA: theme color a manifest-tel egyezik (sötét indigo — #1e1b4b)
export const viewport: Viewport = {
  themeColor: '#1e1b4b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="hu" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <AuthListener />
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  )
}
