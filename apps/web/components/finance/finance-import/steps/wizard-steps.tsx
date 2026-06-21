'use client'

/**
 * Modern wizard lépés-jelző (stepper) a pénzügyi importálóhoz (2026-06-19).
 *
 * Egyértelművé teszi, hol tart a felhasználó: Feltöltés → Áttekintés és
 * egyeztetés → Kész. A kész lépések pipát kapnak, az aktuális kiemelve.
 */

import { Check } from 'lucide-react'

const STEPS = [
  { n: 1 as const, label: 'Feltöltés', hint: 'Fájlok kiválasztása' },
  { n: 2 as const, label: 'Áttekintés és egyeztetés', hint: 'Kategóriák, befizetők' },
  { n: 3 as const, label: 'Kész', hint: 'Importálás eredménye' },
]

export function WizardSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-stretch gap-2 rounded-[1.5rem] bg-card p-3 ring-1 ring-border sm:gap-3 sm:p-4">
      {STEPS.map((s, i) => {
        const done = current > s.n
        const active = current === s.n
        return (
          <li key={s.n} className="flex flex-1 items-center gap-2 sm:gap-3">
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition ${
                done
                  ? 'bg-emerald-600 text-white'
                  : active
                    ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {done ? <Check className="size-4" /> : s.n}
            </div>
            <div className="min-w-0">
              <p
                className={`truncate text-sm font-semibold ${
                  active ? 'text-emerald-800' : done ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                {s.label}
              </p>
              <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{s.hint}</p>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-1 hidden h-0.5 flex-1 rounded-full sm:block ${
                  done ? 'bg-emerald-400' : 'bg-slate-200'
                }`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
