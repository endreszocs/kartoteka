'use client'

/**
 * Sidebar dekoráció — téma-specifikus motívum-overlay a sidebar mögött.
 *
 * Sablon (`shared/themes.jsx`) szerint:
 * - Kerített kert: rácsos `MotifTrellis` (egész területen, halvány)
 * - Zsoltáros: galamb `MotifDove` az alsó részen
 * - Csendes parókia: tiszta sidebar (az eredeti sablonban is `() => null`)
 *
 * A megfelelő motívumot a `data-theme` attribútum választja ki, mert a
 * komponens `useEffect`-tel olvassa ki a `documentElement` data-attribútumát
 * (SSR-safe, hydration-warning nélkül).
 */

import { useEffect, useState } from 'react'
import { MotifDove, MotifTrellis } from '@kartoteka/ui'

export function SidebarDecor() {
  const [theme, setTheme] = useState<string | null>(null)

  useEffect(() => {
    function read() {
      setTheme(document.documentElement.getAttribute('data-theme'))
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  if (theme === 'kert') {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ color: 'var(--accent2)' }}
      >
        <MotifTrellis opacity={0.045} />
      </div>
    )
  }

  if (theme === 'zsoltaros') {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 opacity-25"
        style={{ color: 'var(--accent2)' }}
      >
        <MotifDove size={140} opacity={0.7} />
      </div>
    )
  }

  return null
}
