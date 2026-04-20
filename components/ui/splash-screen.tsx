'use client'

/* eslint-disable @next/next/no-img-element */

/**
 * SplashScreen — session-szintű üdvözlő képernyő az auth layout-on.
 *
 * Mount-after rendering pattern (2026-04-23 hydration fix): SSR-en és az első
 * kliens-render-en `null`-t ad vissza, csak a `useEffect` lefutása után jelenik
 * meg. Így nincs HTML-mismatch.
 */

import { useEffect, useState } from 'react'

const SESSION_KEY = 'kartoteka_splash_shown'
const FADE_DELAY_MS = 3000
const HIDE_DELAY_MS = 3500

export function SplashScreen() {
  // Minden state `false`-szal indul → SSR és első kliens-render azonos
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)

  // Mount után döntjük el: kell-e splash?
  useEffect(() => {
    setMounted(true)

    // Session-szintű ellenőrzés — egyszer jelenik meg böngésző-session-enként
    const alreadyShown = sessionStorage.getItem(SESSION_KEY)
    if (alreadyShown) {
      // Ebben a sessionben már látta — ne mutassuk
      return
    }

    sessionStorage.setItem(SESSION_KEY, '1')
    setVisible(true)

    // Fade out + teljes eltűnés időzítők
    const fadeTimer = setTimeout(() => setFading(true), FADE_DELAY_MS)
    const hideTimer = setTimeout(() => setVisible(false), HIDE_DELAY_MS)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  // SSR + első kliens render → null (nincs hydration mismatch)
  // Mount után, ha még nem látta → splash megjelenik
  if (!mounted || !visible) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <img
        src="https://reformatus.ro/wp-content/uploads/2020/02/logo-500x800.png"
        alt="EREK Címer"
        className="h-32 mb-6 drop-shadow-2xl animate-pulse"
      />
      <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
        Kartotéka
      </h1>
      <p className="text-slate-400 text-sm mb-8">
        Erdélyi Református Egyházkerület
      </p>
      <p className="text-slate-500 text-xs italic max-w-md text-center leading-relaxed">
        &bdquo;Mert ahol ketten vagy hárman összegyűlnek az én nevemben,
        ott vagyok közöttük.&rdquo;
        <span className="block mt-1 text-slate-600">— Máté 18:20</span>
      </p>
    </div>
  )
}
