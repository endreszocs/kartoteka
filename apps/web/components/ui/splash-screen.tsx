'use client'

/**
 * SplashScreen — session-szintű üdvözlő képernyő az auth layout-on.
 *
 * Sablon: `Kartoteka-handoff-Splash.zip → screens.jsx → SplashScreen` (2026-05-01).
 *
 * Mount-after rendering pattern (2026-04-23 hydration fix): SSR-en és az első
 * kliens-render-en `null`-t ad vissza, csak a `useEffect` lefutása után jelenik
 * meg. Így nincs HTML-mismatch.
 */

import Image from 'next/image'
import { useEffect, useState } from 'react'

const SESSION_KEY = 'kartoteka_splash_shown'
const FADE_DELAY_MS = 3000
const HIDE_DELAY_MS = 3500

export function SplashScreen() {
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const alreadyShown = sessionStorage.getItem(SESSION_KEY)
    if (alreadyShown) return

    sessionStorage.setItem(SESSION_KEY, '1')
    // Szándékos SSR-hydration pattern: a session-flag csak kliensen elérhető,
    // így az első render SSR-en és kliensen azonosan `visible=false` (→ null),
    // és csak a mount-on, conditional setState-tel váltunk át látható állapotra.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true)

    const fadeTimer = setTimeout(() => setFading(true), FADE_DELAY_MS)
    const hideTimer = setTimeout(() => setVisible(false), HIDE_DELAY_MS)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ background: 'var(--sidebar)', color: 'var(--sidebar-foreground)' }}
    >
      {/* Halvány koncentrikus motívum középen — sablon SVG */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center"
        style={{ opacity: 0.06 }}
      >
        <svg viewBox="0 0 400 400" width="640" height="640">
          <g fill="none" stroke="currentColor" strokeWidth="0.6">
            <circle cx="200" cy="200" r="180" />
            <circle cx="200" cy="200" r="140" />
            <circle cx="200" cy="200" r="100" />
            <line x1="20" y1="200" x2="380" y2="200" />
            <line x1="200" y1="20" x2="200" y2="380" />
          </g>
        </svg>
      </div>

      {/* Logó középen + márkanév + indeterminate progress */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-7">
        <Image
          src="/kartoteka-logo.png"
          alt="Kartotéka"
          width={168}
          height={168}
          className="kt-pulse object-contain drop-shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
          priority
        />

        <div className="text-center leading-snug">
          <div className="font-heading text-[42px] font-medium tracking-[-0.5px] mb-1.5">
            Kartotéka
          </div>
          <div
            className="text-[14px] uppercase"
            style={{ opacity: 0.65, letterSpacing: '1.5px' }}
          >
            Egyházi Nyilvántartó Rendszer
          </div>
        </div>

        {/* Indeterminate progress bar — 220px széles, sliding shimmer */}
        <div
          className="relative mt-5 h-[3px] w-[220px] overflow-hidden rounded-full"
          style={{ background: 'rgba(255,255,255,0.1)' }}
        >
          <div
            className="absolute h-full w-1/3 rounded-full kt-splash-bar"
            style={{ background: 'var(--accent2)' }}
          />
        </div>

        <div
          className="text-[11.5px]"
          style={{ opacity: 0.55, letterSpacing: '0.5px' }}
        >
          Adatok szinkronizálása…
        </div>
      </div>

      {/* Lábrész — copyright */}
      <div
        className="absolute bottom-7 left-0 right-0 text-center text-[10.5px]"
        style={{ color: 'var(--sidebar-foreground)', opacity: 0.5, letterSpacing: '0.5px' }}
      >
        © Erdélyi Református Egyházkerület · Kartotéka
      </div>
    </div>
  )
}
