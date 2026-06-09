'use client'

/**
 * Végösszeg-ellenőrző panel (2026-06-10, felhasználói kérés).
 *
 * „A végén a kiadások és bevételek meg kell egyezzenek az Adatok_2025.xlsx adataival."
 * Ez a panel a FÁJLBÓL számolt várható összegeket mutatja számlánként (Kassza + A–F),
 * hogy import után a Pénzügy oldal egyenlegeivel össze lehessen vetni. A belső mozgások
 * (kassza ↔ bank) is beleszámítanak — ezek a számlák között kiegyenlítik egymást.
 */

import { Calculator } from 'lucide-react'

export interface SheetTotals {
  label: string
  bev: number
  kia: number
  /** Bank-lapnál: hozzá van-e rendelve számla (ha nem, nem importálódik). */
  assigned?: boolean
  isBank?: boolean
}

interface ImportTotalsPanelProps {
  totals: SheetTotals[]
  grand: { bev: number; kia: number }
}

const fmt = (n: number) =>
  n.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ImportTotalsPanel({ totals, grand }: ImportTotalsPanelProps) {
  return (
    <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <Calculator className="size-5" />
        </div>
        <div>
          <h3 className="font-heading text-lg text-slate-800">Várható végösszegek (a fájlból)</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            Az import után ezeknek kell megjelenniük a Pénzügy oldalon. Számlánként a fájl szerinti
            bevétel/kiadás — a belső mozgásokat is beleértve. Vesd össze a Bank és Kassza fül
            egyenlegeivel!
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2">Számla / lap</th>
              <th className="px-3 py-2 text-right">Bevétel</th>
              <th className="px-3 py-2 text-right">Kiadás</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-100">
            {totals.map((t) => (
              <tr key={t.label} className={t.isBank && !t.assigned ? 'opacity-50' : ''}>
                <td className="px-3 py-2 font-medium text-slate-700">
                  {t.label}
                  {t.isBank && !t.assigned && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                      nincs hozzárendelve — kimarad
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{fmt(t.bev)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-700">{fmt(t.kia)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-emerald-300 font-bold">
              <td className="px-3 py-2 text-slate-800">Összesen</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{fmt(grand.bev)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-rose-800">{fmt(grand.kia)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
