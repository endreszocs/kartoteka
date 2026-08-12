/**
 * „Mi történt mostanában" — tevékenység-idővonal (2026-08-12).
 *
 * SZERVER-KOMPONENS.
 *
 * ⚠️ HIBA ESETÉN NEM ÜRES LISTÁT MUTAT. Egy üres idővonal azt állítaná, hogy
 * „nem történt semmi" — ez hamis megnyugtatás. Ha a lekérdezés elbukott, azt
 * kiírjuk; ha a néző profilja nem fér hozzá, a panel EL SEM JELENIK (az nem
 * hiba, csak nem az ő dolga).
 *
 * ⚠️ Az „új" jelzés IDŐRŐL szól, nem arról, hogy „láttad-e". A rendszer nem
 * tudja, mit láttál az admin felületen — ezt nem is állítjuk.
 */

import Link from 'next/link'
import { ArrowRight, History, ShieldAlert } from 'lucide-react'

import type { Ag, IdovonalSor } from '@/app/(dashboard)/admin/overview-shared'
import { ablakban } from '@/app/(dashboard)/admin/overview-shared'

function mikorSzoveg(iso: string, most: number): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'ismeretlen időpont'
  const perc = Math.floor((most - d.getTime()) / 60000)
  if (perc < 1) return 'az imént'
  if (perc < 60) return `${perc} perce`
  const ora = Math.floor(perc / 60)
  if (ora < 24) return `${ora} órája`
  return d.toLocaleString('hu-HU', { dateStyle: 'medium', timeStyle: 'short' })
}

export function IdovonalPanel({ ag, most }: { ag: Ag<IdovonalSor[]>; most: number }) {
  if (!ag.ok && ag.fajta === 'nincs_jog') return null

  const maiDb = ag.ok ? ag.adat.filter((s) => ablakban(s.mikor, most, 24)).length : 0

  return (
    <section className="card-raised p-4 sm:p-5" aria-labelledby="idovonal-cim">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="idovonal-cim" className="flex items-center gap-2 font-heading text-lg text-foreground">
          <History className="size-4 text-muted-foreground" aria-hidden />
          Mi történt mostanában
        </h2>
        <Link
          href="/admin/naplo"
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary hover:underline"
        >
          Teljes napló
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      {!ag.ok ? (
        <p
          role="alert"
          className="rounded-xl border-2 border-[var(--destructive)] bg-[color-mix(in_oklab,var(--destructive)_8%,transparent)] px-3 py-2 text-sm text-foreground"
        >
          A tevékenység-napló most nem olvasható, ezért NEM tudjuk, mi történt. {ag.uzenet}
        </p>
      ) : ag.adat.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          A napló üres — a legutóbbi eseményekről nincs bejegyzés.
        </p>
      ) : (
        <>
          {maiDb > 0 && (
            <p className="mb-2 text-sm text-muted-foreground">
              Ebből {maiDb} az elmúlt 24 órában történt.
            </p>
          )}
          <ul className="space-y-0 border-l-2 border-border pl-3">
            {ag.adat.map((s) => (
              <li key={s.id} className="relative py-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  {s.kiemelt && (
                    <ShieldAlert
                      className="size-4 shrink-0 text-[var(--destructive)]"
                      aria-label="Kiemelt esemény"
                    />
                  )}
                  <span className="text-sm font-semibold text-foreground">{s.szoveg}</span>
                  {s.ki && (
                    <span className="min-w-0 truncate text-sm text-muted-foreground">
                      · {s.ki}
                    </span>
                  )}
                  <span className="text-sm text-muted-foreground">
                    · {mikorSzoveg(s.mikor, most)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
