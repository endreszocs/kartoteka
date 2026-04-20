'use client'

import { useState, useEffect, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, sortCellsHierarchically } from '@/lib/constants/finance'
import { finalizeAccounting, requestAccountingUnlock } from '@/app/(dashboard)/penzugy/actions'
import { loadBudgetRowsCompat } from '@/lib/finance/budget-compat'
import type { SzamadasiCel, BefitetesRow, KiadasRow, BealitasRow } from '@/lib/constants/finance'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { printToPdf, PRINT_STYLES } from '@/lib/utils/print-engine'
import { TrendingUp, TrendingDown, Scale, Printer } from 'lucide-react'

interface AccountingTabProps {
  szamadasiCellek: SzamadasiCel[]
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  settings: BealitasRow
  currentYear: number
}

export function AccountingTab({ szamadasiCellek, incomeRecords, expenseRecords, bevCelMap, kiaCelMap, settings, currentYear }: AccountingTabProps) {
  const [budgetData, setBudgetData] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const map: Record<string, number> = {}
      try {
        const data = await loadBudgetRowsCompat(supabase, currentYear, settings.congregation_id)
        data.forEach(b => { map[b.szamadasicelid] = b.tervezett })
      } catch {
        toast.error('Hiba a koltsegvetes betoltesekor.')
      }
      setBudgetData(map)
      setLoading(false)
    }
    load()
  }, [currentYear, settings.congregation_id])

  // Tényleges bevétel/kiadás kategóriánként
  const actualIncome = useMemo(() => {
    const map: Record<string, number> = {}
    incomeRecords.forEach(r => {
      const celKod = bevCelMap[r.id_befizetescel || 0]
      if (celKod) map[celKod] = (map[celKod] || 0) + r.osszeg
    })
    return map
  }, [incomeRecords, bevCelMap])

  const actualExpense = useMemo(() => {
    const map: Record<string, number> = {}
    expenseRecords.forEach(r => {
      const celKod = kiaCelMap[r.id_kiadascel || 0]
      if (celKod) map[celKod] = (map[celKod] || 0) + r.osszeg
    })
    return map
  }, [expenseRecords, kiaCelMap])

  // 2026-04-18: gyülekezeti szintre szűrünk (minden szintű cel-t lekérünk lookup-hoz, de itt csak gyulekezet látszik)
  const isGyulekezetSzint = (c: SzamadasiCel) => !c.szint || c.szint === 'gyulekezet'
  const bevetelCellek = useMemo(() => szamadasiCellek.filter(c => c.id.startsWith('1') && c.id !== '100' && isGyulekezetSzint(c)).sort((a, b) => sortCellsHierarchically(a.id, b.id)), [szamadasiCellek])
  const kiadasCellek = useMemo(() => szamadasiCellek.filter(c => c.id.startsWith('2') && isGyulekezetSzint(c)).sort((a, b) => sortCellsHierarchically(a.id, b.id)), [szamadasiCellek])

  const totalBudgetInc = bevetelCellek.reduce((s, c) => s + (budgetData[c.id] || 0), 0)
  const totalBudgetExp = kiadasCellek.reduce((s, c) => s + (budgetData[c.id] || 0), 0)
  const totalActualInc = Object.values(actualIncome).reduce((s, v) => s + v, 0)
  const totalActualExp = Object.values(actualExpense).reduce((s, v) => s + v, 0)

  if (loading) return <div className="py-12 text-center text-sm text-slate-400 animate-pulse">Számadás betöltése...</div>

  return (
    <div className="space-y-4">
      {/* KPI-k */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiBox label="Terv bevétel" value={formatCurrency(totalBudgetInc)} color="text-slate-600" icon={<TrendingUp className="w-4 h-4" />} />
        <KpiBox label="Tény bevétel" value={formatCurrency(totalActualInc)} color="text-emerald-600" icon={<TrendingUp className="w-4 h-4" />} />
        <KpiBox label="Terv kiadás" value={formatCurrency(totalBudgetExp)} color="text-slate-600" icon={<TrendingDown className="w-4 h-4" />} />
        <KpiBox label="Tény kiadás" value={formatCurrency(totalActualExp)} color="text-red-500" icon={<TrendingDown className="w-4 h-4" />} />
      </div>

      {/* Bevétel összehasonlítás */}
      <ComparisonTable
        title="Bevételek — Terv vs. Tény"
        icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
        headerColor="bg-emerald-50 border-emerald-100"
        cells={bevetelCellek}
        budgetData={budgetData}
        actualData={actualIncome}
        positiveColor="text-emerald-600"
      />

      {/* Kiadás összehasonlítás */}
      <ComparisonTable
        title="Kiadások — Terv vs. Tény"
        icon={<TrendingDown className="w-4 h-4 text-red-500" />}
        headerColor="bg-red-50 border-red-100"
        cells={kiadasCellek}
        budgetData={budgetData}
        actualData={actualExpense}
        positiveColor="text-red-500"
      />

      {/* Egyenleg + véglegesítés */}
      <div className="card-raised p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Scale className="w-5 h-5 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Éves egyenleg</span>
          {settings.accounting_finalized && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">Véglegesítve</Badge>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs text-slate-400">Tervezett</p>
            <p className={`text-xl font-bold ${totalBudgetInc - totalBudgetExp >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatCurrency(totalBudgetInc - totalBudgetExp)} RON
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Tényleges</p>
            <p className={`text-xl font-bold ${totalActualInc - totalActualExp >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(totalActualInc - totalActualExp)} RON
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="rounded-xl shadow-sm gap-1.5 mb-2"
          onClick={async () => {
            const allCells = [...bevetelCellek, ...kiadasCellek]
            let tableRows = ''
            allCells.forEach(c => {
              const budget = budgetData[c.id] || 0
              const actual = (c.id.startsWith('1') ? actualIncome : actualExpense)[c.id] || 0
              if (budget === 0 && actual === 0) return
              const isGroup = c.id.split('.').length === 1
              tableRows += `<tr class="${isGroup ? 'group-row' : ''}">
                <td>${c.nev}</td><td class="text-center">${c.id}</td>
                <td class="text-right">${budget.toFixed(2)}</td>
                <td class="text-right">${actual.toFixed(2)}</td>
              </tr>`
            })
            const html = `<html><head><style>${PRINT_STYLES}</style></head><body>
              <h1>${currentYear}. évi Számadás</h1>
              <div class="meta">Nyomtatva: ${new Date().toLocaleDateString('hu-HU')}</div>
              <table><thead><tr><th>Megnevezés</th><th style="width:12%;">Kód</th><th style="width:18%;">Terv (RON)</th><th style="width:18%;">Tény (RON)</th></tr></thead>
              <tbody>${tableRows}</tbody></table>
              <div class="footer">Kartotéka — Egyházi Nyilvántartási Rendszer</div>
            </body></html>`
            await printToPdf(html, `Szamadas_${currentYear}.pdf`)
            toast.success('Számadás PDF elkészült!')
          }}>
          <Printer className="w-3.5 h-3.5" /> Számadás PDF
        </Button>

        {!settings.accounting_finalized && (
          <Button size="sm" className="rounded-xl bg-violet-600 hover:bg-violet-700"
            onClick={async () => {
              if (!confirm('Biztosan véglegesíti a számadást?\n\nVéglegesítés után nem módosítható.')) return
              const result = await finalizeAccounting(currentYear)
              if (result.error) {
                toast.error(result.error)
                return
              }
              toast.success('Számadás véglegesítve!')
              window.location.reload()
            }}>
            Számadás véglegesítése
          </Button>
        )}
        {settings.accounting_finalized && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl shadow-sm border-amber-300 text-amber-700 hover:bg-amber-50"
            onClick={async () => {
              const reason = window.prompt('Miért kér feloldást a számadáshoz?', '')
              if (reason === null) return
              const result = await requestAccountingUnlock(currentYear, reason)
              if (result.error) {
                toast.error(result.error)
                return
              }
              toast.success('Feloldási kérelem elküldve a számadáshoz!')
              window.location.reload()
            }}
            disabled={!!settings.accounting_unlock_requested}
          >
            {settings.accounting_unlock_requested ? 'Feloldás elbírálás alatt...' : 'Feloldás kérelmezése'}
          </Button>
        )}
      </div>
    </div>
  )
}

function ComparisonTable({ title, icon, headerColor, cells, budgetData, actualData, positiveColor }: {
  title: string; icon: React.ReactNode; headerColor: string
  cells: SzamadasiCel[]; budgetData: Record<string, number>; actualData: Record<string, number>; positiveColor: string
}) {
  return (
    <div className="card-raised overflow-hidden">
      <div className={`${headerColor} px-4 py-3 border-b flex items-center gap-2`}>
        {icon}
        <span className="text-sm font-semibold text-slate-700">{title}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80 border-b border-slate-100">
            <tr>
              <th className="p-2 text-left text-xs font-medium text-slate-500 w-16">Kód</th>
              <th className="p-2 text-left text-xs font-medium text-slate-500">Megnevezés</th>
              <th className="p-2 text-right text-xs font-medium text-slate-500 w-24">Terv</th>
              <th className="p-2 text-right text-xs font-medium text-slate-500 w-24">Tény</th>
              <th className="p-2 text-right text-xs font-medium text-slate-500 w-20">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cells.map(c => {
              const budget = budgetData[c.id] || 0
              const actual = actualData[c.id] || 0
              const pct = budget > 0 ? Math.round((actual / budget) * 100) : (actual > 0 ? 999 : 0)
              const isGroup = c.id.split('.').length === 1
              if (budget === 0 && actual === 0) return null

              return (
                <tr key={c.id} className={isGroup ? 'bg-slate-50/50 font-semibold' : 'hover:bg-blue-50/20'}>
                  <td className="p-2 text-xs text-slate-400">{c.id}</td>
                  <td className={`p-2 ${isGroup ? 'text-slate-700' : 'text-slate-600 pl-6 text-xs'}`}>{c.nev}</td>
                  <td className="p-2 text-right text-slate-500">{budget > 0 ? formatCurrency(budget) : '—'}</td>
                  <td className={`p-2 text-right font-semibold ${positiveColor}`}>{actual > 0 ? formatCurrency(actual) : '—'}</td>
                  <td className="p-2 text-right">
                    {budget > 0 && (
                      <Badge className={`text-[10px] border-0 ${pct > 100 ? 'bg-red-100 text-red-600' : pct > 80 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        {pct}%
                      </Badge>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KpiBox({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="card-raised p-3.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-slate-400">{icon}</span>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value} <span className="text-xs font-normal text-slate-400">RON</span></p>
    </div>
  )
}
