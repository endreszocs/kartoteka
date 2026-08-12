/**
 * „A LEGNAGYOBB GYÜLEKEZETEK" — NULLA extra lekérdezés (2026-08-12).
 *
 * SZERVER-KOMPONENS.
 *
 * ⚠️ A `getAdminOverview()` a `top10` tömböt 2026-06-05 óta KISZÁMOLJA, és a
 * hívó eddig egyszerűen ELDOBTA: sehol nem volt fogyasztója. Ez a panel tehát
 * nem egy új lekérdezés, hanem egy eddig kárba veszett számítás.
 *
 * ⚠️ NINCS NÉMA NULLA: ha a tagszám-összesítő RPC nem futott le, a panel NEM
 * üres listát mutat („nincs gyülekezet"), hanem kimondja, hogy nem tudja.
 *
 * A sáv-diagram tisztán DÍSZ (`aria-hidden`): a rangsort a sorszám és a kiírt
 * tagszám hordozza, tehát színtévesztéssel és nyomtatásban is olvasható.
 */

import { Trophy } from 'lucide-react'

import type { Ag, GyulekezetMeret } from '@/app/(dashboard)/admin/overview-shared'

export function LegnagyobbakPanel({ ag }: { ag: Ag<GyulekezetMeret[]> }) {
  if (!ag.ok && ag.fajta === 'nincs_jog') return null

  return (
    <section className="card-raised p-4 sm:p-5" aria-labelledby="legnagyobbak-cim">
      <h2
        id="legnagyobbak-cim"
        className="flex items-center gap-2 font-heading text-base text-foreground sm:text-lg"
      >
        <Trophy className="size-4 text-muted-foreground" aria-hidden />
        A legnagyobb gyülekezetek
      </h2>

      {!ag.ok ? (
        <p
          role="alert"
          className="mt-2 rounded-xl border-2 border-[var(--destructive)] px-3 py-2 text-sm leading-relaxed text-foreground"
        >
          A rangsor most nem állítható össze, mert a gyülekezetenkénti tagszám nem elérhető. Ami
          itt üres lenne, az NEM azt jelenti, hogy nincs adat — csak azt, hogy nem tudjuk.
        </p>
      ) : ag.adat.length === 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Egyetlen gyülekezetnek sincs még élő tagnyilvántartása — a rangsorhoz legalább egy
          rögzített tag kell.
        </p>
      ) : (
        <ol className="mt-2">
          {ag.adat.map((g, i) => {
            const arany = Math.max(4, Math.round((g.tagok / ag.adat[0].tagok) * 100))
            return (
              <li
                key={`${g.nev}-${i}`}
                className="flex min-h-11 items-center gap-3 border-b border-border/50 py-2 last:border-b-0"
              >
                <span className="w-5 shrink-0 text-right text-[13px] font-semibold tabular-nums text-muted-foreground">
                  {i + 1}.
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-foreground">
                    {g.nev}
                  </span>
                  <span
                    aria-hidden
                    className="mt-1 block h-1.5 rounded-full"
                    style={{
                      width: `${arany}%`,
                      background: 'linear-gradient(90deg, var(--primary), var(--accent))',
                    }}
                  />
                </span>
                <span className="shrink-0 font-heading text-base font-semibold tabular-nums text-foreground">
                  {g.tagok.toLocaleString('hu-HU')}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
