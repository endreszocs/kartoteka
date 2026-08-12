/**
 * „Pulzus" — a nyugodt, mindig ugyanott lévő számok (2026-08-12).
 *
 * SZERVER-KOMPONENS (a számláló-animációt a kliens `Szamlalo` gyerek adja,
 * és az CSAK számot kap propként, nem komponens-függvényt).
 *
 * ⚠️ EZ A ZÓNA SOSEM RENDEZŐDIK ÁT. A riadók jönnek-mennek, de a pulzus-csempék
 * sorrendje betonba öntött: a lap nagyobbik része minden nap ugyanott van, így
 * az izommemória megmarad. Ez a legfontosabb engedmény a célközönségnek
 * (55+ éves lelkészek, gyakran telefonon).
 *
 * Mobilon 2 oszlop (375px-en és 320px-en is töretlen: a szám és a címke
 * egymás alatt van, `tabular-nums`-szal, a hosszú szöveg tör).
 */

import Link from 'next/link'

import type { PulzusCsempe } from '@/app/(dashboard)/admin/overview-shared'

function Csempe({ cs }: { cs: PulzusCsempe }) {
  const belso = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {cs.cimke}
      </p>
      <p className="mt-1 font-heading text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
        {cs.ertek}
      </p>
      {cs.alsor && (
        <p className="mt-1 text-sm leading-snug text-muted-foreground">{cs.alsor}</p>
      )}
    </>
  )

  if (!cs.ut) {
    return <div className="card-raised min-h-[6rem] p-3.5 sm:p-4">{belso}</div>
  }
  return (
    <Link
      href={cs.ut}
      className="card-raised block min-h-[6rem] p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:p-4"
      aria-label={`${cs.cimke}: ${cs.ertek}${cs.alsor ? ` — ${cs.alsor}` : ''}`}
    >
      {belso}
    </Link>
  )
}

export function PulzusRacs({ csempek }: { csempek: PulzusCsempe[] }) {
  if (csempek.length === 0) return null
  return (
    <section aria-labelledby="pulzus-cim">
      <h2 id="pulzus-cim" className="mb-3 font-heading text-lg text-foreground">
        A rendszer számai
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {csempek.map((cs) => (
          <Csempe key={cs.id} cs={cs} />
        ))}
      </div>
    </section>
  )
}
