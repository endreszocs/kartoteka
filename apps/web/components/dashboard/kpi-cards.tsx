import Link from 'next/link'
import { Users, Home, TrendingUp, TrendingDown, Globe, Presentation } from 'lucide-react'

interface KpiCardsProps {
  activeMemberCount: number
  familyCount: number
  monthlyIncome: number
  monthlyExpense: number
  yearlyIncome?: number
  yearlyExpense?: number
  currentYear?: number
  publicSiteStatus?: { isPublished: boolean; postCount: number } | null
}

export function KpiCards({
  activeMemberCount,
  familyCount,
  monthlyIncome,
  monthlyExpense,
  yearlyIncome = 0,
  yearlyExpense = 0,
  currentYear = new Date().getFullYear(),
  publicSiteStatus,
}: KpiCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 xl:gap-4">
      {/* Aktív tagok */}
      <div className="card-raised group relative cursor-default overflow-hidden p-4 pt-11 sm:p-5 sm:pt-11">
        <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-cyan-100/55 blur-3xl" />
        <div className="absolute left-4 top-4 rounded-full border border-teal-200/60 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-700/75">
          Közösség
        </div>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider">Aktív tagok</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-800 mt-1.5">
              {activeMemberCount > 0 ? activeMemberCount.toLocaleString('hu') : '—'}
            </p>
          </div>
          <div className="icon-raised w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-br from-teal-500 to-cyan-600 transition-transform duration-300 group-hover:scale-110">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
        </div>
      </div>

      {/* Családok */}
      <div className="card-raised group relative cursor-default overflow-hidden p-4 pt-11 sm:p-5 sm:pt-11">
        <div className="absolute left-2 top-1 h-24 w-24 rounded-full bg-emerald-100/60 blur-3xl" />
        <div className="absolute left-4 top-4 rounded-full border border-emerald-200/60 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700/75">
          Családok
        </div>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider">Családok</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-800 mt-1.5">
              {familyCount > 0 ? familyCount.toLocaleString('hu') : '—'}
            </p>
          </div>
          <div className="icon-raised w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-br from-emerald-500 to-emerald-600 transition-transform duration-300 group-hover:scale-110">
            <Home className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
        </div>
      </div>

      {/* Havi bevétel + kiadás — egy kártyában */}
      <div className="card-raised group relative cursor-default overflow-hidden p-4 pt-11 sm:p-5 sm:pt-11">
        <div className="absolute right-2 top-0 h-24 w-24 rounded-full bg-amber-100/65 blur-3xl" />
        <div className="absolute left-4 top-4 rounded-full border border-amber-200/60 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700/75">
          Pénzügy {currentYear}
        </div>
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider">Éves pénzforgalom</p>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="text-sm sm:text-base font-bold text-emerald-600 whitespace-nowrap">
                {yearlyIncome > 0 ? yearlyIncome.toLocaleString('hu') : '—'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="text-sm sm:text-base font-bold text-red-500 whitespace-nowrap">
                {yearlyExpense > 0 ? yearlyExpense.toLocaleString('hu') : '—'}
              </span>
            </div>
            {(monthlyIncome > 0 || monthlyExpense > 0) && (
              <p className="pt-1 text-[10px] text-slate-400">
                E havi: <span className="font-mono text-emerald-600">+{monthlyIncome.toLocaleString('hu')}</span>
                {' / '}
                <span className="font-mono text-red-500">−{monthlyExpense.toLocaleString('hu')}</span>
              </p>
            )}
          </div>
          <div className="icon-raised w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-br from-amber-500 to-orange-500 transition-transform duration-300 group-hover:scale-110">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
        </div>
      </div>

      {/* Gyülekezeti weboldal */}
      <Link href="/publikus-oldal" className="card-raised group relative cursor-pointer overflow-hidden p-4 pt-11 sm:p-5 sm:pt-11 transition hover:shadow-lg">
        <div className="absolute left-0 top-0 h-24 w-24 rounded-full bg-emerald-100/70 blur-3xl" />
        <div className={`absolute left-4 top-4 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${publicSiteStatus?.isPublished ? 'border-emerald-200/60 bg-emerald-50/70 text-emerald-700/75' : 'border-slate-200/60 bg-white/70 text-slate-500/75'}`}>
          {publicSiteStatus?.isPublished ? 'Élő' : 'Weboldal'}
        </div>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider">Gyülekezeti weboldal</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-800 mt-1.5">
              {publicSiteStatus ? `${publicSiteStatus.postCount} poszt` : 'Beállítás →'}
            </p>
          </div>
          <div className="icon-raised w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-br from-emerald-500 to-teal-600 transition-transform duration-300 group-hover:scale-110">
            <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
        </div>
      </Link>

      {/* Prezentáció (2026-04-21m) — éves beszámoló studio */}
      <Link href="/eves-jelentes/prezentacio" className="card-raised group relative cursor-pointer overflow-hidden p-4 pt-11 sm:p-5 sm:pt-11 transition hover:shadow-lg">
        <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-violet-100/70 blur-3xl" />
        <div className="absolute left-4 top-4 rounded-full border border-violet-200/60 bg-violet-50/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-700/75">
          Bemutató
        </div>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider">Prezentáció</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-800 mt-1.5">
              Éves beszámoló →
            </p>
          </div>
          <div className="icon-raised w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-br from-violet-500 to-purple-600 transition-transform duration-300 group-hover:scale-110">
            <Presentation className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
        </div>
      </Link>
    </div>
  )
}
