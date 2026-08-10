'use client'

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { BarChart3, PieChart as PieChartIcon, Users } from 'lucide-react'

// 2026-08-11 (5. kör, P2-#21): a prop-típusok EXPORTÁLTAK, hogy a lazy wrapper
// (chart-panels-lazy.tsx) csak típusként hivatkozhasson rájuk — a típus-import
// fordításkor eltűnik, így a recharts-köteg NEM kerül be a kezdeti bundle-be.
export interface MonthlyRow {
  month: string
  income: number
  expense: number
}

export interface FinanceOverviewChartProps {
  monthlyData: MonthlyRow[]
}

export interface DetailedAgeRow {
  range: string
  male: number
  female: number
  total: number
}

export interface AgeStats {
  youngest: number
  oldest: number
  average: number
  median: number
  count: number
}

export interface AgeDistributionCardProps {
  ageGroups: Record<string, number>
  detailedAgeGroups?: DetailedAgeRow[]
  stats?: AgeStats
}

const AGE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']

function formatRON(value: number): string {
  return value.toLocaleString('hu') + ' RON'
}

export function FinanceOverviewChart({ monthlyData }: FinanceOverviewChartProps) {
  const hasData = monthlyData.some((row) => row.income > 0 || row.expense > 0)

  return (
    <div className="card-raised h-full p-5">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="icon-raised h-9 w-9 bg-gradient-to-br from-emerald-500 to-emerald-600">
            <BarChart3 className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Pénzügyi áttekintés</h3>
            <p className="text-[11px] text-slate-400">Utolsó 8 hónap</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500 shadow-sm" /> Bevétel</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-400 shadow-sm" /> Kiadás</span>
        </div>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthlyData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d9ebe7" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(value) => value.toLocaleString('hu')} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value) => formatRON(Number(value))} contentStyle={{ borderRadius: 14, border: '1px solid #d9ebe7', boxShadow: '0 16px 40px rgba(12,65,59,.12)' }} />
            <Bar dataKey="income" name="Bevétel" fill="#10b981" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expense" name="Kiadás" fill="#ef4444" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">Nincs pénzügyi adat.</div>
      )}
    </div>
  )
}

/**
 * Kor-eloszlás kártya — 2026-04-21u részletes nézet, 2026-08-10 kompakt redesign.
 *
 * Két nézet toggle-gombokkal:
 *   1. "Áttekintés" (default): fánk-diagram az 5 nagy korcsoportról (közepén a
 *      taglétszámmal) + arány-sávos legenda
 *   2. "Részletes": 10-éves korpiramis (férfi balra, nő jobbra vízszintes bar)
 *
 * Alatta mindkét módban: statisztika-sáv (átlag, medián, legfiatalabb, legidősebb).
 *
 * 2026-08-10: a kártya a három-csempés sor (`.kt-dash-trio`) tagja — teljes
 * magasságú (`h-full`), NINCS benne belső görgetés, és a tartalom (fánk /
 * legenda / statisztika-sáv) kitölti a rendelkezésre álló magasságot.
 */
export function AgeDistributionCard({ ageGroups, detailedAgeGroups, stats }: AgeDistributionCardProps) {
  const [view, setView] = useState<'overview' | 'detailed'>('overview')
  const ageData = Object.entries(ageGroups).map(([name, value]) => ({ name, value }))
  const hasData = ageData.some((row) => row.value > 0)
  const totalMembers = ageData.reduce((sum, row) => sum + row.value, 0)

  // Kor-piramis számítások
  const pyramidMaxCount = detailedAgeGroups
    ? Math.max(1, ...detailedAgeGroups.map((r) => Math.max(r.male, r.female)))
    : 1
  // A legenda arány-sávjai a LEGNÉPESEBB csoporthoz mérve (nem a 100%-hoz),
  // így vizuálisan is összehasonlíthatók egymással
  const maxGroup = Math.max(1, ...ageData.map((r) => r.value))

  return (
    <div className="card-raised flex h-full flex-col overflow-hidden p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="icon-raised size-9 shrink-0 bg-gradient-to-br from-violet-500 to-purple-600">
            <PieChartIcon className="size-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
              {totalMembers} aktív tag
            </p>
            <h3 className="truncate text-[15px] font-semibold leading-tight text-foreground">Koreloszlás</h3>
          </div>
        </div>
        {/* Nézet-kapcsoló */}
        {detailedAgeGroups && detailedAgeGroups.length > 0 && (
          <div className="flex shrink-0 rounded-lg border border-border bg-muted p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setView('overview')}
              className={`rounded-md px-2 py-1 transition ${
                view === 'overview'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Áttekintés
            </button>
            <button
              type="button"
              onClick={() => setView('detailed')}
              className={`rounded-md px-2 py-1 transition ${
                view === 'detailed'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Részletes
            </button>
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Nincs adat.</div>
      ) : view === 'overview' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Fánk — közepén a taglétszám. Mobilon FIX magasság (különben a
              ResponsiveContainer 0-ra omlana), xl-en viszont felveszi a
              maradék helyet, hogy a kártya szépen kitöltse a sormagasságot. */}
          <div className="relative h-[148px] sm:h-[160px] xl:h-auto xl:min-h-[150px] xl:flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ageData} cx="50%" cy="50%" innerRadius="62%" outerRadius="92%" paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {ageData.map((_, index) => <Cell key={index} fill={AGE_COLORS[index % AGE_COLORS.length]} />)}
                </Pie>
                <Tooltip
                  formatter={(value) => `${value} fő`}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--foreground)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums leading-none text-foreground">{totalMembers}</span>
              <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">fő</span>
            </div>
          </div>
          {/* Legenda arány-sávokkal */}
          <div className="mt-3 flex shrink-0 flex-col gap-2">
            {ageData.map((row, index) => {
              const pct = totalMembers > 0 ? Math.round((row.value / totalMembers) * 100) : 0
              return (
                <div key={row.name} className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: AGE_COLORS[index % AGE_COLORS.length] }}
                  />
                  <span className="w-12 shrink-0 text-[12px] tabular-nums text-muted-foreground">{row.name}</span>
                  <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                      style={{
                        width: `${(row.value / maxGroup) * 100}%`,
                        backgroundColor: AGE_COLORS[index % AGE_COLORS.length],
                      }}
                    />
                  </span>
                  <span className="w-7 shrink-0 text-right text-[12px] font-semibold tabular-nums text-foreground">
                    {row.value}
                  </span>
                  <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* ─── Részletes: 10-éves korpiramis (férfi balra, nő jobbra) ─── */
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-1">
          <div className="grid grid-cols-[1fr_3.25rem_1fr] items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="text-right">♂ Férfi</span>
            <span className="text-center">Kor</span>
            <span className="text-left">♀ Nő</span>
          </div>
          {detailedAgeGroups
            ?.slice()
            .reverse() // legidősebb felül — demográfiai konvenció
            .map((row) => {
              const malePct = (row.male / pyramidMaxCount) * 100
              const femalePct = (row.female / pyramidMaxCount) * 100
              const isEmpty = row.male === 0 && row.female === 0
              return (
                <div
                  key={row.range}
                  className={`grid grid-cols-[1fr_3.25rem_1fr] items-center gap-2 text-[11px] ${isEmpty ? 'opacity-45' : ''}`}
                >
                  {/* Férfi bar — jobbra igazítva (balról növeszkedik) */}
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="min-w-[1.4rem] text-right tabular-nums text-muted-foreground">
                      {row.male > 0 ? row.male : ''}
                    </span>
                    <div className="relative h-3 min-w-0 flex-1 overflow-hidden rounded bg-muted">
                      <div
                        className="absolute right-0 top-0 h-full rounded bg-gradient-to-l from-sky-400 to-sky-600 transition-all duration-500"
                        style={{ width: `${malePct}%` }}
                      />
                    </div>
                  </div>
                  {/* Középen a korcsoport */}
                  <span className="text-center text-[11px] font-semibold tabular-nums text-foreground">
                    {row.range}
                  </span>
                  {/* Nő bar — balra igazítva (balról növeszkedik) */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative h-3 min-w-0 flex-1 overflow-hidden rounded bg-muted">
                      <div
                        className="absolute left-0 top-0 h-full rounded bg-gradient-to-r from-pink-400 to-pink-600 transition-all duration-500"
                        style={{ width: `${femalePct}%` }}
                      />
                    </div>
                    <span className="min-w-[1.4rem] tabular-nums text-muted-foreground">
                      {row.female > 0 ? row.female : ''}
                    </span>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* Statisztika-sáv — mindkét nézetben alul */}
      {stats && stats.count > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-1 border-t border-border pt-2.5">
          <StatMini label="Átlag" value={`${stats.average}`} unit="év" color="text-violet-700 dark:text-violet-300" />
          <StatMini label="Medián" value={`${stats.median}`} unit="év" color="text-indigo-700 dark:text-indigo-300" />
          <StatMini label="Legfiat." value={`${stats.youngest}`} unit="év" color="text-emerald-700 dark:text-emerald-300" />
          <StatMini label="Legidősebb" value={`${stats.oldest}`} unit="év" color="text-amber-700 dark:text-amber-300" />
        </div>
      )}
    </div>
  )
}

/** Mini statisztika-blokk a kor-eloszlás kártya alján */
function StatMini({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <span className="flex items-center gap-0.5 truncate text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Users className="size-2.5 shrink-0" />
        {label}
      </span>
      <span className="mt-0.5 whitespace-nowrap">
        <span className={`text-base font-bold tabular-nums ${color}`}>{value}</span>
        <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span>
      </span>
    </div>
  )
}
