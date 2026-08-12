/**
 * Egyházmegyénkénti bontás (2026-08-12).
 *
 * SZERVER-KOMPONENS, NULLA extra lekérdezés — a számok abból a kötegből jönnek,
 * amit az oldal amúgy is betöltött.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ MIÉRT NEM TÁBLÁZAT TÖBBÉ (2026-08-12)
 * ════════════════════════════════════════════════════════════════════════════
 * Egy 3 oszlopos táblázat 1650 px-re nyújtva pazarlás: a név bal szélen, a két
 * szám jobb szélen, közte fél méter üresség — és a szemnek végig kell utaznia.
 * Ugyanez az adat TÖBB HASÁBBAN negyedannyi függőleges helyet foglal, és a
 * három érték egymás mellett marad, ahol a szem összeköti őket.
 *
 * A HATÁR, AMEDDIG SŰRÍTETTÜNK: a hasábok száma legfeljebb 4 (2xl-től), a
 * harmadik hasáb csak `xl`-től (1280 px) indul, és a sormagasság legalább
 * 44 px. Ennél tovább nem mentünk — 6 hasáb már névtöredékeket adna.
 *
 * ⚠️ 2026-08-12: a `truncate` + `title` páros KIKERÜLT. A `title` érintő-
 * képernyőn elérhetetlen, tehát telefonon és tableten a levágott név
 * VÉGLEGESEN töredék maradt volna — a régi táblázat viszont `overflow-x-auto`-
 * ban görgött és SOHA nem csonkolt. A név most két sorba törik.
 *
 * ⚠️ A LEGFONTOSABB VÁLTOZÁS A RÉGI TÁBLÁHOZ KÉPEST (2026-08-12, változatlan):
 * az egyházmegyénkénti tagszám egy RPC-ből jön (`admin_overview_member_counts`).
 * Ha az SQL nem futott le éles adatbázisban, a régi kód NÉMÁN 0 tagot mutatott
 * minden egyházmegyénél. Itt ez LÁTHATÓ hiba-állapot: a tagszám helyén szöveg
 * áll, nem nulla.
 */

import { Building2, TriangleAlert } from 'lucide-react'

import type { Ag, EgyhazmegyeBontas } from '@/app/(dashboard)/admin/overview-shared'

export function EgyhazmegyeTabla({ ag }: { ag: Ag<EgyhazmegyeBontas> }) {
  if (!ag.ok && ag.fajta === 'nincs_jog') return null

  return (
    <section className="card-raised p-4 sm:p-5" aria-labelledby="megye-cim">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id="megye-cim"
          className="flex items-center gap-2 font-heading text-base text-foreground sm:text-lg"
        >
          <Building2 className="size-4 text-muted-foreground" aria-hidden />
          Egyházmegyénként
        </h2>
        {ag.ok && ag.adat.sorok.length > 0 && (
          <p className="text-xs text-muted-foreground">
            gyülekezet · élő tag &nbsp;—&nbsp; {ag.adat.sorok.length} egyházmegye
          </p>
        )}
      </div>

      {!ag.ok ? (
        <p
          role="alert"
          className="mt-2 rounded-xl border-2 border-[var(--destructive)] bg-[color-mix(in_oklab,var(--destructive)_8%,transparent)] px-3 py-2 text-sm text-foreground"
        >
          A bontás most nem olvasható. {ag.uzenet}
        </p>
      ) : ag.adat.sorok.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nincs megjeleníthető egyházmegye.</p>
      ) : (
        <>
          {!ag.adat.tagszamElerheto && (
            <p
              role="alert"
              className="mt-2 flex items-start gap-2 rounded-xl border-2 border-[var(--destructive)] px-3 py-2 text-sm leading-relaxed text-foreground"
            >
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-[var(--destructive)]"
                aria-hidden
              />
              <span>
                A tagszám-összesítő most nem elérhető, ezért a tagszámot NEM mutatjuk. Ami itt
                nulla lenne, az nem azt jelentené, hogy nincs tag — csak azt, hogy nem tudjuk.
              </span>
            </p>
          )}
          {/* ⚠️ A harmadik hasáb csak `xl`-től (1280). 1024 px-es ablakban a bal
              oldalsáv (288 px) miatt a tartalom 680 px — szűkebb, mint 768-on;
              három hasábbal ~199 px-es oszlopok jönnének ki, ahol a hosszabb
              egyházmegye-nevek (pl. „Sepsi-Kézdi-Orbai Egyházmegye")
              töredékké válnának. */}
          <ul className="mt-2 grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {ag.adat.sorok.map((s) => (
              <li
                key={s.nev}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-border/50 py-1.5"
              >
                {/* NINCS `truncate`: a régi táblázat SOHA nem csonkolt, és a
                    `title` érintőképernyőn elérhetetlen. Két sorba törik. */}
                <span className="min-w-0 text-[13px] font-semibold leading-tight text-foreground">
                  {s.nev}
                </span>
                <span className="shrink-0 text-right text-[13px] tabular-nums text-muted-foreground">
                  <strong className="font-semibold text-foreground">
                    {s.gyulekezetek.toLocaleString('hu-HU')}
                  </strong>
                  {' · '}
                  {ag.adat.tagszamElerheto ? (
                    <strong className="font-semibold text-foreground">
                      {s.tagok.toLocaleString('hu-HU')}
                    </strong>
                  ) : (
                    <span className="italic">nem tudjuk</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
