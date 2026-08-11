'use client'

/**
 * FIGYELMEZTETŐ SÁV — ÉS EZ AZ ŐRSZEM (2026-08-11).
 *
 * ─── MIÉRT NINCS KÜLÖN ŐRSZEM-CRON ─────────────────────────────────────────
 * Ez a sáv nem attól függ, hogy a mentő kód lefutott-e: a HIÁNYBÓL számol
 * (`max(finished_at)` az igazolt mentésekre). Ha a cron törlődik, ha a deploy
 * elromlik, ha a mentő route 500-at ad — a sáv AKKOR IS megjelenik.
 * A riasztás nem lakhat abban, amit figyel.
 *
 * ─── NEM ELREJTHETŐ ────────────────────────────────────────────────────────
 * Nincs „X" gomb, nincs „ne mutasd többet". Csak akkor tűnik el, ha VAN friss,
 * IGAZOLT mentés. Egy elrejthető figyelmeztetés az első fáradt napon elrejtődik,
 * és onnantól a rendszer hazudik.
 *
 * ─── BEVALLOTT KORLÁT ──────────────────────────────────────────────────────
 * Ha senki nem lép be, a sávot senki nem látja. Ezért megy e-mail is, és ezért
 * áll le hibás kilépési kóddal a cron-szkript.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react'

import { getBackupBannerStateAction } from '@/app/(dashboard)/admin/biztonsagi-mentes/actions'
import type { BackupHealth } from '@/app/(dashboard)/admin/biztonsagi-mentes/shared'

export function BackupStaleBanner() {
  const [allapot, setAllapot] = useState<{ health: BackupHealth; ut: string } | null>(null)

  useEffect(() => {
    let elo = true
    void getBackupBannerStateAction()
      .then((r) => {
        if (elo) setAllapot(r)
      })
      .catch(() => {
        // A sáv soha nem boríthatja az oldalt.
      })
    return () => {
      elo = false
    }
  }, [])

  if (!allapot) return null
  const { health, ut } = allapot
  if (health.allapot === 'friss' && !health.driveHiba) return null
  if (health.allapot === 'sql_hianyzik') return null

  const kritikus = health.allapot === 'kritikus' || health.allapot === 'nincs_mentes'
  const Ikon = kritikus ? ShieldAlert : AlertTriangle

  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        'mb-4 rounded-2xl border p-3 sm:p-4',
        kritikus
          ? 'border-destructive/40 bg-destructive/10'
          : 'border-amber-300 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30',
      ].join(' ')}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={[
              'flex size-10 shrink-0 items-center justify-center rounded-xl',
              kritikus
                ? 'bg-destructive/15 text-destructive'
                : 'bg-amber-200/60 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
            ].join(' ')}
            aria-hidden
          >
            <Ikon className="size-5" />
          </div>
          <div className="min-w-0">
            <p
              className={[
                'text-sm font-semibold leading-snug',
                kritikus ? 'text-destructive' : 'text-amber-900 dark:text-amber-100',
              ].join(' ')}
            >
              {health.mondat}
            </p>
            {health.driveHiba ? (
              <p
                className={[
                  'mt-0.5 text-xs leading-relaxed',
                  kritikus ? 'text-destructive/90' : 'text-amber-800 dark:text-amber-200/90',
                ].join(' ')}
              >
                {health.driveHiba}
              </p>
            ) : null}
          </div>
        </div>

        <Link
          href={ut}
          aria-label="Megnézem, mi a baj a biztonsági mentéssel"
          className={[
            // 44px érintőfelület — mobil-első követelmény.
            'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition',
            kritikus
              ? 'bg-destructive text-[var(--destructive-foreground,#fff)] hover:opacity-90'
              : 'bg-amber-900 text-white hover:opacity-90 dark:bg-amber-200 dark:text-amber-950',
          ].join(' ')}
        >
          Megnézem, mi a baj
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
