/**
 * „Neked szóló üzenetek" — a harang tartalma (2026-08-12).
 *
 * SZERVER-KOMPONENS.
 *
 * ⚠️ EZ AZ EGYETLEN HELY AZ EGÉSZ OLDALON, ahol az „ÚJ NEKED" jelvény
 * kiírható. Az `ertesitesek.olvasva` az egyetlen adat a rendszerben, amiből
 * őszintén állítható, hogy a rendszergazda MÉG NEM LÁTOTT valamit.
 *
 * ⛔ TILOS „új neked" jelvényt tenni broadcastra vagy changelogra: az
 * `alreadySent` a FELHASZNÁLÓKNAK való kiküldést jelenti, a `readMarked` pedig
 * egy 2026-05-01-es dátum-küszöb. A kettő összekeverése maga a most javított
 * hiba természete.
 */

import Link from 'next/link'
import { ArrowRight, Bell } from 'lucide-react'

import type { Ag, UzenetSor } from '@/app/(dashboard)/admin/overview-shared'
import { huIdopontBukarest } from '@/lib/utils/idopont-bukarest'

export function UzenetekPanel({ ag }: { ag: Ag<UzenetSor[]> }) {
  if (!ag.ok && ag.fajta === 'nincs_jog') return null

  return (
    <section className="card-raised p-4 sm:p-5" aria-labelledby="uzenetek-cim">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="uzenetek-cim" className="flex items-center gap-2 font-heading text-lg text-foreground">
          <Bell className="size-4 text-muted-foreground" aria-hidden />
          Neked szóló üzenetek
        </h2>
        <Link
          href="/notifications"
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary hover:underline"
        >
          Az összes
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      {!ag.ok ? (
        <p
          role="alert"
          className="rounded-xl border-2 border-[var(--destructive)] bg-[color-mix(in_oklab,var(--destructive)_8%,transparent)] px-3 py-2 text-sm text-foreground"
        >
          Az üzeneteid most nem olvashatók. {ag.uzenet}
        </p>
      ) : ag.adat.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nincs üzeneted.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {ag.adat.map((u) => (
            <li key={u.id} className="flex items-start gap-2.5 py-2.5">
              {/* WCAG 1.4.1: KITÖLTÖTT pötty + kiírt szó, nem csak szín. */}
              <span
                aria-hidden
                className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                  u.olvasatlan ? 'bg-[var(--accent)]' : 'border border-border'
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-foreground">{u.cim}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {u.olvasatlan ? 'Még nem olvastad' : 'Olvasva'}
                  {/* 2026-08-12: `timeZone` NÉLKÜLI formázás volt itt, SZERVER-
                      komponensben — a Railway-konténer UTC-jét vette, tehát
                      nyáron 3 órával korábbi időt írt ki. */}
                  {u.mikor ? ` · ${huIdopontBukarest(u.mikor, 'short')}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
