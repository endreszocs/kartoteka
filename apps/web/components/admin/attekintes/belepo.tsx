'use client'

/**
 * Belépő-burkoló az admin ÁTTEKINTÉS csempéihez (2026-08-12).
 *
 * ⚠️ MIÉRT CSAK EZ A RÉTEG KLIENS. A csempék maguk SZERVER-komponensek — ez a
 * burkoló csak `children`-t kap, ami már kész React-elem, nem függvény.
 * Szerver-komponens FÜGGVÉNYT (pl. `Icon={Bell}`) SOHA nem adunk át kliens-
 * határon: tegnap pontosan ez okozott éles 500-at a /notifications oldalon.
 *
 * A mozgás maga CSS (`.kt-belepo` — packages/ui/src/kartoteka.css), a
 * `prefers-reduced-motion` kezelése is ott van. Ez a komponens csak a lépcsős
 * késleltetést adja hozzá, LEGFELJEBB 6 fokban: így a legalsó csempe is
 * 500 ms-on belül a helyén van, és a teljes belépő sosem nyúlik el.
 */

import type { ReactNode } from 'react'

const LEPCSO_MS = 50
const MAX_LEPCSO = 6

export function Belepo({
  index = 0,
  className,
  children,
}: {
  index?: number
  className?: string
  children: ReactNode
}) {
  const keses = Math.min(index, MAX_LEPCSO) * LEPCSO_MS
  return (
    <div
      className={`kt-belepo${className ? ` ${className}` : ''}`}
      style={{ ['--kt-belepo-keses' as string]: `${keses}ms` }}
    >
      {children}
    </div>
  )
}
