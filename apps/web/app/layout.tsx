import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/sonner'
import { AuthListener } from '@/components/layout/auth-listener'
import { ServiceWorkerReloader } from '@/components/layout/service-worker-reloader'
import { ThemeProvider } from '@/components/layout/theme-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kartotéka — Egyházi Nyilvántartási Rendszer',
  description: 'Egyházi nyilvántartó rendszer — gyülekezetek digitális nyilvántartása',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KARTOTEKA',
  },
  // Az icons-konfig a Next.js App Router konvenciójára támaszkodik:
  //   - app/icon.png  → <link rel="icon"> (KARTOTEKA_V3)
  //   - app/apple-icon.png (ha létezik) → Apple touch icon
  // Ha explicit override kell, itt add meg; egyébként a Next.js
  // auto-generálja a <link>-eket.
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
    <html lang="hu" data-theme="kert" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <AuthListener />
          {/* 2026-07-13 (S12): deploy után az új service worker átvételekor a
              fület egyszer újratöltjük — különben a régi/új chunk-keveredés
              miatt a navigáció elhal („nem nyílik meg oldal"). */}
          <ServiceWorkerReloader />
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  )
}
