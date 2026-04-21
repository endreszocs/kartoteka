'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Scale, Send, TrendingDown, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

import { requestAccountingUnlock } from '@/app/(dashboard)/penzugy/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AccountingFinalizeWizard } from '@/components/modals/accounting-finalize-wizard-dialog'
import { formatCurrency, sortCellsHierarchically, type BefitetesRow, type BealitasRow, type KiadasRow, type SzamadasiCel } from '@/lib/constants/finance'
import { loadBudgetRowsCompat } from '@/lib/finance/budget-compat'
import { createClient } from '@/lib/supabase/client'

interface AccountingTabV2Props {
  szamadasiCellek: SzamadasiCel[]
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  settings: BealitasRow
  currentYear: number
  /** 2026-04-18 SCOPE-AWARE: 'congregation' (default) vagy 'diocese'. */
  scope?: 'congregation' | 'diocese'
}

export function AccountingTabV2({
  szamadasiCellek,
  incomeRecords,
  expenseRecords,
  bevCelMap,
  kiaCelMap,
  settings,
  currentYear,
  scope = 'congregation',
}: AccountingTabV2Props) {
  const router = useRouter()
  const [budgetData, setBudgetData] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [finalizeWizardOpen, setFinalizeWizardOpen] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const map: Record<string, number> = {}
      try {
        const data = await loadBudgetRowsCompat(supabase, currentYear, settings.congregation_id)
        data.forEach((row) => {
          map[row.szamadasicelid] = row.tervezett
        })
      } catch {
        toast.error('Hiba a költségvetés betöltésekor.')
      }
      setBudgetData(map)
      setLoading(false)
    }

    void load()
  }, [currentYear, settings.congregation_id])

  const actualIncome = useMemo(() => {
    const map: Record<string, number> = {}
    incomeRecords.forEach((row) => {
      const code = bevCelMap[row.id_befizetescel || 0]
      if (code) map[code] = (map[code] || 0) + row.osszeg
    })
    return map
  }, [incomeRecords, bevCelMap])

  const actualExpense = useMemo(() => {
    const map: Record<string, number> = {}
    expenseRecords.forEach((row) => {
      const code = kiaCelMap[row.id_kiadascel || 0]
      if (code) map[code] = (map[code] || 0) + row.osszeg
    })
    return map
  }, [expenseRecords, kiaCelMap])

  // 2026-04-18: a szerver minden szintű szamadasicel-t lekér (lookup-hoz);
  // itt csak a gyülekezeti szintűek jelennek meg. `szint` default/undefined = 'gyulekezet'.
  const isGyulekezetSzint = (cell: SzamadasiCel) => !cell.szint || cell.szint === 'gyulekezet'

  const incomeCells = useMemo(
    () =>
      szamadasiCellek
        .filter((cell) => cell.id.startsWith('1') && cell.id !== '100' && isGyulekezetSzint(cell))
        .sort((left, right) => sortCellsHierarchically(left.id, right.id)),
    [szamadasiCellek],
  )

  const expenseCells = useMemo(
    () =>
      szamadasiCellek
        .filter((cell) => cell.id.startsWith('2') && isGyulekezetSzint(cell))
        .sort((left, right) => sortCellsHierarchically(left.id, right.id)),
    [szamadasiCellek],
  )

  // Csak leaf cellák (pont van az id-ban) összegzése — dupla számolás elkerülése
  const leafIncome = incomeCells.filter((c) => c.id.includes('.'))
  const leafExpense = expenseCells.filter((c) => c.id.includes('.'))
  const totalBudgetIncome = leafIncome.reduce((sum, cell) => sum + (budgetData[cell.id] || 0), 0)
  const totalBudgetExpense = leafExpense.reduce((sum, cell) => sum + (budgetData[cell.id] || 0), 0)
  const totalActualIncome = leafIncome.reduce((sum, cell) => sum + (actualIncome[cell.id] || 0), 0)
  const totalActualExpense = leafExpense.reduce((sum, cell) => sum + (actualExpense[cell.id] || 0), 0)

  const incomeRealization = totalBudgetIncome > 0 ? Math.round((totalActualIncome / totalBudgetIncome) * 100) : 0
  const expenseRealization = totalBudgetExpense > 0 ? Math.round((totalActualExpense / totalBudgetExpense) * 100) : 0
  const budgetedBalance = totalBudgetIncome - totalBudgetExpense
  const actualBalance = totalActualIncome - totalActualExpense

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-400">Számadás betöltése...</div>
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="card-raised p-5">
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-cyan-600" />
            <p className="text-base font-semibold text-slate-800">Élő számadási kép</p>
            {settings.accounting_finalized && (
              <Badge className="border-0 bg-emerald-100 text-emerald-700 ml-auto">Véglegesítve</Badge>
            )}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            A rendszer itt már azt mutatja, hogy a költségvetési tervhez képest a tényleges számadás hány százalékban valósult meg.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <ProgressCard
              label="Bevételi megvalósulás"
              percent={incomeRealization}
              actual={totalActualIncome}
              budget={totalBudgetIncome}
              tone="emerald"
            />
            <ProgressCard
              label="Kiadási megvalósulás"
              percent={expenseRealization}
              actual={totalActualExpense}
              budget={totalBudgetExpense}
              tone="rose"
            />
          </div>

          {/* Véglegesítés / javítási kérelem gomb — elérhető közelben az élő kép alatt */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500 max-w-md">
              {settings.accounting_finalized
                ? 'A számadás véglegesítve és beküldve az egyházmegyének. Módosítás csak javítási kérelemmel lehetséges.'
                : 'Ha minden tétel stimmel, egy kattintással véglegesítheted és beküldheted a számadást az egyházmegyének.'}
            </p>
            {!settings.accounting_finalized ? (
              <Button
                size="sm"
                className="rounded-xl bg-violet-600 hover:bg-violet-700 gap-1.5"
                onClick={() => setFinalizeWizardOpen(true)}
              >
                <Send className="size-4" />
                Véglegesítés és beküldés
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={async () => {
                  const reason = window.prompt(
                    'Javítási kérelem — Számadás\n\n' +
                    'Kérjük, fogalmazza meg röviden, miért szükséges a javítás. ' +
                    'Az egyházmegye bírálja el a kérelmet, és az indoklást a csengőben látja.',
                    '',
                  )
                  if (reason === null) return
                  const trimmed = reason.trim()
                  if (!trimmed) {
                    toast.error('Kérjük, adja meg a javítás okát.')
                    return
                  }
                  const result = await requestAccountingUnlock(currentYear, trimmed)
                  if (result.error) {
                    toast.error(result.error)
                    return
                  }
                  toast.success('Javítási kérelem elküldve az egyházmegyének!')
                  router.refresh()
                }}
                disabled={!!settings.accounting_unlock_requested}
              >
                {settings.accounting_unlock_requested ? 'Javítási kérelem elbírálás alatt…' : 'Javítási kérelem'}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <KpiCard label="Tervezett egyenleg" value={budgetedBalance} tone={budgetedBalance >= 0 ? 'sky' : 'rose'} />
          <KpiCard label="Tényleges egyenleg" value={actualBalance} tone={actualBalance >= 0 ? 'emerald' : 'rose'} />
          <KpiCard label="Eltérés" value={actualBalance - budgetedBalance} tone={actualBalance - budgetedBalance >= 0 ? 'amber' : 'rose'} />
        </div>
      </div>

      {/* Bevételek és Kiadások — egymás mellett desktopon, egymás alatt mobilon */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ComparisonTable
          title="Bevételek - terv és tény"
          icon={<TrendingUp className="size-4 text-emerald-600" />}
          headerClassName="bg-emerald-50 border-emerald-100"
          cells={incomeCells}
          budgetData={budgetData}
          actualData={actualIncome}
          positiveClassName="text-emerald-600"
        />

        <ComparisonTable
          title="Kiadások - terv és tény"
          icon={<TrendingDown className="size-4 text-rose-500" />}
          headerClassName="bg-rose-50 border-rose-100"
          cells={expenseCells}
          budgetData={budgetData}
          actualData={actualExpense}
          positiveClassName="text-rose-500"
        />
      </div>

      {/* Éves egyenleg — egyszerű záró összegzés (a véglegesítés gomb fent, az Élő számadási kép dobozban) */}
      <div className="card-raised p-6 text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <Scale className="size-5 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Éves egyenleg</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BalanceSummary label="Tervezett" value={budgetedBalance} tone={budgetedBalance >= 0 ? 'sky' : 'rose'} />
          <BalanceSummary label="Tényleges" value={actualBalance} tone={actualBalance >= 0 ? 'emerald' : 'rose'} />
        </div>
      </div>

      {/* Véglegesítő wizard — 5 lépéses vezetett folyamat a számadás véglegesítéséhez */}
      <AccountingFinalizeWizard
        open={finalizeWizardOpen}
        onOpenChange={setFinalizeWizardOpen}
        year={currentYear}
        scope={scope}
        summary={{
          totalBudgetIncome,
          totalActualIncome,
          totalBudgetExpense,
          totalActualExpense,
          budgetedBalance,
          actualBalance,
          actualIncome,
          actualExpense,
        }}
        onFinalized={async () => {
          router.refresh()
        }}
      />
    </div>
  )
}

function ProgressCard({
  label,
  percent,
  actual,
  budget,
  tone,
}: {
  label: string
  percent: number
  actual: number
  budget: number
  tone: 'emerald' | 'rose'
}) {
  const barClassName = tone === 'emerald' ? 'bg-emerald-500' : 'bg-rose-500'
  const boxClassName = tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'

  return (
    <div className={`rounded-[1.4rem] px-4 py-4 ${boxClassName}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <span className="rounded-full bg-white/75 px-3 py-1 text-sm font-semibold">{percent}%</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/70">
        <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className="mt-3 text-xs opacity-80">
        Tény: {formatCurrency(actual)} RON · Terv: {formatCurrency(budget)} RON
      </p>
    </div>
  )
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: 'sky' | 'emerald' | 'amber' | 'rose' }) {
  const toneClassName = {
    sky: 'bg-sky-50 text-sky-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  }[tone]

  return (
    <div className={`rounded-[1.35rem] px-4 py-4 ${toneClassName}`}>
      <p className="text-[11px] uppercase tracking-[0.22em] opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{formatCurrency(value)} RON</p>
    </div>
  )
}

function BalanceSummary({ label, value, tone }: { label: string; value: number; tone: 'sky' | 'emerald' | 'rose' }) {
  const toneClassName = {
    sky: 'text-sky-600',
    emerald: 'text-emerald-600',
    rose: 'text-rose-500',
  }[tone]

  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-xl font-bold ${toneClassName}`}>{formatCurrency(value)} RON</p>
    </div>
  )
}

function ComparisonTable({
  title,
  icon,
  headerClassName,
  cells,
  budgetData,
  actualData,
  positiveClassName,
}: {
  title: string
  icon: React.ReactNode
  headerClassName: string
  cells: SzamadasiCel[]
  budgetData: Record<string, number>
  actualData: Record<string, number>
  positiveClassName: string
}) {
  return (
    <div className="card-raised overflow-hidden">
      <div className={`flex items-center gap-2 border-b px-4 py-3 ${headerClassName}`}>
        {icon}
        <span className="text-sm font-semibold text-slate-700">{title}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80">
            <tr>
              <th className="p-2 text-left text-xs font-medium text-slate-500">Kód</th>
              <th className="p-2 text-left text-xs font-medium text-slate-500">Megnevezés</th>
              <th className="p-2 text-right text-xs font-medium text-slate-500">Terv</th>
              <th className="p-2 text-right text-xs font-medium text-slate-500">Tény</th>
              <th className="p-2 text-right text-xs font-medium text-slate-500">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cells.map((cell) => {
              const isGroup = cell.id.split('.').length === 1
              // Csoportos sorok: összegezzük az al-sorok értékeit
              const budget = isGroup
                ? cells.filter(c => c.id.startsWith(cell.id + '.') && c.id.split('.').length === 2).reduce((s, c) => s + (budgetData[c.id] || 0), 0)
                : budgetData[cell.id] || 0
              const actual = isGroup
                ? cells.filter(c => c.id.startsWith(cell.id + '.') && c.id.split('.').length === 2).reduce((s, c) => s + (actualData[c.id] || 0), 0)
                : actualData[cell.id] || 0
              if (budget === 0 && actual === 0) return null

              const percent = budget > 0 ? Math.round((actual / budget) * 100) : 0

              return (
                <tr key={cell.id} className={isGroup ? 'bg-slate-50/50 font-semibold' : 'hover:bg-slate-50/60'}>
                  <td className="p-2 text-xs text-slate-400">{cell.id}</td>
                  <td className={`p-2 ${isGroup ? 'text-slate-700' : 'pl-6 text-xs text-slate-600'}`}>{cell.nev}</td>
                  <td className="p-2 text-right text-slate-500">{budget > 0 ? formatCurrency(budget) : '-'}</td>
                  <td className={`p-2 text-right font-semibold ${positiveClassName}`}>{actual > 0 ? formatCurrency(actual) : '-'}</td>
                  <td className="p-2 text-right">
                    <Badge className={`border-0 ${percent > 100 ? 'bg-rose-100 text-rose-600' : percent > 80 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {percent}%
                    </Badge>
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
