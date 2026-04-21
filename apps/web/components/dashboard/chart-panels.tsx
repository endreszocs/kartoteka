'use client'

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { BarChart3, PieChart as PieChartIcon, Users } from 'lucide-react'

interface MonthlyRow {
  month: string
  income: number
  expense: number
}

interface FinanceOverviewChartProps {
  monthlyData: MonthlyRow[]
}

interface DetailedAgeRow {
  range: string
  male: number
  female: number
  total: number
}

interface AgeStats {
  youngest: number
  oldest: number
  average: number
  median: number
  count: number
}

interface AgeDistributionCardProps {
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
 * Kor-eloszlás kártya — 2026-04-21u részletes redesign.
 *
 * Két nézet toggle-gombokkal:
 *   1. "Áttekintés" (default): pie chart az 5 nagy korcsoportról + legenda
 *   2. "Részletes": 10-éves korpiramis (férfi balra, nő jobbra vízszintes bar)
 *
 * Alatta mindkét módban: statisztika-sáv (átlag, medián, legfiatalabb, legidősebb).
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

  return (
    <div className="card-raised flex h-full flex-col p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="icon-raised h-9 w-9 bg-gradient-to-br from-violet-500 to-purple-600">
            <PieChartIcon className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Koreloszlás</h3>
            <p className="text-[11px] text-slate-400">{totalMembers} aktív tag</p>
          </div>
        </div>
        {/* Nézet-kapcsoló */}
        {detailedAgeGroups && detailedAgeGroups.length > 0 && (
          <div className="flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-medium shadow-sm">
            <button
              type="button"
              onClick={() => setView('overview')}
              className={`rounded-md px-2 py-1 transition ${
                view === 'overview' ? 'bg-violet-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Áttekintés
            </button>
            <button
              type="button"
              onClick={() => setView('detailed')}
              className={`rounded-md px-2 py-1 transition ${
                view === 'detailed' ? 'bg-violet-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Részletes
            </button>
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">Nincs adat.</div>
      ) : view === 'overview' ? (
        <>
          <div className="flex justify-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={ageData} cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {ageData.map((_, index) => <Cell key={index} fill={AGE_COLORS[index % AGE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => `${value} fő`} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-2.5">
            {ageData.map((row, index) => (
              <div key={row.name} className="flex items-center gap-2.5 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-full shadow-sm" style={{ backgroundColor: AGE_COLORS[index] }} />
                <span className="flex-1 text-slate-600">{row.name}</span>
                <span className="tabular-nums font-semibold text-slate-700">{row.value}</span>
                <span className="w-9 text-right text-[11px] tabular-nums text-slate-400">
                  {totalMembers > 0 ? Math.round((row.value / totalMembers) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* ─── Részletes: 10-éves korpiramis (férfi balra, nő jobbra) ─── */
        <div className="space-y-1">
          <div className="mb-1 grid grid-cols-[1fr_3.5rem_1fr] items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <span className="text-right">♂ Férfi</span>
            <span className="text-center text-slate-400">Kor</span>
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
                  className={`grid grid-cols-[1fr_3.5rem_1fr] items-center gap-2 text-[11px] ${isEmpty ? 'opacity-40' : ''}`}
                >
                  {/* Férfi bar — jobbra igazítva (balról növeszkedik) */}
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="tabular-nums text-slate-500 min-w-[1.5rem] text-right">
                      {row.male > 0 ? row.male : ''}
                    </span>
                    <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-slate-100">
                      <div
                        className="absolute right-0 top-0 h-full rounded bg-gradient-to-l from-sky-400 to-sky-500 shadow-sm transition-all duration-500"
                        style={{ width: `${malePct}%` }}
                      />
                    </div>
                  </div>
                  {/* Középen a korcsoport */}
                  <span className="text-center font-mono font-semibold text-slate-700 tabular-nums">
                    {row.range}
                  </span>
                  {/* Nő bar — balra igazítva (balról növeszkedik) */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-slate-100">
                      <div
                        className="absolute left-0 top-0 h-full rounded bg-gradient-to-r from-pink-400 to-pink-500 shadow-sm transition-all duration-500"
                        style={{ width: `${femalePct}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-slate-500 min-w-[1.5rem]">
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
        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-4">
          <StatMini label="Átlag" value={`${stats.average}`} unit="év" color="text-violet-600" />
          <StatMini label="Medián" value={`${stats.median}`} unit="év" color="text-indigo-600" />
          <StatMini label="Legfiatalabb" value={`${stats.youngest}`} unit="év" color="text-emerald-600" />
          <StatMini label="Legidősebb" value={`${stats.oldest}`} unit="év" color="text-amber-600" />
        </div>
      )}
    </div>
  )
}

/** Mini statisztika-blokk a kor-eloszlás kártya alján */
function StatMini({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] font-medium uppercase tracking-wider text-slate-400">
        <Users className="mr-1 inline size-2.5" />
        {label}
      </span>
      <span className="mt-0.5">
        <span className={`text-lg font-bold tabular-nums ${color}`}>{value}</span>
        <span className="ml-0.5 text-[10px] text-slate-400">{unit}</span>
      </span>
    </div>
  )
}
