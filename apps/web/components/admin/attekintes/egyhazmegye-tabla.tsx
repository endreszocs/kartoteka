/**
 * Egyházmegyénkénti bontás (2026-08-12).
 *
 * SZERVER-KOMPONENS, NULLA extra lekérdezés — a számok abból a kötegből jönnek,
 * amit az oldal amúgy is betöltött.
 *
 * ⚠️ A LEGFONTOSABB VÁLTOZÁS A RÉGI TÁBLÁHOZ KÉPEST. Az egyházmegyénkénti
 * tagszám egy RPC-ből jön (`admin_overview_member_counts`). Ha az SQL nem
 * futott le éles adatbázisban, a régi kód NÉMÁN 0 tagot mutatott minden
 * egyházmegyénél — a felület ezt „nincs tag"-ként jelenítette meg. Itt ez
 * LÁTHATÓ hiba-állapot: a tagszám-oszlop helyén szöveg áll, nem nulla.
 *
 * Mobil: a táblázat SAJÁT `overflow-x-auto` konténerben görög — a lap maga
 * soha nem görög vízszintesen (320px-en sem).
 */

import { Building2, TriangleAlert } from 'lucide-react'

import type { Ag, EgyhazmegyeBontas } from '@/app/(dashboard)/admin/overview-shared'

export function EgyhazmegyeTabla({ ag }: { ag: Ag<EgyhazmegyeBontas> }) {
  if (!ag.ok && ag.fajta === 'nincs_jog') return null

  return (
    <section className="card-raised p-4 sm:p-5" aria-labelledby="megye-cim">
      <h2
        id="megye-cim"
        className="mb-3 flex items-center gap-2 font-heading text-lg text-foreground"
      >
        <Building2 className="size-4 text-muted-foreground" aria-hidden />
        Egyházmegyénként
      </h2>

      {!ag.ok ? (
        <p
          role="alert"
          className="rounded-xl border-2 border-[var(--destructive)] bg-[color-mix(in_oklab,var(--destructive)_8%,transparent)] px-3 py-2 text-sm text-foreground"
        >
          A bontás most nem olvasható. {ag.uzenet}
        </p>
      ) : ag.adat.sorok.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nincs megjeleníthető egyházmegye.</p>
      ) : (
        <>
          {!ag.adat.tagszamElerheto && (
            <p
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-xl border-2 border-[var(--destructive)] px-3 py-2 text-sm leading-relaxed text-foreground"
            >
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-[var(--destructive)]"
                aria-hidden
              />
              <span>
                A tagszám-összesítő most nem elérhető, ezért a tagszám-oszlopot NEM mutatjuk. Ami
                itt nulla lenne, az nem azt jelentené, hogy nincs tag — csak azt, hogy nem tudjuk.
              </span>
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Egyházmegye
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">
                    Gyülekezet
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    Élő tag
                  </th>
                </tr>
              </thead>
              <tbody>
                {ag.adat.sorok.map((s) => (
                  <tr key={s.nev} className="border-b border-border/60">
                    <td className="py-2 pr-3 text-foreground">{s.nev}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                      {s.gyulekezetek.toLocaleString('hu-HU')}
                    </td>
                    <td className="py-2 text-right tabular-nums text-foreground">
                      {ag.adat.tagszamElerheto ? s.tagok.toLocaleString('hu-HU') : 'nem tudjuk'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
