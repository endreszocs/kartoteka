'use client'

/**
 * Pénzügyi év-választó a hero-ban (2026-06-20).
 *
 * A pénzügyi modul minden füle (Kassza, Bank, Tranzakciók, Számadás…) a kiválasztott
 * ÉV adatait mutatja. Az évet a `?year=` URL-paraméter hordozza; a választó átnavigál,
 * a szerver (page.tsx) arra az évre tölti be az adatokat. Így visszamenőleg is meg lehet
 * nézni a korábbi (pl. importált) éveket.
 */

import { useRouter, usePathname } from 'next/navigation'
import { CalendarRange, ChevronDown } from 'lucide-react'

export function FinanceYearSelector({ currentYear }: { currentYear: number }) {
  const router = useRouter()
  const pathname = usePathname()

  const realYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = realYear + 1; y >= realYear - 7; y--) years.push(y)
  if (!years.includes(currentYear)) {
    years.push(currentYear)
    years.sort((a, b) => b - a)
  }

  return (
    <label
      className="group relative inline-flex cursor-pointer items-center gap-2 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
      title="Költségvetési év kiválasztása — a Kassza, Bank, Tranzakciók és Számadás erre az évre szűr"
    >
      <CalendarRange className="size-3.5 shrink-0" />
      <select
        value={currentYear}
        onChange={(e) => {
          const y = e.target.value
          // A # (aktív fül) megőrzése, hogy év-váltáskor ugyanazon a fülön maradj.
          const hash = typeof window !== 'undefined' ? window.location.hash : ''
          router.push(`${pathname}?year=${y}${hash}`)
        }}
        className="cursor-pointer appearance-none bg-transparent pr-4 font-semibold text-white outline-none [&>option]:text-slate-800"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}. költségvetési év
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-white/90" />
    </label>
  )
}
