'use client'

/**
 * AccountingTab — közös számadás-megjelenítő (Sprint Q Fázis 1, v0.6.2).
 *
 * Élő számadási kép: költségvetés (terv) vs. tényleges (befizetés/kiadás)
 * megvalósulás, kategóriánkénti összehasonlító táblázat, véglegesítés gomb.
 *
 * **Adatfogadás props-on**: a `budgetData`-t a szülő tölti be (web-en
 * Supabase-ből, desktop-on Tauri SQLite-ből). A finalize-wizard `finalizeWizardSlot`
 * prop-on érkezik — a web `AccountingFinalizeWizard`-ot ad át, a desktop pedig
 * majd saját, lokális verziót.
 *
 * **Server-action callback-ek**:
 *   - `onRequestUnlock(reason)`: javítási kérelem küldése (web → server action,
 *     desktop → outbox/online)
 *   - `onRefresh()`: lap újratöltése sikeres művelet után (web: router.refresh,
 *     desktop: notifyLocalDataChanged)
 *   - `onToast(msg, kind)`: feedback (web: sonner, desktop: belső állapot)
 *
 * Eredeti web fájl: `apps/web/components/finance/accounting-tab-v2.tsx` (396 sor).
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Scale, Send, TrendingDown, TrendingUp } from 'lucide-react'

import { Badge, Button } from '@kartoteka/ui'

import { FinanceLoadingState } from './FinanceLoadingState'
import { formatCurrency, sortCellsHierarchically } from './helpers'
import type { BealitasRow, BefitetesRow, KiadasRow, SzamadasiCel } from './types'

export type AccountingScope = 'congregation' | 'diocese'
export type ToastKind = 'success' | 'error' | 'info'

export interface AccountingTabProps {
  szamadasiCellek: SzamadasiCel[]
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  settings: BealitasRow
  currentYear: number
  scope?: AccountingScope

  /**
   * A költségvetési tervek térképe (`szamadasicelid -> tervezett összeg`).
   * A szülő tölti be (web: Supabase, desktop: Tauri SQLite).
   * Ha még tölt, `loading` prop-ot is állítson true-ra.
   */
  budgetData: Record<string, number>
  loading?: boolean

  /**
   * 2026-07-10 (#2): NYITÓ egyenlegek (előző évi záró) — display-only blokk a
   * fül tetején, a hivatalos EREK-minta 1–3. sora szerint. OPCIONÁLIS: ha
   * undefined (pl. desktop hívó), a blokk nem jelenik meg. NEM kerül mentésre.
   */
  carryoverCash?: number
  carryoverBank?: number

  /** 2026-07-10 (S2 #9): a betöltő-állapot logója (web: '/kartoteka-icon.png'). */
  loadingLogoSrc?: string

  /**
   * 2026-07-10 (#2): előző évi (currentYear-1) TÉNY kódonként — halvány
   * „Előző évi tény" referencia-oszlop a terv/tény táblákban. OPCIONÁLIS:
   * ha undefined, az oszlop nem jelenik meg (desktop hívók változatlanok).
   */
  prevActualIncome?: Record<string, number>
  prevActualExpense?: Record<string, number>

  /** Javítási kérelem callback. Web: requestAccountingUnlock server action. */
  onRequestUnlock?: (
    year: number,
    reason: string,
  ) => Promise<{ success?: boolean; error?: string | null }>

  /** Sikeres művelet után: lap újratöltése (web: router.refresh, desktop: notifyLocalDataChanged). */
  onRefresh?: () => void

  /** UI-feedback (web: toast.success/error, desktop: belső állapot). */
  onToast?: (message: string, kind: ToastKind) => void

  /**
   * Véglegesítő wizard slot. Itt mountolódik a platform-specifikus modal:
   *   - Web: `<AccountingFinalizeWizard open={...} ... />`
   *   - Desktop: saját, lokális Tauri-data-source-szal működő wizard
   *
   * Az `open` állapotot a wizard maga kezelje (a tab csak `setOpen(true)`-t tud küldeni).
   */
  finalizeWizardSlot?: (params: {
    open: boolean
    onOpenChange: (open: boolean) => void
    summary: AccountingFinalizeSummary
  }) => ReactNode
}

export interface AccountingFinalizeSummary {
  totalBudgetIncome: number
  totalActualIncome: number
  totalBudgetExpense: number
  totalActualExpense: number
  budgetedBalance: number
  actualBalance: number
  actualIncome: Record<string, number>
  actualExpense: Record<string, number>
}

export function AccountingTab({
  szamadasiCellek,
  incomeRecords,
  expenseRecords,
  bevCelMap,
  kiaCelMap,
  settings,
  currentYear,
  budgetData,
  loading = false,
  carryoverCash,
  carryoverBank,
  loadingLogoSrc,
  prevActualIncome,
  prevActualExpense,
  onRequestUnlock,
  onRefresh,
  onToast,
  finalizeWizardSlot,
}: AccountingTabProps) {
  const [finalizeWizardOpen, setFinalizeWizardOpen] = useState(false)

  // 2026-07-10 (S3 audit KRITIKUS #1): a stornózott (érvénytelenített) tétel a
  // számadás tény-összegeibe SEM számíthat bele — eddig felfújta a totálokat és
  // a beküldött snapshotot is (a wizard summary innen táplálkozik).
  const actualIncome = useMemo(() => {
    const map: Record<string, number> = {}
    incomeRecords.forEach((row) => {
      if (row.stornozott) return
      const code = bevCelMap[row.id_befizetescel || 0]
      if (code) map[code] = (map[code] || 0) + row.osszeg
    })
    return map
  }, [incomeRecords, bevCelMap])

  const actualExpense = useMemo(() => {
    const map: Record<string, number> = {}
    expenseRecords.forEach((row) => {
      if (row.stornozott) return
      const code = kiaCelMap[row.id_kiadascel || 0]
      if (code) map[code] = (map[code] || 0) + row.osszeg
    })
    return map
  }, [expenseRecords, kiaCelMap])

  const isGyulekezetSzint = (cell: SzamadasiCel) =>
    !cell.szint || cell.szint === 'gyulekezet'

  // 2026-07-10 (#3/A): KOMBINÁLT szűrő — type ÉS kód-tartomány (a nyomtatvány
  // budget-reporting.ts collectBudgetRows mintája). A 100-as fejezet (Pénztármaradvány /
  // legacy belső mozgás: 100.01/100.02/100.51/100.52) TELJESEN kizárva — a hivatalos
  // EREK-formában a bevétel a 101-nél kezdődik, a belső mozgás sosem tétel.
  const incomeCells = useMemo(
    () =>
      szamadasiCellek
        .filter(
          (cell) =>
            cell.type === 'B' &&
            cell.id.startsWith('1') &&
            !cell.id.startsWith('100') &&
            isGyulekezetSzint(cell),
        )
        .sort((left, right) => sortCellsHierarchically(left.id, right.id)),
    [szamadasiCellek],
  )

  const expenseCells = useMemo(
    () =>
      szamadasiCellek
        .filter((cell) => cell.type === 'K' && cell.id.startsWith('2') && isGyulekezetSzint(cell))
        .sort((left, right) => sortCellsHierarchically(left.id, right.id)),
    [szamadasiCellek],
  )

  const leafIncome = incomeCells.filter((c) => c.id.includes('.'))
  const leafExpense = expenseCells.filter((c) => c.id.includes('.'))
  const totalBudgetIncome = leafIncome.reduce(
    (sum, cell) => sum + (budgetData[cell.id] || 0),
    0,
  )
  const totalBudgetExpense = leafExpense.reduce(
    (sum, cell) => sum + (budgetData[cell.id] || 0),
    0,
  )
  const totalActualIncome = leafIncome.reduce(
    (sum, cell) => sum + (actualIncome[cell.id] || 0),
    0,
  )
  const totalActualExpense = leafExpense.reduce(
    (sum, cell) => sum + (actualExpense[cell.id] || 0),
    0,
  )

  const incomeRealization =
    totalBudgetIncome > 0 ? Math.round((totalActualIncome / totalBudgetIncome) * 100) : 0
  const expenseRealization =
    totalBudgetExpense > 0 ? Math.round((totalActualExpense / totalBudgetExpense) * 100) : 0
  const budgetedBalance = totalBudgetIncome - totalBudgetExpense
  const actualBalance = totalActualIncome - totalActualExpense

  if (loading) {
    // 2026-07-10 (S2 #9): állapotsávos, logós betöltő.
    return <FinanceLoadingState label="Számadás betöltése…" logoSrc={loadingLogoSrc} />
  }

  async function handleRequestUnlock() {
    if (!onRequestUnlock) return
    if (typeof window === 'undefined') return
    const reason = window.prompt(
      'Javítási kérelem — Számadás\n\n' +
        'Kérjük, fogalmazza meg röviden, miért szükséges a javítás. ' +
        'Az egyházmegye bírálja el a kérelmet, és az indoklást a csengőben látja.',
      '',
    )
    if (reason === null) return
    const trimmed = reason.trim()
    if (!trimmed) {
      onToast?.('Kérjük, adja meg a javítás okát.', 'error')
      return
    }
    const result = await onRequestUnlock(currentYear, trimmed)
    if (result.error) {
      onToast?.(result.error, 'error')
      return
    }
    onToast?.('Javítási kérelem elküldve az egyházmegyének!', 'success')
    onRefresh?.()
  }

  const summary: AccountingFinalizeSummary = {
    totalBudgetIncome,
    totalActualIncome,
    totalBudgetExpense,
    totalActualExpense,
    budgetedBalance,
    actualBalance,
    actualIncome,
    actualExpense,
  }

  return (
    <div className="space-y-4">
      {/* 2026-07-10 (S2 #10): a NYITÓ egyenlegek a hivatalos minta szerint a
          Bevételek tábla 1–3. sorai (lásd lent, openingRows) — a külön kártya megszűnt. */}
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="card-raised p-5">
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-cyan-600" />
            <p className="text-base font-semibold text-slate-800">Élő számadási kép</p>
            {settings.accounting_finalized && (
              <Badge className="border-0 bg-emerald-100 text-emerald-700 ml-auto">
                Véglegesítve
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            A rendszer itt már azt mutatja, hogy a költségvetési tervhez képest a tényleges
            számadás hány százalékban valósult meg.
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

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500 max-w-md">
              {settings.accounting_finalized
                ? 'A számadás véglegesítve és beküldve az egyházmegyének. Módosítás csak javítási kérelemmel lehetséges.'
                : 'Ha minden tétel stimmel, egy kattintással véglegesítheted és beküldheted a számadást az egyházmegyének.'}
            </p>
            {/* 2026-07-10 (S4-mobil): max-sm:min-h-10 — 40px-es érintőfelület telefonon. */}
            {!settings.accounting_finalized ? (
              <Button
                size="sm"
                className="rounded-xl max-sm:min-h-10 bg-violet-600 hover:bg-violet-700 gap-1.5"
                onClick={() => setFinalizeWizardOpen(true)}
              >
                <Send className="size-4" />
                Véglegesítés és beküldés
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl max-sm:min-h-10 border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={handleRequestUnlock}
                disabled={!!settings.accounting_unlock_requested}
              >
                {settings.accounting_unlock_requested
                  ? 'Javítási kérelem elbírálás alatt…'
                  : 'Javítási kérelem'}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <KpiCard
            label="Tervezett egyenleg"
            value={budgetedBalance}
            tone={budgetedBalance >= 0 ? 'sky' : 'rose'}
          />
          <KpiCard
            label="Tényleges egyenleg"
            value={actualBalance}
            tone={actualBalance >= 0 ? 'emerald' : 'rose'}
          />
          <KpiCard
            label="Eltérés"
            value={actualBalance - budgetedBalance}
            tone={actualBalance - budgetedBalance >= 0 ? 'amber' : 'rose'}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ComparisonTable
          title="Bevételek - terv és tény"
          icon={<TrendingUp className="size-4 text-emerald-600" />}
          headerClassName="bg-emerald-50 border-emerald-100"
          cells={incomeCells}
          budgetData={budgetData}
          actualData={actualIncome}
          prevActualData={prevActualIncome}
          positiveClassName="text-emerald-600"
          openingRows={
            carryoverCash != null && carryoverBank != null
              ? [
                  {
                    nr: '1',
                    nev: 'Múlt évi pénztármaradvány (Disponibil din anul precedent)',
                    value: carryoverCash + carryoverBank,
                    group: true,
                  },
                  { nr: '2', nev: 'Készpénz egyenleg (Casa)', value: carryoverCash, group: false },
                  { nr: '3', nev: 'Banki egyenleg (Banca)', value: carryoverBank, group: false },
                ]
              : undefined
          }
        />
        <ComparisonTable
          title="Kiadások - terv és tény"
          icon={<TrendingDown className="size-4 text-rose-500" />}
          headerClassName="bg-rose-50 border-rose-100"
          cells={expenseCells}
          budgetData={budgetData}
          actualData={actualExpense}
          prevActualData={prevActualExpense}
          positiveClassName="text-rose-500"
        />
      </div>

      <div className="card-raised p-6 text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <Scale className="size-5 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Éves egyenleg</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BalanceSummary
            label="Tervezett"
            value={budgetedBalance}
            tone={budgetedBalance >= 0 ? 'sky' : 'rose'}
          />
          <BalanceSummary
            label="Tényleges"
            value={actualBalance}
            tone={actualBalance >= 0 ? 'emerald' : 'rose'}
          />
        </div>
      </div>

      {/* Véglegesítő wizard — platform-specifikus, slot-prop-on érkezik */}
      {finalizeWizardSlot?.({
        open: finalizeWizardOpen,
        onOpenChange: setFinalizeWizardOpen,
        summary,
      })}
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
  const boxClassName =
    tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'

  return (
    <div className={`rounded-[1.4rem] px-4 py-4 ${boxClassName}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <span className="rounded-full bg-white/75 px-3 py-1 text-sm font-semibold">
          {percent}%
        </span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/70">
        <div
          className={`h-full rounded-full ${barClassName}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="mt-3 text-xs opacity-80">
        Tény: {formatCurrency(actual)} RON · Terv: {formatCurrency(budget)} RON
      </p>
    </div>
  )
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'sky' | 'emerald' | 'amber' | 'rose'
}) {
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

function BalanceSummary({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'sky' | 'emerald' | 'rose'
}) {
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
  prevActualData,
  positiveClassName,
  openingRows,
}: {
  title: string
  icon: ReactNode
  headerClassName: string
  cells: SzamadasiCel[]
  budgetData: Record<string, number>
  actualData: Record<string, number>
  /** 2026-07-10 (#2): előző évi tény kódonként — halvány referencia-oszlop, ha van. */
  prevActualData?: Record<string, number>
  positiveClassName: string
  /** 2026-07-10 (S2 #10): a hivatalos nyomtatvány 1–3. NYITÓ sora a tábla élén
   *  (Disponibil / Casa / Banca) — automatikus, nem szerkeszthető. */
  openingRows?: Array<{ nr: string; nev: string; value: number; group: boolean }>
}) {
  const showPrevYear = prevActualData != null
  return (
    <div className="card-raised overflow-hidden">
      <div className={`flex items-center gap-2 border-b px-4 py-3 ${headerClassName}`}>
        {icon}
        <span className="text-sm font-semibold text-slate-700">{title}</span>
      </div>
      {/* 2026-07-10 (S4-mobil): min-w + tabular-nums — telefonon vízszintesen
          görgethető tábla; az „Előző évi tény" referencia-oszlop md alatt rejtve. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm tabular-nums">
          <thead className="border-b border-slate-100 bg-slate-50/80">
            <tr>
              <th className="p-2 text-left text-xs font-medium text-slate-500">Kód</th>
              <th className="p-2 text-left text-xs font-medium text-slate-500">Megnevezés</th>
              {showPrevYear && (
                <th className="hidden md:table-cell p-2 text-right text-xs font-medium text-slate-400">
                  Előző évi tény
                </th>
              )}
              <th className="p-2 text-right text-xs font-medium text-slate-500">Terv</th>
              <th className="p-2 text-right text-xs font-medium text-slate-500">Tény</th>
              <th className="p-2 text-right text-xs font-medium text-slate-500">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* 2026-07-10 (S2 #10): hivatalos NYITÓ sorok (1–3.) a tábla élén — a
                nyomtatványon a Prevederi ÉS az Executie is a nyitó értéket hordozza. */}
            {openingRows?.map((row) => (
              <tr
                key={`opening-${row.nr}`}
                className={row.group ? 'bg-sky-50/60 font-semibold' : 'bg-sky-50/30'}
                title="Automatikus nyitó egyenleg — az előző évi záróból, nem szerkeszthető"
              >
                <td className="p-2 text-xs text-slate-400">{row.nr}</td>
                <td
                  className={`p-2 ${
                    row.group ? 'text-slate-700' : 'pl-6 text-xs text-slate-600'
                  }`}
                >
                  {row.nev}
                </td>
                {showPrevYear && (
                  <td className="hidden md:table-cell p-2 text-right text-xs text-slate-300">–</td>
                )}
                <td className="p-2 text-right text-slate-600">{formatCurrency(row.value)}</td>
                <td className="p-2 text-right text-slate-600">{formatCurrency(row.value)}</td>
                <td className="p-2 text-right text-xs text-slate-300">–</td>
              </tr>
            ))}
            {cells.map((cell) => {
              const isGroup = cell.id.split('.').length === 1
              const budget = isGroup
                ? cells
                    .filter(
                      (c) => c.id.startsWith(cell.id + '.') && c.id.split('.').length === 2,
                    )
                    .reduce((s, c) => s + (budgetData[c.id] || 0), 0)
                : budgetData[cell.id] || 0
              const actual = isGroup
                ? cells
                    .filter(
                      (c) => c.id.startsWith(cell.id + '.') && c.id.split('.').length === 2,
                    )
                    .reduce((s, c) => s + (actualData[c.id] || 0), 0)
                : actualData[cell.id] || 0
              // 2026-07-10 (#2): előző évi tény — csoportnál a levelek összege
              // (a fenti budget/actual aggregáló minta szerint).
              const prevActual = !showPrevYear
                ? 0
                : isGroup
                  ? cells
                      .filter(
                        (c) => c.id.startsWith(cell.id + '.') && c.id.split('.').length === 2,
                      )
                      .reduce((s, c) => s + (prevActualData?.[c.id] || 0), 0)
                  : prevActualData?.[cell.id] || 0
              // Minden tételt mutatunk (a költségvetéshez hasonlóan) — a
              // csoport- és a végpont-sorokat is, akkor is, ha nincs terv/tény.

              const percent = budget > 0 ? Math.round((actual / budget) * 100) : 0

              return (
                <tr
                  key={cell.id}
                  className={isGroup ? 'bg-slate-50/50 font-semibold' : 'hover:bg-slate-50/60'}
                >
                  <td className="p-2 text-xs text-slate-400">{cell.id}</td>
                  <td
                    className={`p-2 ${
                      isGroup ? 'text-slate-700' : 'pl-6 text-xs text-slate-600'
                    }`}
                  >
                    {cell.nev}
                  </td>
                  {showPrevYear && (
                    <td className="hidden md:table-cell p-2 text-right text-xs text-slate-400">
                      {prevActual !== 0 ? formatCurrency(prevActual) : '-'}
                    </td>
                  )}
                  <td className="p-2 text-right text-slate-500">
                    {budget > 0 ? formatCurrency(budget) : '-'}
                  </td>
                  <td className={`p-2 text-right font-semibold ${positiveClassName}`}>
                    {actual > 0 ? formatCurrency(actual) : '-'}
                  </td>
                  <td className="p-2 text-right">
                    <Badge
                      className={`border-0 ${
                        percent > 100
                          ? 'bg-rose-100 text-rose-600'
                          : percent > 80
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
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
