'use client'

/**
 * DebtTab — közös tartozás-megjelenítő (Sprint Q Fázis 2, 2026-04-25, v0.6.1).
 *
 * Egyházfenntartási járulék hátralékai + bérleti díj hátralékok megjelenítése.
 * 100% pure-UI — nincs server action, nincs API hívás. Az adatot a szülő
 * (web `FinanceTabs` vagy desktop `PenzugyDashboardPage`) kalkulálja és
 * propsban átadja.
 *
 * Eredeti web fájl: `apps/web/components/finance/debt-tab-v2.tsx` (242 sor).
 * Most átkerült a shared package-be — a web tovább működik (re-export wrapper).
 */

import type { ReactNode } from 'react'
import { AlertTriangle, Building2, CheckCircle, ShieldCheck, User } from 'lucide-react'

import { formatCurrency } from './helpers'
import {
  RENTAL_TIPUS_LABELS,
  type DebtCalcMode,
  type DebtRow,
  type RentalDebtRow,
} from './types'

export interface DebtTabProps {
  debtRows: DebtRow[]
  yearlyFees: Record<number, number>
  currentYear: number
  debtCalcMode: DebtCalcMode
  rentalDebtRows?: RentalDebtRow[]
}

export function DebtTab({
  debtRows,
  yearlyFees,
  currentYear,
  debtCalcMode,
  rentalDebtRows = [],
}: DebtTabProps) {
  const yearlyFee = yearlyFees[currentYear] || 0
  const debtors = debtRows.filter((row) => row.status === 'hatralekos')
  const settled = debtRows.filter((row) => row.status === 'rendezve')
  const exempted = debtRows.filter((row) => row.status === 'felmentett')
  const modeLabel =
    debtCalcMode === 'aktualis'
      ? 'Aktuális év szerinti besorolás'
      : 'Akkori év szerinti besorolás'

  // Bérleti hátralék összesítő
  const rentalWithDebt = rentalDebtRows.filter((r) => r.hatralek > 0)
  const totalRentalDebt = rentalWithDebt.reduce((sum, r) => sum + r.hatralek, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <DebtKpiCard
          color="amber"
          icon={<AlertTriangle className="h-5 w-5 text-white" />}
          value={String(debtors.length)}
          label="Hátralékos"
        />
        <DebtKpiCard
          color="emerald"
          icon={<CheckCircle className="h-5 w-5 text-white" />}
          value={String(settled.length)}
          label="Rendezett"
        />
        <DebtKpiCard
          color="sky"
          icon={<ShieldCheck className="h-5 w-5 text-white" />}
          value={String(exempted.length)}
          label="Felmentett"
        />
        <DebtKpiCard
          color="blue"
          icon={<User className="h-5 w-5 text-white" />}
          value={`${formatCurrency(yearlyFee)} RON`}
          label={`Éves járulék (${currentYear})`}
        />
        <DebtKpiCard
          color="orange"
          icon={<Building2 className="h-5 w-5 text-white" />}
          value={`${formatCurrency(totalRentalDebt)} RON`}
          label={`Bérleti hátralék${
            rentalWithDebt.length ? ` (${rentalWithDebt.length})` : ''
          }`}
        />
      </div>

      <div className="card-raised flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700">Tényleges járulékállapot</p>
          <p className="text-xs text-slate-500">
            A lista csak az egyházfenntartási befizetésekkel számol, és figyelembe veszi az éves
            kedvezményeket, a határidős kedvezményt és a felmentéseket is.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {modeLabel}
        </span>
      </div>

      {yearlyFee === 0 && (
        <div className="card-raised p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-300" />
          <p className="text-sm text-slate-500">Az éves járulék összege nincs beállítva.</p>
          <p className="mt-1 text-xs text-slate-400">
            Kérjük, állítsa be a Beállítások menüben a járulék összegét.
          </p>
        </div>
      )}

      {yearlyFee > 0 && debtRows.length > 0 && (
        <div className="card-raised overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">
                Egyházfenntartási státusz tagonként
              </span>
            </div>
            <span className="text-xs text-slate-400">{debtRows.length} aktív rekord</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-white/85">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-slate-500">Név</th>
                  <th className="p-3 text-left text-xs font-medium text-slate-500">Állapot</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Elvárt</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Befizetett</th>
                  <th className="p-3 text-right text-xs font-medium text-slate-500">Hátralék</th>
                  <th className="p-3 text-left text-xs font-medium text-slate-500">
                    Kedvezmény / szabály
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {debtRows.map((row) => (
                  <tr key={row.memberId} className="hover:bg-slate-50/70">
                    <td className="p-3 font-medium text-slate-700">{row.name}</td>
                    <td className="p-3">
                      <span className={statusClassName(row.status)}>
                        {row.status === 'hatralekos'
                          ? 'Hátralékos'
                          : row.status === 'rendezve'
                            ? 'Rendezett'
                            : 'Felmentett'}
                      </span>
                    </td>
                    <td className="p-3 text-right text-slate-600">
                      {formatCurrency(row.expected)} RON
                    </td>
                    <td className="p-3 text-right text-slate-600">
                      {formatCurrency(row.paid)} RON
                    </td>
                    <td
                      className={`p-3 text-right font-semibold ${
                        row.debt > 0 ? 'text-red-500' : 'text-emerald-600'
                      }`}
                    >
                      {formatCurrency(row.debt)} RON
                    </td>
                    <td className="p-3 text-slate-500">
                      {row.appliedRules.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {row.appliedRules.map((rule) => (
                            <span
                              key={rule}
                              className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700"
                            >
                              {rule}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Teljes éves járulék</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {yearlyFee > 0 && debtRows.length === 0 && (
        <div className="card-raised p-8 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-emerald-300" />
          <p className="text-sm font-medium text-emerald-600">
            Még nincs aktív, számolható járuléksor ehhez az évhez.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Ha vannak látható tagok és beállított éves járulék, itt fog megjelenni a részletes
            lista.
          </p>
        </div>
      )}

      {/* Bérleti hátralék szekció */}
      {rentalDebtRows.length > 0 && (
        <div className="card-raised overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-orange-50/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-semibold text-slate-700">
                Bérleti szerződések — hátralék
              </span>
            </div>
            <span className="text-xs text-slate-500">
              {rentalWithDebt.length > 0
                ? `${rentalWithDebt.length} bérlőnél van hátralék`
                : 'Nincs hátralékos bérlő'}
            </span>
          </div>

          {rentalWithDebt.length === 0 ? (
            <div className="p-6 text-center">
              <CheckCircle className="mx-auto mb-2 h-8 w-8 text-emerald-300" />
              <p className="text-sm font-medium text-emerald-600">
                Minden bérleti díj rendezve az elmúlt 2 évben.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-white/85">
                  <tr>
                    <th className="p-3 text-left text-xs font-medium text-slate-500">Bérlő</th>
                    <th className="p-3 text-left text-xs font-medium text-slate-500">Leírás</th>
                    <th className="p-3 text-left text-xs font-medium text-slate-500">Típus</th>
                    <th className="p-3 text-right text-xs font-medium text-slate-500">Éves díj</th>
                    <th className="p-3 text-right text-xs font-medium text-slate-500">
                      Befizetett
                    </th>
                    <th className="p-3 text-right text-xs font-medium text-slate-500">Hátralék</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rentalWithDebt.map((r) => (
                    <tr key={r.contractId} className="hover:bg-orange-50/40">
                      <td className="p-3 font-medium text-slate-700">{r.berlo_nev}</td>
                      <td className="p-3 text-slate-600">
                        <span className="line-clamp-1">{r.leiras}</span>
                      </td>
                      <td className="p-3 text-slate-500 text-xs">{RENTAL_TIPUS_LABELS[r.tipus]}</td>
                      <td className="p-3 text-right text-slate-600">
                        {formatCurrency(r.evesDij)} RON
                      </td>
                      <td className="p-3 text-right text-slate-600">
                        {formatCurrency(r.fizett)} RON
                      </td>
                      <td className="p-3 text-right font-semibold text-red-500">
                        {formatCurrency(r.hatralek)} RON
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
            A hátralékot a rendszer az utolsó 2 évre számolja (szerződés szerinti arányosítással
            és a befizetések dupla-párosításával — személy ID VAGY bérlő neve alapján).
          </div>
        </div>
      )}
    </div>
  )
}

interface DebtKpiCardProps {
  color: 'amber' | 'emerald' | 'sky' | 'blue' | 'orange'
  icon: ReactNode
  value: string
  label: string
}

function DebtKpiCard({ color, icon, value, label }: DebtKpiCardProps) {
  const palette = {
    amber: { gradient: 'from-amber-500 to-orange-500', text: 'text-amber-600' },
    emerald: { gradient: 'from-emerald-500 to-green-600', text: 'text-emerald-600' },
    sky: { gradient: 'from-sky-500 to-cyan-600', text: 'text-sky-600' },
    blue: { gradient: 'from-blue-500 to-indigo-600', text: 'text-blue-600' },
    orange: { gradient: 'from-orange-500 to-red-500', text: 'text-orange-600' },
  } as const

  return (
    <div className="card-raised flex items-center gap-3 p-4">
      <div className={`icon-raised h-10 w-10 bg-gradient-to-br ${palette[color].gradient}`}>
        {icon}
      </div>
      <div>
        <p className={`text-xl font-bold ${palette[color].text}`}>{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  )
}

function statusClassName(status: DebtRow['status']) {
  if (status === 'hatralekos')
    return 'inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600'
  if (status === 'rendezve')
    return 'inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600'
  return 'inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700'
}
