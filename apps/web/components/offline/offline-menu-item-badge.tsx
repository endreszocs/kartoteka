'use client'

import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react'

import { useSyncStatus } from '@/lib/offline/hooks/use-sync-status'

/**
 * Kis, kompakt jelvény az „Offline mentés" dropdown menüpont jobb oldalára.
 *
 * 2026-08-11: a saját `useState(syncing)` + két külön Dexie-számláló HELYETT a
 * közös `useSyncStatus()` hookból olvas. Korábban ez a jelvény és a fejléc
 * jelzője külön-külön követte ugyanazokat az eseményeket — két másolat
 * előbb-utóbb kétfélét mond („a második felület a régi implementációt őrzi").
 *
 * Ráadásul a várakozó munkát mostantól TELJESEN számolja: a korábbi
 * `pending + failed` kihagyta a feltöltés közben beragadt és a véglegesen
 * fentragadt (`dead`) mutációkat — épp a két veszélyes állapotot.
 *
 * Ha minden rendben van, **nem** rendel semmit → a menüpont tiszta marad.
 */
export function OfflineMenuItemBadge() {
  const allapot = useSyncStatus()
  if (!allapot.mounted) return null

  // Prioritás: konfliktus > offline > várakozó > szinkronizál > tiszta
  if (allapot.bontas.conflict > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
        style={{
          background: 'color-mix(in oklab, var(--destructive) 18%, transparent)',
          color: 'var(--destructive)',
        }}
      >
        <AlertTriangle className="size-3" aria-hidden />
        {allapot.bontas.conflict}
      </span>
    )
  }

  if (!allapot.online) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
        style={{
          background: 'color-mix(in oklab, var(--accent) 25%, transparent)',
          // Semleges `--foreground`: az `--accent-foreground` mindkét témában
          // majdnem fekete, ezért sötét módban bukna a kontraszt.
          color: 'var(--foreground)',
        }}
      >
        <CloudOff className="size-3" aria-hidden />
        Offline
      </span>
    )
  }

  if (allapot.bontas.osszesVarakozo > 0) {
    return (
      <span
        className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
        style={{
          background:
            allapot.bontas.dead > 0
              ? 'color-mix(in oklab, var(--destructive) 18%, transparent)'
              : 'color-mix(in oklab, var(--accent) 25%, transparent)',
          color: allapot.bontas.dead > 0 ? 'var(--destructive)' : 'var(--foreground)',
        }}
      >
        {allapot.bontas.osszesVarakozo}
      </span>
    )
  }

  if (allapot.fut) {
    return (
      <span
        className="inline-flex items-center rounded-full p-1"
        style={{
          background: 'color-mix(in oklab, var(--primary) 15%, transparent)',
          color: 'var(--primary)',
        }}
      >
        <RefreshCw className="size-3 animate-spin" aria-hidden />
      </span>
    )
  }

  // Minden rendben — semmit nem renderelünk (tiszta menü)
  return null
}
