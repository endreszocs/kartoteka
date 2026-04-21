'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { BarChart3, PieChart as PieChartIcon } from 'lucide-react'

interface MonthlyRow { month: string; income: number; expense: number }

interface ChartsProps {
  monthlyData: MonthlyRow[]
  ageGroups: Record<string, number>
}

const AGE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']

function formatRON(v: number): string {
  return v.toLocaleString('hu') + ' RON'
}

export function Charts({ monthlyData, ageGroups }: ChartsProps) {
  const ageData = Object.entries(ageGroups).map(([name, value]) => ({ name, value }))
  const hasAgeData = ageData.some(d => d.value > 0)
  const hasFinData = monthlyData.some(d => d.income > 0 || d.expense > 0)
  const totalMembers = ageData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Pénzügyi diagram — 2/3 */}
      <div className="card-raised p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="icon-raised w-9 h-9 bg-gradient-to-br from-emerald-500 to-emerald-600">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Pénzügyi áttekintés</h3>
              <p className="text-[11px] text-slate-400">Utolsó 8 hónap</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shadow-sm" /> Bevétel</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 shadow-sm" /> Kiadás</span>
          </div>
        </div>
        {hasFinData ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9ebe7" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => v.toLocaleString('hu')} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => formatRON(Number(value))} contentStyle={{ borderRadius: 14, border: '1px solid #d9ebe7', boxShadow: '0 16px 40px rgba(12,65,59,.12)' }} />
              <Bar dataKey="income" name="Bevétel" fill="#10b981" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expense" name="Kiadás" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">Nincs pénzügyi adat.</div>
        )}
      </div>

      {/* Koreloszlás — 1/3 */}
      <div className="card-raised p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="icon-raised w-9 h-9 bg-gradient-to-br from-violet-500 to-purple-600">
            <PieChartIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Koreloszlás</h3>
            <p className="text-[11px] text-slate-400">{totalMembers} aktív tag</p>
          </div>
        </div>
        {hasAgeData ? (
          <>
            <div className="flex justify-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={ageData} cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {ageData.map((_, i) => <Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => `${value} fő`} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2.5 mt-3">
              {ageData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2.5 text-sm">
                  <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: AGE_COLORS[i] }} />
                  <span className="flex-1 text-slate-600">{d.name}</span>
                  <span className="font-semibold text-slate-700 tabular-nums">{d.value}</span>
                  <span className="text-[11px] text-slate-400 w-9 text-right tabular-nums">
                    {totalMembers > 0 ? Math.round((d.value / totalMembers) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">Nincs adat.</div>
        )}
      </div>
    </div>
  )
}
