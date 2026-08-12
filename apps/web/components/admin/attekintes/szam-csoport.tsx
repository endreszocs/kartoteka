/**
 * TÉMA SZERINTI SZÁM-CSOPORT az admin ÁTTEKINTÉSEN (2026-08-12).
 *
 * SZERVER-KOMPONENS — az ikonokat maga importálja, nem propként kapja.
 * (Szerver-komponens FÜGGVÉNYT kliens-határon átadni éles 500-at okoz; ez
 * 2026-08-11-én a /notifications oldalon már megtörtént.)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SOR ÉS NEM CSEMPE — ITT HÚZTUK MEG A SŰRŰSÉG/OLVASHATÓSÁG HATÁRÁT
 * ════════════════════════════════════════════════════════════════════════════
 * A korábbi felület 5 nagy csempét tett egy sorba: 1650 px-en mindegyik ~260 px
 * széles lett EGY HÁROMJEGYŰ SZÁMHOZ. Húsz ilyen csempe négy képernyőnyi
 * görgetés lenne.
 *
 * A sor-alak ugyanazt a számot a negyedannyi helyen mutatja meg — DE a
 * takarékosság NEM a betűméreten történik, mert a célközönség 55+ éves:
 *   · a SZÁM 18-20 px (`text-lg sm:text-xl`), félkövér, `tabular-nums`,
 *   · a CÍMKE 13 px, félkövér, teljes `foreground` kontraszttal (nem halvány),
 *   · minden sor LEGALÁBB 44 px magas (`min-h-11`) — ez az érintőfelület
 *     alsó határa, és egyben a szem vezetéséhez szükséges levegő,
 *   · a sorok között elválasztó vonal fut, hogy a szem ne csússzon át a
 *     szomszéd sor számára.
 * Ennél tömörebbre NEM mentünk: a következő lépés a 12 px-es címke és a 36 px-es
 * sormagasság lett volna, ami táblázat, nem áttekintő.
 */

import Link from 'next/link'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import type { SzamCsoport } from '@/app/(dashboard)/admin/overview-shared'

function Sor({ cs }: { cs: SzamCsoport['sorok'][number] }) {
  const belso = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-snug text-foreground">
          {cs.cimke}
        </span>
        {cs.alsor && (
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
            {cs.alsor}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right font-heading text-lg font-semibold tabular-nums text-foreground sm:text-xl">
        {cs.ertek}
      </span>
    </>
  )

  if (!cs.ut) {
    return (
      <li className="flex min-h-11 items-center justify-between gap-3 border-b border-border/50 py-2 last:border-b-0">
        {belso}
      </li>
    )
  }
  return (
    <li className="border-b border-border/50 last:border-b-0">
      <Link
        href={cs.ut}
        className="kt-fokusz group -mx-2 flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 py-2 transition hover:bg-muted/60"
        aria-label={`${cs.cimke}: ${cs.ertek}${cs.alsor ? ` — ${cs.alsor}` : ''}`}
      >
        {belso}
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground/50 transition group-hover:text-muted-foreground"
          aria-hidden
        />
      </Link>
    </li>
  )
}

export function SzamCsoportKartya({
  csoport,
  children,
}: {
  csoport: SzamCsoport
  /** Kiegészítő tartalom a kártya alján (pl. a 14 napos mentés-csík). */
  children?: ReactNode
}) {
  const cimId = `szamcsoport-${csoport.id}`
  return (
    <section className="card-raised flex h-full flex-col p-4 sm:p-5" aria-labelledby={cimId}>
      <h3
        id={cimId}
        className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
      >
        {csoport.cim}
      </h3>

      {csoport.megjegyzes && (
        // A NEVEZŐ. Enélkül minden „országos" szám valójában egy-két gyülekezeté.
        <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{csoport.megjegyzes}</p>
      )}

      {csoport.sorok.length > 0 && (
        <ul className="mt-2 flex-1">
          {csoport.sorok.map((s) => (
            <Sor key={s.id} cs={s} />
          ))}
        </ul>
      )}

      {csoport.hianyzo.length > 0 && (
        // ⚠️ NINCS NÉMA NULLA. Ami nem futott le, azt a csoport KIMONDJA — a
        //    hiányzó számot soha nem helyettesíti 0.
        <div
          role="alert"
          className="mt-3 rounded-xl border-2 border-[var(--destructive)] px-2.5 py-2"
        >
          <p className="flex items-start gap-1.5 text-xs leading-snug text-foreground">
            <TriangleAlert
              className="mt-0.5 size-3.5 shrink-0 text-[var(--destructive)]"
              aria-hidden
            />
            <span>
              Ebből a csoportból hiányzik {csoport.hianyzo.length === 1 ? 'egy adat' : 'néhány adat'} —
              NEM nulla, hanem nem tudjuk:
            </span>
          </p>
          <ul className="mt-1 space-y-0.5 pl-5">
            {csoport.hianyzo.map((h) => (
              <li key={h} className="text-xs leading-snug text-muted-foreground">
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}
    </section>
  )
}
