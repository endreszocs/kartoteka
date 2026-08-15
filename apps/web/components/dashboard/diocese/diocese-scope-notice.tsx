import Link from 'next/link'
import { AlertCircle, ArrowLeft } from 'lucide-react'

/**
 * Megyei felületek KÖZÖS üres/vissza elemei (2026-08-15, S5).
 *
 * MIÉRT KÖZÖS: az egyházmegyei irányítópult mellé megérkeztek az alútvonalak
 * (iratok archívuma, összesítő). Mindegyiknek UGYANAZT kell mondania, ha a
 * hatókör nem oldható fel — ha három helyen három szöveg állna, a lelkész
 * három különböző magyarázatot kapna ugyanarra a helyzetre, és a fail-closed
 * viselkedés is felületenként csúszhatna el.
 */

/**
 * Fail-closed üres állapot: egyházmegyei szintű felhasználó, akinek NEM
 * oldható fel az egyházmegye-hatóköre (se aktív szerep, se profile_roles
 * diocese sor, se profiles.diocese_id). Korábban az ilyen felhasználó némán a
 * TELJES egyház listáját látta — soha nem mutatunk szűretlen adatot helyette.
 */
export function MissingDioceseScopeNotice() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      {/* Sötét módban a világos gradient bg-none-nal lekapcsol (4.3). */}
      <div className="card-raised border-amber-200 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/30 p-6 dark:border-amber-400/25 dark:bg-none">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            <AlertCircle className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg text-slate-800 dark:text-slate-100">
              Nincs egyházmegye rendelve a fiókjához
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Az egyházmegyei felületek csak akkor tudnak adatot mutatni, ha a szerepköréhez konkrét
              egyházmegye tartozik. Jelenleg a fiókjához nem sikerült egyházmegyét feloldani, ezért —
              az egyházmegyei adatok védelme érdekében — nem jelenítünk meg listát.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Kérjük, jelezze a rendszergazdának, hogy rendelje hozzá a szerepköréhez a megfelelő
              egyházmegyét, vagy — ha több profilja van — váltson profilt a fejlécben.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/** „Vissza az egyházmegyei irányítópultra" link — minden megyei alútvonal tetején. */
export function VisszaAzIranyitopultra() {
  return (
    <Link
      href="/dashboard-egyhazmegye"
      className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground max-sm:min-h-10"
    >
      <ArrowLeft className="size-4" />
      Vissza az egyházmegyei irányítópultra
    </Link>
  )
}
