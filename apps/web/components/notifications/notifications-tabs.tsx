'use client'

/**
 * ÉRTESÍTÉSEK OLDAL — FÜLEK (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT KÉT FÜL, ÉS MIÉRT EBBEN A SORRENDBEN
 * ════════════════════════════════════════════════════════════════════════════
 * A `/notifications` oldal eddig KIZÁRÓLAG az átjelentkezési kérelmeket
 * mutatta (`member_transfer_notifications`), a harang-üzenetekből (`ertesitesek`)
 * egyetlen sort sem. A harang lába ezt őszintén ki is írta: „Átjelentkezési
 * kérelmek megnyitása" — csakhogy a tulajdonos ott kereste az ÜZENETEIT.
 *
 * Ráadásul gyülekezeti hatókör nélküli profilban (rendszergazda, esperes,
 * egyházmegyei) az oldal CSAK egy hibadobozt mutatott:
 * „Az átjelentkezési értesítések csak gyülekezeti scope-ban érhetők el."
 * Vagyis a master — aki a mentés-riasztásokat kapja — SOHA nem látott itt semmit.
 *
 * Mostantól az ÜZENETEK az első fül (az mindenkinek van), az átjelentkezési
 * kérelmek a második. ⚠️ A hatókör hiánya CSAK a második fület érinti — az
 * üzeneteket soha nem viheti magával.
 *
 * ⚠️ A GYEREKEK SLOTOK, NEM PROPOK. A szerver-komponens kész `ReactNode`-ot ad
 *    át; így ez a fájl `use client` lehet anélkül, hogy szerver-komponens
 *    FÜGGVÉNYT kellene átvennie. Pontosan ez a különbségtétel bukott el
 *    2026-08-11-én éles 500-zal (`PageHero` + `Icon={Bell}`).
 */

import { useState, type ReactNode } from 'react'
import { Bell, Repeat2 } from 'lucide-react'

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
  const [aktiv, setAktiv] = useState<Ful>('uzenetek')

  const fulek: Array<{ id: Ful; cimke: string; szam: number; Ikon: typeof Bell }> = [
    { id: 'uzenetek', cimke: 'Üzenetek', szam: uzenetekSzam, Ikon: Bell },
    { id: 'kerelmek', cimke: 'Átjelentkezési kérelmek', szam: kerelmekSzam, Ikon: Repeat2 },
  ]

  return (
    <div className="space-y-3">
      {/* ⚠️ Vízszintesen görgethető: 375 px-en a két teljes felirat nem fér ki
          egymás mellé, a tördelés pedig szétesne. */}
      <div
        role="tablist"
        aria-label="Értesítés-nézetek"
        className="card-raised -mx-0 flex gap-2 overflow-x-auto px-3 py-3 sm:px-4"
      >
        {fulek.map((f) => {
          const akt = aktiv === f.id
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={akt}
              onClick={() => setAktiv(f.id)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                akt
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-secondary/60',
              )}
            >
              <f.Ikon className="size-4" aria-hidden />
              {f.cimke}
              {f.szam > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {f.szam}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div role="tabpanel">{aktiv === 'uzenetek' ? uzenetek : kerelmek}</div>
    </div>
  )
}
