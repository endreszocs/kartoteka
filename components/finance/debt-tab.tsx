'use client'

import { useMemo } from 'react'
import { formatCurrency } from '@/lib/constants/finance'
import type { BefitetesRow } from '@/lib/constants/finance'
import { AlertTriangle, CheckCircle, User } from 'lucide-react'

interface DebtTabProps {
  incomeRecords: BefitetesRow[]
  yearlyFees: Record<number, number>
  currentYear: number
  debtCalcMode: string
}

export function DebtTab({ incomeRecords, yearlyFees, currentYear }: DebtTabProps) {
  const yearlyFee = yearlyFees[currentYear] || 0

  // Személy szerinti befizetések összesítése az aktuális évre
  const personPayments = useMemo(() => {
    const map: Record<number, { osszeg: number; name: string }> = {}
    incomeRecords.forEach(r => {
      if (!r.id_szemely || r.fizetettev !== currentYear) return
      if (!map[r.id_szemely]) map[r.id_szemely] = { osszeg: 0, name: r.forrasa || `#${r.id_szemely}` }
      map[r.id_szemely].osszeg += r.osszeg
    })
    return map
  }, [incomeRecords, currentYear])

  const allPersons = Object.entries(personPayments)
  const debtors = allPersons.filter(([, v]) => v.osszeg < yearlyFee)
  const payers = allPersons.filter(([, v]) => v.osszeg >= yearlyFee)

  return (
    <div className="space-y-4">
      {/* KPI-k */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card-raised p-4 flex items-center gap-3">
          <div className="icon-raised w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xl font-bold text-amber-600">{debtors.length}</p>
            <p className="text-xs text-slate-400">Hátralékos</p>
          </div>
        </div>
        <div className="card-raised p-4 flex items-center gap-3">
          <div className="icon-raised w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600">
            <CheckCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xl font-bold text-emerald-600">{payers.length}</p>
            <p className="text-xs text-slate-400">Rendezett</p>
          </div>
        </div>
        <div className="card-raised p-4 flex items-center gap-3">
          <div className="icon-raised w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600">
            <User className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xl font-bold text-blue-600">{formatCurrency(yearlyFee)} RON</p>
            <p className="text-xs text-slate-400">Éves járulék ({currentYear})</p>
          </div>
        </div>
      </div>

      {yearlyFee === 0 && (
        <div className="card-raised p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Az éves járulék összege nincs beállítva.</p>
          <p className="text-xs text-slate-400 mt-1">Kérjük, állítsa be a Beállítások menüben a járulék összegét.</p>
        </div>
      )}

      {/* Hátralékosok listája */}
      {yearlyFee > 0 && debtors.length > 0 && (
        <div className="card-raised overflow-hidden">
          <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-700">Hátralékos egyháztagok ({debtors.length})</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500">#</th>
                  <th className="p-2.5 text-left text-xs font-medium text-slate-500">Név</th>
                  <th className="p-2.5 text-right text-xs font-medium text-slate-500">Befizetett</th>
                  <th className="p-2.5 text-right text-xs font-medium text-slate-500">Hátralék</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {debtors.sort((a, b) => a[1].osszeg - b[1].osszeg).map(([id, v], i) => (
                  <tr key={id} className="hover:bg-amber-50/30">
                    <td className="p-2.5 text-xs text-slate-400">{i + 1}</td>
                    <td className="p-2.5 font-medium text-slate-700">{v.name}</td>
                    <td className="p-2.5 text-right text-slate-500">{v.osszeg > 0 ? formatCurrency(v.osszeg) : '0'} RON</td>
                    <td className="p-2.5 text-right font-bold text-red-500">{formatCurrency(yearlyFee - v.osszeg)} RON</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {yearlyFee > 0 && debtors.length === 0 && (
        <div className="card-raised p-8 text-center">
          <CheckCircle className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
          <p className="text-sm text-emerald-600 font-medium">Mindenki rendben fizette a járulékot!</p>
          <p className="text-xs text-slate-400 mt-1">Nincs hátralékos egyháztag ebben az évben.</p>
        </div>
      )}
    </div>
  )
}
