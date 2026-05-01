import Image from 'next/image'
import Link from 'next/link'
import { SplashScreen } from '@/components/ui/splash-screen'
import { AuthLeftPane } from '@/components/auth/auth-left-pane'

/**
 * Auth layout — sablon-konform 2-oszlopos onboarding.
 *
 * Sablon: `Kartotéka-handoff-bejelentkezes → Bejelentkezes.html`.
 *
 * Layout:
 * - Background: `/Hatter.png` (fixed, cover) + vignette overlay
 * - Brand top-left (64×64 logo + "KARTOTÉKA" + tagline)
 * - Main 2-column (1fr 1fr, gap 64px) — bal: AuthLeftPane, jobb: card a `children`-nel
 * - Footer: cross + linkek + copyright
 *
 * Reszponzív (`auth.css`):
 * - ≤ 980px: 1 oszlopra esik, brand-padding csökken
 * - ≤ 540px: greeting 44px, brand-logo 52×52, card padding 28×22
 */

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="kt-auth-page">
      <SplashScreen />

      {/* Background vignette overlay (a Hatter.png-re ráhúzva) */}
      <div aria-hidden className="kt-auth-vignette" />

      <div className="kt-auth-shell">
        {/* Brand top-left */}
        <header className="kt-auth-brand">
          <div className="kt-auth-brand-logo">
            <Image
              src="/KARTOTEKA_V3.png"
              alt="Kartotéka logó"
              width={56}
              height={56}
              priority
            />
          </div>
          <div className="kt-auth-brand-text">
            <span className="kt-auth-brand-name">KARTOTÉKA</span>
            <span className="kt-auth-brand-tag">Egyházi nyilvántartó rendszer</span>
          </div>
        </header>

        {/* Main 2-column */}
        <main className="kt-auth-main">
          <AuthLeftPane />

          <div className="kt-auth-right">
            <div className="kt-auth-card">{children}</div>
          </div>
        </main>

        {/* Footer */}
        <footer className="kt-auth-footer">
          <div className="kt-auth-footer-left">
            <svg
              className="kt-auth-footer-cross"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M11 2h2v6h6v2h-6v12h-2V10H5V8h6V2z" />
            </svg>
            <Link href="#" className="kt-auth-footer-link">Adatvédelem</Link>
            <Link href="#" className="kt-auth-footer-link">ÁSZF</Link>
            <Link href="#" className="kt-auth-footer-link">Súgó</Link>
            <Link href="#" className="kt-auth-footer-link">Kapcsolat</Link>
          </div>
          <div>© {new Date().getFullYear()} Kartotéka — Minden jog fenntartva.</div>
        </footer>
      </div>
    </div>
  )
}
