/**
 * Riadó-csempe az admin ÁTTEKINTÉS oldalon (2026-08-12).
 *
 * ⚠️ SZERVER-KOMPONENS. Nincs benne `'use client'`, mert nincs benne hook és
 * eseménykezelő — így a lucide-ikonokat SAJÁT MAGA importálja, nem propként
 * kapja. Egy tiszta megjelenítő komponens felesleges kliensesítése tegnap éles
 * 500-at okozott a /notifications oldalon (`Icon={Bell}` a kliens-határon át).
 *
 * WCAG 1.4.1 — AZ ÁLLAPOT SOHA NEM CSAK SZÍN:
 *   kritikus   → KÖR + felkiáltójel  + kiírt „Sürgős"
 *   figyelem   → HÁROMSZÖG           + kiírt „Figyelem"
 *   tájékoztató→ KÖR + „i"           + kiírt „Jó tudni"
 * Három KÜLÖNBÖZŐ IKONALAK, mindegyik mellett kiírt szó — szürkeárnyalatos
 * nyomtatásban és színtévesztéssel is megkülönböztethető.
 */

import Link from 'next/link'
import { ArrowRight, CircleAlert, Info, TriangleAlert } from 'lucide-react'

import { Szamlalo } from './szamlalo'
import type { Riado, RiadoFokozat } from '@/app/(dashboard)/admin/overview-shared'

const FOKOZAT_SZO: Record<RiadoFokozat, string> = {
  kritikus: 'Sürgős',
  figyelem: 'Figyelem',
  tajekoztato: 'Jó tudni',
}

/** Téma-tokenek, sehol hardkódolt szín. */
const FOKOZAT_STILUS: Record<RiadoFokozat, { keret: string; ikon: string }> = {
  kritikus: {
    keret: '2px solid var(--destructive)',
    ikon: 'linear-gradient(135deg, var(--destructive), color-mix(in oklab, var(--destructive) 65%, black))',
  },
  figyelem: {
    keret: '2px solid color-mix(in oklab, var(--accent) 60%, var(--border))',
    ikon: 'linear-gradient(135deg, var(--accent), var(--accent2))',
  },
  tajekoztato: {
    keret: '1px solid var(--border)',
    ikon: 'linear-gradient(135deg, var(--primary), var(--accent))',
  },
}

function FokozatIkon({ fokozat }: { fokozat: RiadoFokozat }) {
  if (fokozat === 'kritikus') return <CircleAlert className="size-6" aria-hidden />
  if (fokozat === 'figyelem') return <TriangleAlert className="size-6" aria-hidden />
  return <Info className="size-6" aria-hidden />
}

export function RiadoCsempe({
  riado,
  vezeto = false,
  sziv = false,
}: {
  riado: Riado
  /** A lista első, legsúlyosabb eleme — nagyobb tipográfiát kap. */
  vezeto?: boolean
  /**
   * Szívverés: KIZÁRÓLAG a legsúlyosabb KRITIKUS csempén. 2 ciklus = 4,8 s,
   * majd VÉGLEG megáll — szándékosan az 5 másodperces WCAG 2.2.2 küszöb alatt,
   * hogy ne kelljen külön „szüneteltetés" vezérlő. Lásd `.kt-sziv`.
   */
  sziv?: boolean
}) {
  const st = FOKOZAT_STILUS[riado.fokozat]

  return (
    <article
      className="card-raised h-full p-4 sm:p-5"
      style={{ border: st.keret }}
      aria-labelledby={`riado-${riado.id}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`icon-raised flex size-11 shrink-0 items-center justify-center text-[var(--primary-foreground)]${
            sziv ? ' kt-sziv' : ''
          }`}
          style={{ background: st.ikon }}
          aria-hidden
        >
          <FokozatIkon fokozat={riado.fokozat} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {FOKOZAT_SZO[riado.fokozat]}
          </p>
          <h3
            id={`riado-${riado.id}`}
            className={`mt-0.5 font-heading text-foreground ${vezeto ? 'text-xl sm:text-2xl' : 'text-lg'}`}
          >
            {riado.cim}
          </h3>

          {riado.szam !== null && (
            <p
              className={`mt-1 font-heading font-semibold text-foreground ${
                vezeto ? 'text-4xl' : 'text-3xl'
              }`}
            >
              <Szamlalo ertek={riado.szam} />
            </p>
          )}

          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-foreground/90 sm:text-[15px]">
            {riado.mondat}
          </p>

          {riado.alsorok.length > 0 && (
            <ul className="mt-2 space-y-1">
              {riado.alsorok.map((s) => (
                <li key={s} className="text-sm leading-relaxed text-muted-foreground">
                  {s}
                </li>
              ))}
            </ul>
          )}

          {riado.jelvenyek.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {riado.jelvenyek.map((j) => (
                <li
                  key={j.szoveg}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground ring-1 ring-inset ring-border"
                >
                  {/* Alak is megkülönbözteti: az érintetlen ÜRES kör, az olvasatlan KITÖLTÖTT. */}
                  <span
                    aria-hidden
                    className={
                      j.fajta === 'olvasatlan'
                        ? 'size-2 rounded-full bg-current'
                        : j.fajta === 'erintetlen'
                          ? 'size-2 rounded-full border border-current'
                          : 'size-2 rounded-[2px] border border-current'
                    }
                  />
                  {j.szoveg}
                </li>
              ))}
            </ul>
          )}

          <Link
            href={riado.ut}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:w-auto"
            aria-label={`${riado.gombFelirat} — ${riado.cim}`}
          >
            {riado.gombFelirat}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  )
}
