'use client'

/**
 * FELTÖLTÉSRE VÁRÓ MUNKA — A LELKÉSZNEK IS (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT KELL
 * ════════════════════════════════════════════════════════════════════════════
 * A szinkron-jelző korábban azt írta ki, hogy „Konfliktus — felhasználói
 * beavatkozás szükséges", DE a feloldó felület (`ConflictDialog`) KIZÁRÓLAG a
 * `MutationQueuePanel`-ből volt mountolva, az pedig csak az
 * `/offline/diagnostika` oldalon élt — ahonnan a nem-admin lelkészt a rendszer
 * átirányítja. A felület tehát teljesíthetetlen kérést fogalmazott meg.
 *
 * Ez a kártya a `/offline` oldalon, MINDENKINEK megjeleníti ugyanazt a panelt —
 * de CSAK akkor, ha tényleg van feltöltésre váró vagy ütköző munka. Ha nincs,
 * nem rendel semmit: a pasztorális oldal tiszta marad.
 */

import { CloudUpload } from 'lucide-react'

import { useSyncStatus } from '@/lib/offline/hooks/use-sync-status'

import { MutationQueuePanel } from './mutation-queue-panel'

export function PendingWorkCard() {
  const allapot = useSyncStatus()
  if (!allapot.mounted) return null

  const van = allapot.bontas.osszesVarakozo > 0 || allapot.bontas.conflict > 0
  if (!van) return null

  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: 'color-mix(in oklab, var(--accent) 22%, transparent)',
            // Semleges `--foreground`: az `--accent-foreground` mindkét témában
            // majdnem fekete, ezért sötét módban bukna a kontraszt.
            color: 'var(--foreground)',
          }}
          aria-hidden
        >
          <CloudUpload className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-lg text-foreground">
            Van olyan módosításod, ami még nem került fel
          </h2>
          <p className="text-sm text-muted-foreground">
            {allapot.bontas.conflict > 0
              ? 'Egy vagy több rekordot közben más is módosított. Alább eldöntheted, melyik változat maradjon.'
              : 'Ezek a készülékeden vannak, és magától felkerülnek, amint van internet. Ha valamelyik elakadt, itt újrapróbálhatod.'}
          </p>
        </div>
      </div>
      <MutationQueuePanel />
    </section>
  )
}
