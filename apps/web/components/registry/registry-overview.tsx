'use client'

import { useState, useEffect } from 'react'
import { getRegistryStats, getRegistryJubilees } from '@/app/(dashboard)/anyakonyv/actions'
import { Droplet, Cross, Heart, BookOpen, ArrowRightLeft, TrendingUp, CalendarClock } from 'lucide-react'

type Stats = Awaited<ReturnType<typeof getRegistryStats>>
type Jubilees = Awaited<ReturnType<typeof getRegistryJubilees>>

// 2026-06-10: jubileumi évforduló-szűrő opciók (N éve történt események)
const JUBILEE_OPTIONS = [10, 20, 25, 50, 75]

export function RegistryOverview() {
  const [stats, setStats] = useState<Stats>(null)
  const [loading, setLoading] = useState(true)
  const [jubileeYears, setJubileeYears] = useState<number | null>(null)
  const [jubilee, setJubilee] = useState<Jubilees>(null)
  const [jubileeLoading, setJubileeLoading] = useState(false)

  async function loadJubilee(n: number) {
    setJubileeYears(n)
    setJubileeLoading(true)
    const data = await getRegistryJubilees(n)
    setJubilee(data)
    setJubileeLoading(false)
  }

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

      {/* ── Jubileumi évfordulók (2026-06-10) ───────────────────── */}
      <div className="card-raised p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="icon-raised w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500">
              <CalendarClock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Jubileumi évfordulók</p>
              <p className="text-xs text-slate-400">Kik kereszteltek, konfirmáltak vagy esküdtek ennyi évvel ezelőtt?</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {JUBILEE_OPTIONS.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => loadJubilee(n)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  jubileeYears === n ? 'bg-amber-500 text-white shadow-sm' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                {n} éve
              </button>
            ))}
          </div>
        </div>

        {jubileeLoading && (
          <p className="py-6 text-center text-sm text-slate-400 animate-pulse">Évfordulók betöltése…</p>
        )}

        {!jubileeLoading && jubileeYears !== null && jubilee && (
          <div className="space-y-1">
            <p className="text-xs text-slate-400">
              A(z) <strong className="text-slate-600">{jubilee.targetYear}.</strong> év bejegyzései ({jubilee.yearsAgo} éve):
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <JubileeList
                title="Keresztelés"
                tone="text-blue-700 bg-blue-50"
                items={jubilee.keresztelesek.map(k => ({ id: k.id, fo: k.nev + (k.meghalt ? ' †' : ''), datum: k.datum }))}
              />
              <JubileeList
                title="Konfirmáció"
                tone="text-violet-700 bg-violet-50"
                items={jubilee.konfirmaciok.map(k => ({ id: k.id, fo: k.nev + (k.meghalt ? ' †' : ''), datum: k.datum }))}
              />
              <JubileeList
                title="Esketés"
                tone="text-rose-700 bg-rose-50"
                items={jubilee.hazassagok.map(h => ({ id: h.id, fo: `${h.ferj} – ${h.feleseg}`, datum: h.datum }))}
              />
            </div>
          </div>
        )}

        {!jubileeLoading && jubileeYears === null && (
          <p className="text-xs text-slate-400">Válassz évfordulót a fenti gombokkal — a lista köszöntésekhez, jubileumi istentiszteletekhez használható.</p>
        )}
      </div>
    </div>
  )
}

function JubileeList({ title, tone, items }: { title: string; tone: string; items: { id: number; fo: string; datum: string | null }[] }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white/70 p-3">
      <div className="flex items-center justify-between">
        <p className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>{title}</p>
        <span className="text-xs font-semibold text-slate-400">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">Nincs bejegyzés ebből az évből.</p>
      ) : (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
          {items.map(it => (
            <li key={it.id} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-slate-700">{it.fo}</span>
              <span className="shrink-0 text-[11px] text-slate-400">
                {it.datum ? new Date(it.datum).toLocaleDateString('hu-HU') : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
