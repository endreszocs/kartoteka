'use client'

/**
 * Pénzügyi év-választó a hero-ban (2026-06-20).
 *
 * A pénzügyi modul minden füle (Kassza, Bank, Tranzakciók, Számadás…) a kiválasztott
 * ÉV adatait mutatja. Az évet a `?year=` URL-paraméter hordozza; a választó átnavigál,
 * a szerver (page.tsx) arra az évre tölti be az adatokat. Így visszamenőleg is meg lehet
 * nézni a korábbi (pl. importált) éveket.
 *
 * 2026-07-10 (#1): pill-chip → dedikált, címkézett vezérlő-blokk. „Költségvetési év"
 * mikro-címke + ◄ évszám ► lépegetés + a nagy évszám maga a natív <select> (a11y).
 * A lépegetés CSAK a felkínált (adattal bíró) évek listáján mozog; minden navigáció
 * ugyanazt a szerződést használja: router.push(`${pathname}?year=${y}${hash}`) —
 * a `#` hash megőrzése tartja meg az aktív fület év-váltáskor.
 */

import { useRouter, usePathname } from 'next/navigation'
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

export function FinanceYearSelector({
  currentYear,
  availableYears,
}: {
  currentYear: number
  /** A felkínált évek (csak adattal bíró évek + folyó év). Ha üres, a folyó évre esünk vissza. */
  availableYears?: number[]
}) {
  const router = useRouter()
  const pathname = usePathname()

  const realYear = new Date().getFullYear()
  // Csak az adattal bíró évek (a szerver `listFinanceYears` adja) — NEM fix 2019–2027 lista.
  // A kiválasztott év mindig szerepel, hogy URL-ből megnyitva is látszódjon a hero-ban.
  const base = availableYears && availableYears.length > 0 ? availableYears : [realYear]
  // DESC rendezés: index 0 = legújabb év, utolsó index = legrégebbi év.
  const years = Array.from(new Set([...base, currentYear])).sort((a, b) => b - a)

  // Minden navigáció (lépegetés ÉS legördülő) ugyanazt a szerződést használja.
  const navigateToYear = (y: number) => {
    // A # (aktív fül) megőrzése, hogy év-váltáskor ugyanazon a fülön maradj.
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    router.push(`${pathname}?year=${y}${hash}`)
  }

  // A lista DESC → ► (újabb év) = index-1, ◄ (régebbi év) = index+1.
  const currentIndex = years.indexOf(currentYear)
  const newerYear = currentIndex > 0 ? years[currentIndex - 1] : undefined
  const olderYear = currentIndex >= 0 && currentIndex < years.length - 1 ? years[currentIndex + 1] : undefined

  return (
    <div
      className="inline-flex flex-col rounded-xl border border-emerald-200 bg-white/90 px-3 py-2 shadow-sm"
      title="Költségvetési év kiválasztása — a Kassza, Bank, Tranzakciók és Számadás erre az évre szűr"
    >
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700/80">
        <CalendarRange className="size-3 shrink-0" />
        Költségvetési év
      </span>
      <div className="mt-0.5 flex items-center gap-1">
        <button
          type="button"
          onClick={() => olderYear !== undefined && navigateToYear(olderYear)}
          disabled={olderYear === undefined}
          aria-label="Előző (régebbi) költségvetési év"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-emerald-700 transition hover:bg-emerald-50 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="size-5" />
        </button>
        {/* A nagy évszám MAGA a natív <select> (a11y + mobil): appearance-none, a nyíl dekoráció. */}
        <label className="relative inline-flex min-h-9 cursor-pointer items-center">
          <span className="sr-only">Költségvetési év kiválasztása</span>
          <select
            value={currentYear}
            onChange={(e) => navigateToYear(Number(e.target.value))}
            className="cursor-pointer appearance-none bg-transparent pr-6 text-xl font-bold text-slate-800 outline-none [&>option]:text-sm [&>option]:font-normal"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 size-4 text-emerald-600" />
        </label>
        <button
          type="button"
          onClick={() => newerYear !== undefined && navigateToYear(newerYear)}
          disabled={newerYear === undefined}
          aria-label="Következő (újabb) költségvetési év"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-emerald-700 transition hover:bg-emerald-50 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  )
}
