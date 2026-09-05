'use client'

/**
 * ÉRTESÍTÉSEK OLDAL — FÜLEK (2026-08-11; URL-alapú 2026-09-05).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT KÉT FÜL, ÉS MIÉRT EBBEN A SORRENDBEN
 * ════════════════════════════════════════════════════════════════════════════
 * Az ÜZENETEK az első fül (az mindenkinek van), az átjelentkezési kérelmek a
 * második. ⚠️ A gyülekezeti hatókör hiánya CSAK a második fület érinti — az
 * üzeneteket soha nem viheti magával (rendszergazdai / esperesi profilban a
 * régi oldal csak egy hibadobozt mutatott).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-09-05 — A FÜLÁLLAPOT AZ URL-BEN (U2, D6)
 * ════════════════════════════════════════════════════════════════════════════
 * Eddig `useState` volt: minden betöltés az Üzenetek füllel indult, a
 * `/notifications?ful=kerelmek` mélylink nem létezett, a mobil Vissza gomb
 * elhagyta az oldalt. Most `?ful=kerelmek` (+ `&kerelem=<id>` a kártyához
 * görgetve) — a natív `history.pushState`-tel, amit a Next.js router
 * szinkronizál a `useSearchParams`-szal szerver-kör nélkül.
 *
 * ⚠️ A GYEREKEK SLOTOK, NEM PROPOK: a szerver-komponens kész `ReactNode`-ot ad
 *    át; szerver-komponens FÜGGVÉNYT nem veszünk át (2026-08-11, éles 500).
 */

import { useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { Bell, Repeat2 } from 'lucide-react'

import { ertesitesUrl, urlAllapot } from '@/lib/notifications/beszelgetesek'
import { cn } from '@/lib/utils'

type Ful = 'uzenetek' | 'kerelmek'

export function NotificationsTabs({
  uzenetekSzam,
  kerelmekSzam,
  uzenetek,
  kerelmek,
}: {
  /** Olvasatlan üzenetek száma — a fülön látszik. */
  uzenetekSzam: number
  /** Válaszra váró átjelentkezési kérelmek száma. */
  kerelmekSzam: number
  uzenetek: ReactNode
  kerelmek: ReactNode
}) {
  const sp = useSearchParams()
  const allapot = urlAllapot((k) => sp.get(k))
  const aktiv: Ful = allapot.ful

  function valt(ful: Ful) {
    if (ful === aktiv) return
    window.history.pushState(null, '', ertesitesUrl({ ...allapot, ful }))
  }

  // `?kerelem=<id>` mélylink: a kártyához görgetünk és villantjuk (DOM-művelet, állapot nélkül).
  const kerelemId = aktiv === 'kerelmek' ? allapot.kerelem : null
  useEffect(() => {
    if (!kerelemId) return
    const cel = document.getElementById(`kerelem-${kerelemId}`)
    if (!cel) return
    cel.scrollIntoView({ block: 'center' })
    cel.classList.add('mentes-horgony-villan')
    const t = setTimeout(() => cel.classList.remove('mentes-horgony-villan'), 2400)
    return () => clearTimeout(t)
  }, [kerelemId])

  const fulek: Array<{ id: Ful; cimke: string; szam: number; Ikon: typeof Bell }> = [
    { id: 'uzenetek', cimke: 'Üzenetek', szam: uzenetekSzam, Ikon: Bell },
    { id: 'kerelmek', cimke: 'Átjelentkezési kérelmek', szam: kerelmekSzam, Ikon: Repeat2 },
  ]

  return (
    <div className="space-y-3">
      {/* ⚠️ Vízszintesen görgethető: 375 px-en a két teljes felirat nem fér ki
          egymás mellé, a tördelés pedig szétesne. */}
      <div role="tablist" aria-label="Értesítés-nézetek" className="card-raised -mx-0 flex gap-2 overflow-x-auto px-3 py-3 sm:px-4">
        {fulek.map((f) => {
          const akt = aktiv === f.id
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={akt}
              onClick={() => valt(f.id)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                akt ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-transparent text-muted-foreground hover:bg-secondary/60',
              )}
            >
              <f.Ikon className="size-4" aria-hidden />
              {f.cimke}
              {f.szam > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{f.szam}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div role="tabpanel">{aktiv === 'uzenetek' ? uzenetek : kerelmek}</div>
    </div>
  )
}
