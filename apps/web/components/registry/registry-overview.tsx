'use client'

import { useState, useEffect } from 'react'
import { getRegistryStats } from '@/app/(dashboard)/anyakonyv/actions'
import { Droplet, Cross, Heart, BookOpen, ArrowRightLeft, TrendingUp } from 'lucide-react'

type Stats = Awaited<ReturnType<typeof getRegistryStats>>

export function RegistryOverview() {
  const [stats, setStats] = useState<Stats>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRegistryStats().then(s => { setStats(s); setLoading(false) })
  }, [])

  if (loading) return <div className="py-12 text-center text-sm text-slate-400 animate-pulse">Statisztikák betöltése...</div>
  if (!stats) return <div className="py-12 text-center text-sm text-slate-400">Nem sikerült betölteni a statisztikákat.</div>

  const items = [
    { label: 'Keresztelés', total: stats.totals.kereszteles, year: stats.thisYear.kereszteles, icon: Droplet, gradient: 'from-blue-500 to-blue-600', bg: 'bg-blue-50' },
    { label: 'Konfirmáció', total: stats.totals.konfirmacio, year: stats.thisYear.konfirmacio, icon: BookOpen, gradient: 'from-violet-500 to-purple-600', bg: 'bg-violet-50' },
    { label: 'Házasság', total: stats.totals.hazassag, year: stats.thisYear.hazassag, icon: Heart, gradient: 'from-pink-500 to-rose-500', bg: 'bg-pink-50' },
    { label: 'Temetés', total: stats.totals.temetes, year: stats.thisYear.temetes, icon: Cross, gradient: 'from-slate-500 to-slate-600', bg: 'bg-slate-50' },
    { label: 'Beköltözött', total: stats.totals.bekoltozott, year: stats.thisYear.bekoltozott, icon: ArrowRightLeft, gradient: 'from-teal-500 to-cyan-600', bg: 'bg-teal-50' },
    { label: 'Elköltözött', total: stats.totals.elkoltozott, year: stats.thisYear.elkoltozott, icon: ArrowRightLeft, gradient: 'from-orange-500 to-amber-500', bg: 'bg-orange-50' },
  ]

  const totalAll = Object.values(stats.totals).reduce((s, v) => s + v, 0)
  const totalYear = Object.values(stats.thisYear).reduce((s, v) => s + v, 0)

  return (
    <div className="space-y-5">
      {/* Fő KPI-k */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card-raised p-5 flex items-center gap-4">
          <div className="icon-raised w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-3xl font-extrabold text-slate-800">{totalAll}</p>
            <p className="text-xs text-slate-400 font-medium">Összes bejegyzés</p>
          </div>
        </div>
        <div className="card-raised p-5 flex items-center gap-4">
          <div className="icon-raised w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-3xl font-extrabold text-emerald-600">{totalYear}</p>
            <p className="text-xs text-slate-400 font-medium">{stats.currentYear}. évi bejegyzések</p>
          </div>
        </div>
      </div>

      {/* Típusonkénti bontás */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(item => {
          const Icon = item.icon
          return (
            <div key={item.label} className="card-raised p-4 flex items-center gap-3">
              <div className={`icon-raised w-10 h-10 bg-gradient-to-br ${item.gradient}`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-lg font-bold text-slate-800">{item.total}</span>
                  {item.year > 0 && (
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      +{item.year} idén
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Áttért + Kitért */}
      {(stats.totals.attert > 0 || stats.totals.kitert > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="card-raised p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><span className="text-emerald-600 font-bold text-sm">+</span></div>
            <div><p className="text-sm font-semibold text-slate-700">Áttértek</p><p className="text-lg font-bold text-emerald-600">{stats.totals.attert}</p></div>
          </div>
          <div className="card-raised p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center"><span className="text-red-600 font-bold text-sm">-</span></div>
            <div><p className="text-sm font-semibold text-slate-700">Kitértek</p><p className="text-lg font-bold text-red-500">{stats.totals.kitert}</p></div>
          </div>
        </div>
      )}
    </div>
  )
}
