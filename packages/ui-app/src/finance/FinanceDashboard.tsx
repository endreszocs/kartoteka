'use client'

/**
 * FinanceDashboard — közös pénzügyi áttekintés komponens (Sprint Q Fázis 1).
 *
 * 4 KPI-kártya (kassza/bank/bevétel/kiadás), egyenleg-banner és legutóbbi
 * 10 mozgás listája. Korábban csak a webben élt; most átkerült a
 * `@kartoteka/ui-app` shared package-be, hogy a desktop is használhassa.
 *
 * **Adatfogadás props-on**: nincs server-action import, nincs hooks adatlekérés.
 * A szülő komponens (web `FinanceTabs` vagy desktop `PenzugyDashboardPage`)
 * kalkulálja az `balances`-t és átadja az `incomeRecords` / `expenseRecords` -et.
 *
 * **TVA-plafon widget**: opcionális `tvaPlafonSlot` prop — a web itt mountolja
 * a saját `TvaPlafonWidget`-jét; a desktop pedig majd saját, lokális számítást
 * használó verziót, vagy hagyja üresen.
 *
 * 2026-07-10 (S3 #5): grafikonos áttekintés — 3 tiszta-SVG ábra (nincs chart-lib
 * függőség): (a) havi bevétel vs kiadás oszlopdiagram, (b) kassza+bank egyenleg
 * alakulása terület-diagram (nyitóból kumulálva), (c) top 6 kiadási jogcím
 * vízszintes sávdiagram. A belső mozgás (belso_mozgas_xkey VAGY 3xx/4xx/100-as
 * cél-kód) és a stornózott tételek a bevétel/kiadás ábrákból kimaradnak — az
 * egyenleg-görbében viszont minden tétel számít (calculateBalances-szel egyezően).
 */

import { useMemo, type ReactNode } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import {
  formatCurrency,
  getExpensePartnerName,
  getTransactionDocumentNumber,
  type FinanceBalances,
} from './helpers'
import type { BealitasRow, BefitetesRow, KiadasRow } from './types'

// 2026-07-10 (S3 #5): grafikon-konstansok — a komponens ELŐTT deklarálva
// (a useMemo és a chart-komponensek is használják).
const HONAP_ROVID = [
  'Jan', 'Feb', 'Már', 'Ápr', 'Máj', 'Jún',
  'Júl', 'Aug', 'Szep', 'Okt', 'Nov', 'Dec',
]

const CHART_COLORS = {
  income: '#10b981', // emerald-500
  expense: '#f43f5e', // rose-500
  balanceLine: '#0d9488', // teal-600
  balanceFill: '#14b8a6', // teal-500
  grid: '#f1f5f9', // slate-100
  axis: '#94a3b8', // slate-400
  zero: '#cbd5e1', // slate-300
}

export interface FinanceDashboardProps {
  balances: FinanceBalances
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  settings: BealitasRow
  /** Opcionális slot a TVA-plafon widgetnek (web vagy desktop saját implementációja). */
  tvaPlafonSlot?: ReactNode
  /**
   * 2026-07-10 (S3 #5): opcionális számadási cél lista a top-kiadás ábra
   * emberi neveihez (kod → nev feloldás). Ha nincs átadva, az ábra a
   * számadási kódot mutatja (a `kiaCelMap` értéke maga a kód, pl. "402.02").
   */
  szamadasiCellek?: Array<{ kod?: string | null; nev?: string | null }>
}

export function FinanceDashboard({
  balances,
  incomeRecords,
  expenseRecords,
  bevCelMap,
  kiaCelMap,
  tvaPlafonSlot,
  szamadasiCellek,
}: FinanceDashboardProps) {
  // „Éves egyenleg" = a tényleges ÉV VÉGI EGYENLEG (kassza + bank záró) — ez a rendelkezésre
  // álló pénz, NEM a bevétel−kiadás különbség (az a működési eredmény / esetleges túlköltekezés,
  // amit a Bevétel/Kiadás kártyák már mutatnak). Korábban a deficitet írta ki „egyenleg"-ként.
  const netBalance = balances.cashBalance + balances.bankBalance

  const recent = [
    ...incomeRecords.slice(0, 20).map((r) => ({
      type: 'income' as const,
      id: r.id,
      datum: r.datum,
      osszeg: r.osszeg,
      label: r.forrasa || '—',
      iratszam: getTransactionDocumentNumber(r),
    })),
    ...expenseRecords.slice(0, 20).map((r) => ({
      type: 'expense' as const,
      id: r.id,
      datum: r.datum,
      osszeg: r.osszeg,
      label: getExpensePartnerName(r) || '—',
      iratszam: getTransactionDocumentNumber(r),
    })),
  ]
    .sort((a, b) => (b.datum || '').localeCompare(a.datum || ''))
    .slice(0, 10)

  // 2026-07-10 (S3 #5): grafikon-adatok aggregálása a már betöltött rekordokból.
  const chartData = useMemo(() => {
    const now = new Date()

    // Az ábrázolt év: a rekordok legnagyobb datum-éve (a szülő már évre szűrve
    // adja át a rekordokat); ha nincs rekord, az aktuális év.
    let year = 0
    for (const r of incomeRecords) {
      const y = Number((r.datum || '').slice(0, 4))
      if (y > year) year = y
    }
    for (const r of expenseRecords) {
      const y = Number((r.datum || '').slice(0, 4))
      if (y > year) year = y
    }
    if (!year) year = now.getFullYear()

    // Belső mozgás cél-kód szerint (a bev/kiaCelMap értéke a számadási kód):
    // 3xx/4xx + 100-as fejezet — ugyanaz a szabály, mint a FinanceTabs
    // internalCelIds számításában (xkey nélküli belső sor se torzítson).
    const isInternalKod = (kod: string | undefined) =>
      !!kod && (/^[34]/.test(kod) || kod === '100' || kod.startsWith('100.'))

    const monthIndexOf = (datum: string | null | undefined) => {
      if (!datum || datum.length < 7) return -1
      if (Number(datum.slice(0, 4)) !== year) return -1
      const m = Number(datum.slice(5, 7)) - 1
      return m >= 0 && m <= 11 ? m : -1
    }

    const monthlyIncome = new Array<number>(12).fill(0)
    const monthlyExpense = new Array<number>(12).fill(0)
    // Egyenleg-görbéhez MINDEN tétel számít (belső mozgás + stornó is), mert a
    // calculateBalances is így képezi a kassza/bank egyenleget — így a görbe
    // utolsó pontja pontosan a KPI-kártyák záró egyenlegével egyezik.
    const monthlyFlow = new Array<number>(12).fill(0)
    let totalFlow = 0
    const celTotals = new Map<string, number>()

    for (const r of incomeRecords) {
      const amt = Number(r.osszeg) || 0
      totalFlow += amt
      const m = monthIndexOf(r.datum)
      if (m >= 0) monthlyFlow[m] += amt
      const internal =
        !!r.belso_mozgas_xkey ||
        (r.id_befizetescel != null && isInternalKod(bevCelMap[r.id_befizetescel]))
      if (m >= 0 && !internal && !r.stornozott) monthlyIncome[m] += amt
    }

    for (const r of expenseRecords) {
      const amt = Number(r.osszeg) || 0
      totalFlow -= amt
      const m = monthIndexOf(r.datum)
      if (m >= 0) monthlyFlow[m] -= amt
      const kod = r.id_kiadascel != null ? kiaCelMap[r.id_kiadascel] : undefined
      const internal = !!r.belso_mozgas_xkey || isInternalKod(kod)
      if (!internal && !r.stornozott) {
        if (m >= 0) monthlyExpense[m] += amt
        const key = kod || 'Egyéb'
        celTotals.set(key, (celTotals.get(key) || 0) + amt)
      }
    }

    // Nyitó (carryover) visszaszámítása: a props-ban kapott záró egyenlegből
    // levonjuk az éves nettó mozgást — így nem kell külön carryover prop.
    const closing = balances.cashBalance + balances.bankBalance
    const opening = closing - totalFlow

    // A görbét csak a "megélt" hónapokig rajzoljuk (idén az aktuális hónapig).
    const lastMonth = year === now.getFullYear() ? now.getMonth() : 11
    const balancePoints: Array<{ label: string; value: number }> = [
      { label: 'Nyitó', value: opening },
    ]
    let running = opening
    for (let m = 0; m <= lastMonth; m++) {
      running += monthlyFlow[m]
      balancePoints.push({ label: HONAP_ROVID[m], value: running })
    }

    // kod → nev feloldás az opcionális szamadasiCellek propból.
    const nevByKod = new Map<string, string>()
    for (const c of szamadasiCellek ?? []) {
      if (c.kod && c.nev) nevByKod.set(c.kod, c.nev)
    }
    const topExpenses = [...celTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([kod, value]) => {
        const nev = nevByKod.get(kod)
        return { kod, label: nev ? `${kod} — ${nev}` : kod, value }
      })

    const hasMonthlyData =
      monthlyIncome.some((v) => v > 0) || monthlyExpense.some((v) => v > 0)
    const hasAnyRecord = incomeRecords.length > 0 || expenseRecords.length > 0

    return {
      year,
      monthlyIncome,
      monthlyExpense,
      balancePoints,
      topExpenses,
      hasMonthlyData,
      hasAnyRecord,
    }
  }, [incomeRecords, expenseRecords, bevCelMap, kiaCelMap, balances, szamadasiCellek])

  return (
    <div className="space-y-4">
      {/* KPI kártyák — 2026-07-10 (S4-mobil): 375px-en 1 oszlop (nem törik a nagy
          összeg), sm-től 2, lg-től 4 oszlop. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <FinKpi
          icon={<Wallet className="w-5 h-5" />}
          gradient="from-blue-500 to-indigo-600"
          label="Kassza egyenleg"
          value={formatCurrency(balances.cashBalance)}
          suffix="RON"
        />
        <FinKpi
          icon={<Landmark className="w-5 h-5" />}
          gradient="from-violet-500 to-purple-600"
          label="Bank egyenleg"
          value={formatCurrency(balances.bankBalance)}
          suffix="RON"
        />
        <FinKpi
          icon={<TrendingUp className="w-5 h-5" />}
          gradient="from-emerald-500 to-green-600"
          label="Bevétel (idén)"
          value={formatCurrency(balances.totalIncome)}
          suffix="RON"
          valueColor="text-emerald-600"
        />
        <FinKpi
          icon={<TrendingDown className="w-5 h-5" />}
          gradient="from-red-400 to-red-500"
          label="Kiadás (idén)"
          value={formatCurrency(balances.totalExpense)}
          suffix="RON"
          valueColor="text-red-500"
        />
      </div>

      {/* TVA-plafon figyelő — opcionális slot, web/desktop saját widgetjét mountolja */}
      {tvaPlafonSlot}

      {/* Egyenleg banner — 2026-07-10 (S4-mobil): flex-wrap + tabular-nums,
          375px-en az ikon a szám alá törhet, nem folyik ki. */}
      <div
        className={`card-raised p-5 flex flex-wrap items-center justify-between gap-3 ${
          netBalance >= 0 ? 'bg-emerald-50/50' : 'bg-red-50/50'
        }`}
      >
        <div className="min-w-0">
          <p className="text-sm text-slate-500">Éves egyenleg</p>
          <p
            className={`text-2xl font-bold tabular-nums break-words ${
              netBalance >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {netBalance >= 0 ? '+' : ''}
            {formatCurrency(netBalance)} RON
          </p>
        </div>
        <div
          className={`icon-raised w-12 h-12 ${
            netBalance >= 0
              ? 'bg-gradient-to-br from-emerald-500 to-green-600'
              : 'bg-gradient-to-br from-red-400 to-red-500'
          }`}
        >
          {netBalance >= 0 ? (
            <TrendingUp className="w-6 h-6 text-white" />
          ) : (
            <TrendingDown className="w-6 h-6 text-white" />
          )}
        </div>
      </div>

      {/* 2026-07-10 (S3 #5): Grafikonos áttekintés — havi oszlopdiagram */}
      <div className="card-raised p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-slate-700">
            Havi bevétel és kiadás ({chartData.year})
          </h3>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: CHART_COLORS.income }}
              />
              Bevétel
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: CHART_COLORS.expense }}
              />
              Kiadás
            </span>
          </div>
        </div>
        {chartData.hasMonthlyData ? (
          <MonthlyBarChart
            income={chartData.monthlyIncome}
            expense={chartData.monthlyExpense}
          />
        ) : (
          <ChartEmptyState />
        )}
      </div>

      {/* 2026-07-10 (S3 #5): egyenleg-alakulás + top kiadási jogcímek (mobilon egymás alatt) */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card-raised p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Egyenleg alakulása — kassza + bank ({chartData.year})
          </h3>
          {chartData.hasAnyRecord ? (
            <BalanceAreaChart points={chartData.balancePoints} />
          ) : (
            <ChartEmptyState />
          )}
        </div>
        <div className="card-raised p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Top kiadási jogcímek ({chartData.year})
          </h3>
          {chartData.topExpenses.length > 0 ? (
            <TopExpenseBars items={chartData.topExpenses} />
          ) : (
            <ChartEmptyState />
          )}
        </div>
      </div>

      {/* Utolsó tranzakciók */}
      <div className="card-raised p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Legutóbbi mozgások</h3>
        {recent.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {recent.map((r) => (
              <div
                key={`${r.type}-${r.id}`}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    r.type === 'income' ? 'bg-emerald-50' : 'bg-red-50'
                  }`}
                >
                  {r.type === 'income' ? (
                    <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{r.label}</p>
                  <p className="text-[11px] text-slate-400">
                    {r.datum?.split('T')[0]} {r.iratszam ? `· ${r.iratszam}` : ''}
                  </p>
                </div>
                {/* 2026-07-10 (S4-mobil): shrink-0 + nowrap + tabular-nums — az összeg
                    nem törik meg, a hosszú partnernév truncate-el mellette. */}
                <span
                  className={`text-sm font-bold shrink-0 whitespace-nowrap tabular-nums ${
                    r.type === 'income' ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {r.type === 'income' ? '+' : '-'}
                  {formatCurrency(r.osszeg)} RON
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-4 text-center">
            Még nincs tranzakció ebben az évben.
          </p>
        )}
      </div>
    </div>
  )
}

interface FinKpiProps {
  icon: ReactNode
  gradient: string
  label: string
  value: string
  suffix: string
  valueColor?: string
}

function FinKpi({ icon, gradient, label, value, suffix, valueColor }: FinKpiProps) {
  return (
    <div className="card-raised p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider">
            {label}
          </p>
          <p
            className={`text-lg sm:text-xl font-bold mt-1.5 tabular-nums break-words ${
              valueColor || 'text-slate-800'
            }`}
          >
            {value} <span className="text-xs font-normal text-slate-400">{suffix}</span>
          </p>
        </div>
        <div className={`icon-raised w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br ${gradient}`}>
          <span className="text-white">{icon}</span>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 2026-07-10 (S3 #5): Tiszta-SVG grafikonok — nincs chart-lib függőség.
// A viewBox-os SVG `w-full h-auto`-val reszponzívan skálázódik; a
// tooltip natív <title> elem (hover). Paletta: emerald/teal (bevétel,
// egyenleg), rose (kiadás), slate (rács + tengelyfeliratok).
// ═══════════════════════════════════════════════════════════════════

/** Kerek felső skálahatár (1/2/2,5/5 × 10^k) — hogy a rácsvonalak szépek legyenek. */
function niceCeil(v: number): number {
  if (v <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / exp
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return nice * exp
}

/** Tömör tengelyfelirat: 1 234 567 → „1,2 M"; 12 500 → „12,5 e". */
function formatAxisValue(v: number): string {
  const one = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${one(v / 1_000_000)} M`
  if (abs >= 1000) return `${one(v / 1000)} e`
  return String(Math.round(v))
}

function ChartEmptyState() {
  return (
    <p className="text-sm text-slate-400 py-8 text-center">
      Még nincs adat ebben az évben.
    </p>
  )
}

/** (a) Havi bevétel vs kiadás — csoportosított oszlopdiagram, 12 hónap. */
function MonthlyBarChart({ income, expense }: { income: number[]; expense: number[] }) {
  const W = 720
  const H = 240
  const PL = 48 // bal margó az y-feliratoknak
  const PR = 8
  const PT = 10
  const PB = 24 // alsó margó a hónap-feliratoknak
  const plotW = W - PL - PR
  const plotH = H - PT - PB

  const yMax = niceCeil(Math.max(...income, ...expense, 1))
  const y = (v: number) => PT + plotH * (1 - v / yMax)
  const groupW = plotW / 12
  const barW = Math.min(15, (groupW - 10) / 2)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Havi bevétel és kiadás oszlopdiagram"
    >
      {/* rács + y-tengely feliratok */}
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PL} x2={W - PR} y1={y(t)} y2={y(t)}
            stroke={t === 0 ? CHART_COLORS.zero : CHART_COLORS.grid}
            strokeWidth={1}
          />
          <text
            x={PL - 6} y={y(t) + 3} textAnchor="end"
            className="text-[10px]" fill={CHART_COLORS.axis}
          >
            {formatAxisValue(t)}
          </text>
        </g>
      ))}
      {/* hónap-csoportok: bevétel + kiadás oszlop */}
      {HONAP_ROVID.map((label, m) => {
        const cx = PL + m * groupW + groupW / 2
        const hIn = income[m] > 0 ? Math.max(1.5, PT + plotH - y(income[m])) : 0
        const hEx = expense[m] > 0 ? Math.max(1.5, PT + plotH - y(expense[m])) : 0
        return (
          <g key={label}>
            {hIn > 0 && (
              <rect
                x={cx - barW - 1.5} y={PT + plotH - hIn}
                width={barW} height={hIn} rx={2}
                fill={CHART_COLORS.income}
              >
                <title>{`${label} — bevétel: ${formatCurrency(income[m])} RON`}</title>
              </rect>
            )}
            {hEx > 0 && (
              <rect
                x={cx + 1.5} y={PT + plotH - hEx}
                width={barW} height={hEx} rx={2}
                fill={CHART_COLORS.expense}
              >
                <title>{`${label} — kiadás: ${formatCurrency(expense[m])} RON`}</title>
              </rect>
            )}
            <text
              x={cx} y={H - 8} textAnchor="middle"
              className="text-[10px]" fill={CHART_COLORS.axis}
            >
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** (b) Kassza+bank egyenleg alakulása — terület-diagram (nyitó + hónap végi kumulált értékek). */
function BalanceAreaChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const W = 720
  const H = 260
  const PL = 52
  const PR = 14
  const PT = 12
  const PB = 24
  const plotW = W - PL - PR
  const plotH = H - PT - PB

  const vals = points.map((p) => p.value)
  const rawMax = Math.max(...vals, 0)
  const rawMin = Math.min(...vals, 0)
  const yMax = rawMax > 0 ? niceCeil(rawMax) : 0
  const yMin = rawMin < 0 ? -niceCeil(-rawMin) : 0
  const span = yMax - yMin || 1
  const y = (v: number) => PT + plotH * (1 - (v - yMin) / span)
  const x = (i: number) =>
    PL + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1))

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * span)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Kassza és bank együttes egyenlegének alakulása"
    >
      {/* rács + y-feliratok */}
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PL} x2={W - PR} y1={y(t)} y2={y(t)}
            stroke={CHART_COLORS.grid} strokeWidth={1}
          />
          <text
            x={PL - 6} y={y(t) + 3} textAnchor="end"
            className="text-[10px]" fill={CHART_COLORS.axis}
          >
            {formatAxisValue(t)}
          </text>
        </g>
      ))}
      {/* nulla-vonal, ha negatívba is megy az egyenleg */}
      {yMin < 0 && (
        <line
          x1={PL} x2={W - PR} y1={y(0)} y2={y(0)}
          stroke={CHART_COLORS.zero} strokeWidth={1} strokeDasharray="4 3"
        />
      )}
      <path d={area} fill={CHART_COLORS.balanceFill} opacity={0.12} />
      <path
        d={line} fill="none"
        stroke={CHART_COLORS.balanceLine} strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round"
      />
      {points.map((p, i) => (
        <g key={`${p.label}-${i}`}>
          <circle
            cx={x(i)} cy={y(p.value)} r={3.5}
            fill="#fff" stroke={CHART_COLORS.balanceLine} strokeWidth={1.5}
          >
            <title>{`${p.label}: ${formatCurrency(p.value)} RON`}</title>
          </circle>
          <text
            x={x(i)} y={H - 8} textAnchor="middle"
            className="text-[10px]" fill={CHART_COLORS.axis}
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

/** (c) Top 6 kiadási jogcím — vízszintes sávdiagram (div-alapú, természetesen reszponzív). */
function TopExpenseBars({
  items,
}: {
  items: Array<{ kod: string; label: string; value: number }>
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <div key={it.kod} title={`${it.label}: ${formatCurrency(it.value)} RON`}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-[11px] text-slate-600 truncate">{it.label}</span>
            <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap tabular-nums">
              {formatCurrency(it.value)} RON
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500"
              style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
