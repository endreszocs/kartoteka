'use client'

import { useState } from 'react'
import { AGE_GROUPS } from '@/lib/constants/members'
import { ageFromDate } from '@/lib/utils/date'
import type { MemberOverviewSnapshot } from '@/lib/members/member-overview'
import { Users, Heart, TrendingUp, MapPin, Crown, Baby, UserCheck, GraduationCap, Calendar, ChevronRight } from 'lucide-react'
import { BirthdayListDialog } from '@/components/dashboard/birthday-list-dialog'
import { getBirthdayListData, type BirthdayListData } from '@/app/(dashboard)/tagnyilvantartas/birthday-list-actions'

interface OverviewTabProps {
  snapshot: MemberOverviewSnapshot
}

export function OverviewTab({ snapshot }: OverviewTabProps) {
  const { birthdays, nameDays, nameDayMembers, stats } = snapshot

  // 2026-07-24 (PR-9, 6. észrevétel): a születésnap-doboz a dashboard-éval
  // AZONOS szűrő/nyomtató dialógust nyitja — lazy betöltéssel.
  const [birthdayDialogOpen, setBirthdayDialogOpen] = useState(false)
  const [birthdayData, setBirthdayData] = useState<BirthdayListData | null>(null)
  const [birthdayLoading, setBirthdayLoading] = useState(false)

  async function openBirthdayDialog() {
    setBirthdayDialogOpen(true)
    if (!birthdayData && !birthdayLoading) {
      setBirthdayLoading(true)
      try {
        setBirthdayData(await getBirthdayListData())
      } finally {
        setBirthdayLoading(false)
      }
    }
  }

  const avgAge = stats.ageCount > 0 ? (stats.ageSum / stats.ageCount).toFixed(1) : '—'
  const menPct = stats.total > 0 ? Math.round(stats.men / stats.total * 100) : 0
  const womenPct = stats.total > 0 ? Math.round(stats.women / stats.total * 100) : 0

  return (
    <div className="space-y-4">
      {/* ═══ 1. sor: Hero KPI sáv ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniKpi icon={<Users className="w-5 h-5" />} gradient="from-blue-500 to-indigo-600" value={stats.total} label="Aktív tag" />
        <MiniKpi icon={<Heart className="w-5 h-5" />} gradient="from-pink-500 to-rose-500" value={`${avgAge} év`} label="Átlagéletkor" />
        <MiniKpi icon={<UserCheck className="w-5 h-5" />} gradient="from-emerald-500 to-green-600" value={stats.currentVoters} label="Választó" />
        <MiniKpi icon={<GraduationCap className="w-5 h-5" />} gradient="from-amber-500 to-orange-500" value={stats.currentKonfirmando} label="Konfirmandus" />
      </div>

      {/* ═══ 2. sor: Nemek + Korcsoportok (vizuális) ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Nemek — vizuális kör */}
        <div className="lg:col-span-2 card-raised p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Nemek megoszlása</h3>
          <div className="flex items-center gap-6">
            {/* Vizuális kör */}
            <div className="relative w-28 h-28 shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="#3b82f6" strokeWidth="3.5"
                  strokeDasharray={`${menPct * 0.942} 100`} strokeLinecap="round" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="#ec4899" strokeWidth="3.5"
                  strokeDasharray={`${womenPct * 0.942} 100`} strokeDashoffset={`-${menPct * 0.942}`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-slate-700">{stats.total}</span>
              </div>
            </div>
            {/* Számok */}
            <div className="space-y-3 flex-1">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-sm text-slate-600 flex-1">Férfiak</span>
                <span className="text-sm font-bold text-slate-700">{stats.men}</span>
                <span className="text-xs text-slate-400 w-10 text-right">{menPct}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-pink-500" />
                <span className="text-sm text-slate-600 flex-1">Nők</span>
                <span className="text-sm font-bold text-slate-700">{stats.women}</span>
                <span className="text-xs text-slate-400 w-10 text-right">{womenPct}%</span>
              </div>
              <div className="border-t pt-2 text-xs text-slate-400">
                <p>
                  ♂ {stats.menAgeCount > 0 ? (stats.menAgeSum / stats.menAgeCount).toFixed(1) : '—'} év · ♀ {stats.womenAgeCount > 0 ? (stats.womenAgeSum / stats.womenAgeCount).toFixed(1) : '—'} év
                </p>
                <p className="mt-1 leading-5 text-slate-500">
                  Ez a férfiak és a nők átlagéletkorát mutatja külön-külön.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Korcsoportok — gradiens sávok */}
        <div className="lg:col-span-3 card-raised p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Korcsoportok</h3>
          {/* 2026-06-30 (perf): a maxCount loop-invariáns — egyszer számoljuk ki a
              ciklus előtt, ne minden korcsoport-iterációban újra. */}
          {(() => { const maxCount = Math.max(...Object.values(stats.groups)); return (
          <div className="space-y-1">
            {AGE_GROUPS.map(g => {
              const count = stats.groups[g.key] || 0
              const pct = stats.total > 0 ? Math.round(count / stats.total * 100) : 0
              const barPct = maxCount > 0 ? (count / maxCount * 100) : 0
              return (
                <div key={g.key} className="flex items-center gap-2 group">
                  <span className="w-12 text-right text-[11px] font-medium text-slate-500">{g.key}</span>
                  <div className="flex-1 h-5 bg-slate-50 rounded-md overflow-hidden relative">
                    <div className="h-full rounded-md transition-all duration-500" style={{ width: `${barPct}%`, background: `linear-gradient(90deg, ${g.color}, ${g.color}aa)` }} />
                    {count > 0 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-600">{count}</span>
                    )}
                  </div>
                  <span className="w-8 text-right text-[11px] text-slate-400">{pct}%</span>
                </div>
              )
            })}
          </div>
          ) })()}
        </div>
      </div>

      {/* ═══ 3. sor: Előrejelzés + Rekordok + Települések ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Előrejelzés — idővonal stílus */}
        <div className="card-raised p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="icon-raised w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700">Előrejelzés</h3>
          </div>
          <div className="mb-3 rounded-xl bg-violet-50/80 px-3 py-2 text-xs leading-5 text-violet-800">
            Az első szám azt mutatja, hány fő érintheti a kategóriát 5 év múlva, a második pedig 10 év múlva.
            Ezek becslések a jelenlegi életkorok alapján.
          </div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            <span className="flex-1">Mutató</span>
            <span className="w-[3.25rem] text-right">5 év</span>
            <span className="w-[3.25rem] text-right">10 év</span>
          </div>
          <div className="space-y-3">
            <ForecastRow label="Új konfirmandusok" f5={stats.f5.konfirmando} f10={stats.f10.konfirmando} color="text-emerald-600" />
            <ForecastRow label="Új választók (18+)" f5={stats.f5.valaszto} f10={stats.f10.valaszto} color="text-blue-600" />
            <ForecastRow label="75 év felettiek" f5={stats.f5.idos75} f10={stats.f10.idos75} color="text-amber-600" />
            <ForecastRow label="80 év felettiek" f5={stats.f5.idos80} f10={stats.f10.idos80} color="text-red-500" />
          </div>
        </div>

        {/* Rekordok + Státusz */}
        <div className="card-raised p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="icon-raised w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500">
              <Crown className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700">Érdekességek</h3>
          </div>
          <div className="space-y-3">
            {stats.oldest && (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-amber-50/70">
                <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{stats.oldest.csaladnev} {stats.oldest.k_nev}</p>
                  <p className="text-[11px] text-slate-400">Legidősebb tag · {ageFromDate(stats.oldest.sz_datum)} éves</p>
                </div>
              </div>
            )}
            {stats.youngest && (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-green-50/70">
                <Baby className="w-4 h-4 text-green-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{stats.youngest.csaladnev} {stats.youngest.k_nev}</p>
                  <p className="text-[11px] text-slate-400">Legfiatalabb · {ageFromDate(stats.youngest.sz_datum)} éves</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
              <StatusPill value={stats.dead} label="Elhunyt" color="bg-slate-100 text-slate-600" />
              <StatusPill value={stats.moved} label="Elköltözött" color="bg-blue-50 text-blue-600" />
              <StatusPill value={stats.left} label="Kitért" color="bg-amber-50 text-amber-600" />
            </div>
          </div>
        </div>

        {/* Települések */}
        <div className="card-raised p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="icon-raised w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-600">
              <MapPin className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700">Települések</h3>
          </div>
          <div className="space-y-2">
            {stats.topLocs.map(([name, cnt], i) => (
              <div key={name} className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${i === 0 ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                <span className="flex-1 text-sm text-slate-700 truncate">{name}</span>
                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-400 rounded-full" style={{ width: `${stats.topLocs[0] ? (cnt / stats.topLocs[0][1] * 100) : 0}%` }} />
                </div>
                <span className="text-xs font-semibold text-slate-500 w-6 text-right">{cnt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ 4. sor: Top nevek — egymás mellett ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-raised p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="icon-raised w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600">
              <Calendar className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700">Leggyakoribb családnevek</h3>
          </div>
          <div className="space-y-1">
            {stats.topFam.map(([name, cnt], i) => (
              <NameBar key={name} rank={i + 1} name={name} count={cnt} maxCount={stats.topFam[0]?.[1] || 1} color="bg-blue-400" />
            ))}
            {stats.topFam.length === 0 && <p className="text-sm text-slate-400 py-2">Nincs elegendő adat.</p>}
          </div>
        </div>

        <div className="card-raised p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="icon-raised w-8 h-8 bg-gradient-to-br from-pink-500 to-rose-500">
              <Heart className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700">Leggyakoribb keresztnevek</h3>
          </div>
          <div className="space-y-1">
            {stats.topFirst.map(([name, cnt], i) => (
              <NameBar key={name} rank={i + 1} name={name} count={cnt} maxCount={stats.topFirst[0]?.[1] || 1} color="bg-pink-400" />
            ))}
            {stats.topFirst.length === 0 && <p className="text-sm text-slate-400 py-2">Nincs elegendő adat.</p>}
          </div>
        </div>
      </div>

      {/* ── E havi születésnaposok (2026-06-10, Fázis 5 / P3-1) ───── */}
      <div className="card-raised p-5">
        {/* 2026-07-24 (PR-9): a fejléc kattintható — a dashboard-dialógust nyitja */}
        <button
          type="button"
          onClick={() => void openBirthdayDialog()}
          className="mb-3 flex w-full items-center gap-3 rounded-xl text-left transition hover:bg-amber-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 dark:hover:bg-amber-950/20"
          title="Születésnap-lista szűrővel és nyomtatással"
        >
          <div className="icon-raised w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-700">
              E havi születésnaposok
              <ChevronRight className="size-4 text-amber-500" />
            </h3>
            <p className="text-xs text-slate-400">Kattints a szűrhető, nyomtatható listához (időszak, kor, nem, lakcím).</p>
          </div>
        </button>
        {birthdays.length === 0 ? (
          <p className="text-xs text-slate-400">Ebben a hónapban nincs születésnapos tag.</p>
        ) : (
          <ul className="grid max-h-56 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {birthdays.map(b => (
              <li key={b.id} className="flex items-baseline justify-between gap-2 py-0.5 text-sm">
                <span className="truncate font-medium text-slate-700">{b.name}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{b.day}. napján · {b.turning} éves</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── E heti névnapok (2026-06-10, Fázis 5 / P3-1b) ───────── */}
      <div className="card-raised p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="icon-raised w-10 h-10 bg-gradient-to-br from-violet-400 to-purple-500">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700">E heti névnapok</h3>
            <p className="text-xs text-slate-400">A következő 7 nap névnapjai — és az érintett, köszöntendő tagok.</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {nameDays.map(d => (
              <span key={`${d.honap}-${d.nap}`} className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                {HONAPOK[d.honap - 1]} {d.nap}. — {d.nevek.length > 0 ? d.nevek.join(', ') : 'nincs adat'}
              </span>
            ))}
          </div>
          {nameDayMembers.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Köszöntendő tagok ({nameDayMembers.length})</p>
              <p className="text-sm leading-6 text-slate-700">{nameDayMembers.join(' · ')}</p>
            </div>
          )}
        </div>
      </div>

      {/* 2026-07-24 (PR-9, 6. észrevétel): a dashboard-dal AZONOS dialógus */}
      <BirthdayListDialog
        open={birthdayDialogOpen}
        onOpenChange={setBirthdayDialogOpen}
        allMembers={birthdayData?.members ?? []}
        congregationName={birthdayData?.congregationName ?? 'Gyülekezet'}
        congregationLogo={birthdayData?.congregationLogo ?? null}
      />
    </div>
  )
}

const HONAPOK = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.']

// ─── Alkomponensek ──────────────────────────────────────────

function MiniKpi({ icon, gradient, value, label }: { icon: React.ReactNode; gradient: string; value: number | string; label: string }) {
  return (
    <div className="card-raised p-4 flex items-center gap-3">
      <div className={`icon-raised w-10 h-10 bg-gradient-to-br ${gradient} shrink-0`}>
        <span className="text-white">{icon}</span>
      </div>
      <div>
        <p className="text-xl font-bold text-slate-800 leading-tight">{typeof value === 'number' ? value.toLocaleString('hu') : value}</p>
        <p className="text-[11px] text-slate-400">{label}</p>
      </div>
    </div>
  )
}

function ForecastRow({ label, f5, f10, color }: { label: string; f5: number; f10: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex-1 text-slate-500 text-xs">{label}</span>
      <div className="flex gap-3">
        <span className={`font-bold ${color} text-right w-8`}>{f5}</span>
        <span className={`font-bold ${color} text-right w-8 opacity-60`}>{f10}</span>
      </div>
    </div>
  )
}

function StatusPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className={`rounded-xl px-2 py-2 text-center ${color}`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-[10px]">{label}</p>
    </div>
  )
}

function NameBar({ rank, name, count, maxCount, color }: { rank: number; name: string; count: number; maxCount: number; color: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-5 text-right text-[11px] text-slate-400">{rank}.</span>
      <span className="w-20 text-sm font-medium text-slate-700 truncate">{name}</span>
      <div className="flex-1 h-4 bg-slate-50 rounded-md overflow-hidden">
        <div className={`h-full ${color} rounded-md transition-all duration-300`} style={{ width: `${(count / maxCount) * 100}%`, opacity: 0.6 + (count / maxCount) * 0.4 }} />
      </div>
      <span className="w-6 text-right text-xs font-semibold text-slate-500">{count}</span>
    </div>
  )
}
