'use client'

/**
 * Szám-felfutás az admin ÁTTEKINTÉS nagy számaihoz (2026-08-12).
 *
 * SZABÁLYOK, AMIK NEM ALKUKÉPESEK:
 *  · `tabular-nums` — enélkül a szám SZÉLESSÉGE ugrálna futás közben, ami az
 *    idős szemnek a legzavaróbb mozgás.
 *  · Csak 4 fölött fut. 3-ig a felfutás vibrálásnak látszik, nem információnak.
 *  · Oldalanként EGYSZER, 420 ms alatt, ease-out. Nem ismétlődik.
 *  · A képernyőolvasó a VÉGÉRTÉKET kapja azonnal (`sr-only`), a futó szám
 *    `aria-hidden` — soha nem olvassa fel a köztes állapotokat.
 *  · `prefers-reduced-motion: reduce` mellett EL SEM INDUL, és a `change`
 *    eseményre is feliratkozunk: ha a felhasználó MENET KÖZBEN kapcsolja be
 *    (mert rosszul lett tőle), a futó animáció a következő képkockán megáll.
 *
 * ⚠️ MIÉRT NINCS BENNE `useState`. A szerver a VÉGÉRTÉKET rendereli — ha a
 * kliens 0-ról indulva állapotot írna, az (a) hidratálási eltérést okozna,
 * (b) képkockánként újrarenderelné a fát. Ezért a felfutás közvetlenül a DOM
 * szövegcsomópontját írja, `requestAnimationFrame`-ből. A React-fa érintetlen,
 * és JS nélkül (vagy hidratálás előtt) is a helyes szám látszik.
 */

import { useEffect, useRef } from 'react'

const IDO_MS = 420
const KUSZOB = 4

export function Szamlalo({ ertek, className }: { ertek: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || ertek <= KUSZOB) return

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf: number | null = null

    const vegallapot = () => {
      if (raf !== null) cancelAnimationFrame(raf)
      raf = null
      el.textContent = ertek.toLocaleString('hu-HU')
    }

    if (!mq.matches) {
      const start = performance.now()
      const lep = (t: number) => {
        const p = Math.min(1, (t - start) / IDO_MS)
        // ease-out (cubic) — nincs túllövés, nincs rugózás
        const e = 1 - Math.pow(1 - p, 3)
        el.textContent = Math.round(ertek * e).toLocaleString('hu-HU')
        if (p < 1) raf = requestAnimationFrame(lep)
        else raf = null
      }
      raf = requestAnimationFrame(lep)
    }

    mq.addEventListener('change', vegallapot)
    return () => {
      mq.removeEventListener('change', vegallapot)
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [ertek])

  return (
    <span className={className}>
      <span ref={ref} aria-hidden className="tabular-nums">
        {ertek.toLocaleString('hu-HU')}
      </span>
      <span className="sr-only">{ertek.toLocaleString('hu-HU')}</span>
    </span>
  )
}
