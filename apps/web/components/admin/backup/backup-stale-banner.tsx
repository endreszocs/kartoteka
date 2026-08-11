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
 * ─── 2026-08-11: A NÉMASÁG MEGSZÜNTETVE ────────────────────────────────────
 * A sáv korábban `.catch(() => {})`-tal nyelt el MINDEN hibát, és a `null`
 * állapot HÁROM különböző dolgot jelentett: „még tölt", „nincs jog", „a
 * szerver-hívás ELBUKOTT". Mindhárom ugyanúgy nézett ki: sehogy. Emiatt nem
 * lehetett eldönteni, hogy a hiányzó sáv jó hír vagy néma bukás — pontosan ez
 * a projekt visszatérő hibaosztálya.
 *
 * Mostantól:
 *   · a szerver `ok` mezővel MEGMONDJA, miért hallgat,
 *   · hiba esetén LÁTHATÓ, visszafogott sor jelenik meg,
 *   · a gyökérelemen `data-mentes-sav="tolt|nincs-jog|nincs-sql|hiba|latszik"`
 *     van, tehát egyetlen DevTools-lekérdezés eldönti, mi történt:
 *       document.querySelectorAll('[data-mentes-sav]')
 *
 * ─── HOL VAN A LAPON ───────────────────────────────────────────────────────
 * A sáv NEM a görgethető `<main>` tetején van, hanem a fejléc alatt, SAJÁT
 * sorban (dashboard-shell.tsx). Így sem görgetés, sem fedő elem nem viheti ki
 * a képből — a hely szerkezeti, nem z-index-verseny kérdése.
 *
 * ─── BEVALLOTT KORLÁT ──────────────────────────────────────────────────────
 * Ha senki nem lép be, a sávot senki nem látja. Ezért megy e-mail is, és ezért
 * áll le hibás kilépési kóddal a cron-szkript.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, ShieldAlert, ShieldQuestion } from 'lucide-react'

import { getBackupBannerStateAction } from '@/app/(dashboard)/admin/biztonsagi-mentes/actions'
import type { BackupBannerState } from '@/app/(dashboard)/admin/biztonsagi-mentes/shared'

/**
 * A sáv SAJÁT térköze. A `dashboard-shell` slotja szándékosan üres keret: így
 * rejtett állapotban (amikor a komponens csak egy `hidden` jelölőt renderel)
 * NEM marad üres függőleges hézag a fejléc alatt. Alsó térköz nincs — azt a
 * `<main>` saját felső paddingje adja.
 */
const KERET = 'px-4 pt-4 md:px-6 md:pt-6 lg:px-7 lg:pt-7'

export function BackupStaleBanner() {
  const [allapot, setAllapot] = useState<BackupBannerState | null>(null)

  useEffect(() => {
    let elo = true
    void getBackupBannerStateAction()
      .then((r) => {
        if (elo) setAllapot(r)
      })
      .catch((e: unknown) => {
        // A sáv soha nem boríthatja az oldalt — de NEM is hallgat el.
        console.error('[mentes-sav] a szerver-akció hívása elbukott:', e)
        if (elo) {
          setAllapot({
            ok: 'hiba',
            hibaUzenet: e instanceof Error ? e.message : 'ismeretlen hiba',
          })
        }
      })
    return () => {
      elo = false
    }
  }, [])

  // Még tölt — nincs mit mondani, de a DOM-ban nyoma marad.
  if (!allapot) return <span hidden data-mentes-sav="tolt" />

  if (allapot.ok === 'nincs_jog') return <span hidden data-mentes-sav="nincs-jog" />
  if (allapot.ok === 'nincs_sql') return <span hidden data-mentes-sav="nincs-sql" />

  if (allapot.ok === 'hiba') {
    // ⚠️ EGY ŐRSZEM, AMI HIBA ESETÉN ELNÉMUL, NEM ŐRSZEM. Visszafogott, de
    //    látható sor: nem riadó (nem tudjuk, van-e baj), de nem is hallgatás.
    return (
      <div className={KERET}>
        <div
          data-mentes-sav="hiba"
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-border bg-muted/50 p-3 sm:p-4"
        >
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground"
            aria-hidden
          >
            <ShieldQuestion className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug text-foreground">
              A biztonsági mentés állapota most nem ellenőrizhető.
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Ez nem jelenti azt, hogy nincs mentés — csak azt, hogy most nem tudjuk
              megmondani. Töltsd újra az oldalt; ha ez marad, szólj a rendszergazdának.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const health = allapot.health
  if (!health) return <span hidden data-mentes-sav="nincs-jog" />
  if (health.allapot === 'friss' && !health.driveHiba) {
    return <span hidden data-mentes-sav="rendben" />
  }
  if (health.allapot === 'sql_hianyzik') return <span hidden data-mentes-sav="nincs-sql" />

  const kritikus = health.allapot === 'kritikus' || health.allapot === 'nincs_mentes'
  const Ikon = kritikus ? ShieldAlert : AlertTriangle
  const ut = allapot.ut ?? null

  return (
    <div className={KERET}>
    <div
      data-mentes-sav="latszik"
      role="alert"
      aria-live="polite"
      className={[
        'rounded-2xl border p-3 sm:p-4',
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

        {/* A gomb CSAK akkor jelenik meg, ha a felhasználó tényleg be is jut az
            admin felületre. Gyülekezeti profilban az /admin layout visszatereli
            a /dashboard-ra — egy visszapattanó gomb rosszabb a semminél. */}
        {ut ? (
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
        ) : null}
      </div>
    </div>
    </div>
  )
}
