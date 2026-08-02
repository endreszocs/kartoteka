'use client'

import { useState } from 'react'
import { Cake, Flower2, CalendarClock, List } from 'lucide-react'
import { HU_MONTHS_SHORT } from '@/lib/constants/dashboard'
import { BirthdayListDialog } from './birthday-list-dialog'

interface Birthday { name: string; age: number | null }
interface UpcomingBirthday { name: string; age: number; diffDays: number; month: number; day: number }

interface Member {
  id: string
  csaladnev: string | null
  k_nev: string | null
  namepattern: string | null
  /** 2026-08-01 (PR-19): az özv./elv. előtaghoz */
  allapot?: string | null
  sz_datum: string | null
  ferfi: boolean | null
}

interface CelebrationsProps {
  todayBirthdays: Birthday[]
  todayNamedayMembers: string[]
  todayNamedayNames: string[]
  upcomingBirthdays: UpcomingBirthday[]
  /** Az összes aktív tag — a szűrő-modalhoz */
  allMembers?: Member[]
  congregationName?: string
  congregationLogo?: string | null
}

export function Celebrations({
  todayBirthdays,
  todayNamedayMembers,
  todayNamedayNames,
  upcomingBirthdays,
  allMembers = [],
  congregationName = 'Gyülekezet',
  congregationLogo,
}: CelebrationsProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const hasTodayEvents = todayBirthdays.length > 0 || todayNamedayMembers.length > 0

  // Max 5 születésnap + max 5 upcoming = max 10 összesen
  const limitedBirthdays = todayBirthdays.slice(0, 5)
  const limitedNamedays = todayNamedayMembers.slice(0, 5)
  const limitedUpcoming = upcomingBirthdays.slice(0, 5)

  return (
    <div className="card-raised flex h-full max-h-[500px] flex-col overflow-hidden lg:max-h-none xl:h-auto xl:max-h-[760px]">
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <div className="icon-raised w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500">
          <Cake className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 text-sm">Ma köszöntjük</h3>
          <p className="text-[11px] text-slate-400">Születésnapok és névnapok</p>
        </div>
        {allMembers.length > 0 && (
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 transition hover:bg-amber-100"
            title="Szűrés + nyomtatás"
          >
            <List className="size-3" />
            Lista
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-5">
        {/* Születésnaposok */}
        {limitedBirthdays.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Születésnap</p>
            {limitedBirthdays.map((b, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-muted px-3 py-2.5"
                style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)' }}>
                <div className="icon-raised w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-500 shrink-0">
                  <Cake className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="flex-1 text-sm font-medium text-slate-700 truncate">{b.name}</span>
                {b.age && (
                  <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full"
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)' }}>
                    {b.age} éves
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Névnaposok */}
        {limitedNamedays.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Névnap</p>
            {limitedNamedays.map((name, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-muted px-3 py-2.5"
                style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)' }}>
                <div className="icon-raised w-8 h-8 bg-gradient-to-br from-pink-400 to-rose-500 shrink-0">
                  <Flower2 className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-medium text-slate-700 truncate">{name}</span>
              </div>
            ))}
          </div>
        )}

        {!hasTodayEvents && todayNamedayNames.length > 0 && (
          <p className="text-sm text-slate-400 py-2">
            Ma: <em className="text-slate-500">{todayNamedayNames.join(', ')}</em> — nincs érintett tag.
          </p>
        )}
        {!hasTodayEvents && todayNamedayNames.length === 0 && (
          <p className="text-sm text-slate-400 py-3">Ma nincs köszöntés.</p>
        )}

        {/* Következő 14 nap */}
        {limitedUpcoming.length > 0 && (
          <div className="space-y-1.5 border-t border-white/60 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Következő 14 nap</p>
              </div>
              <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{upcomingBirthdays.length} fő</span>
            </div>
            {limitedUpcoming.map((b, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex flex-col items-center justify-center shrink-0"
                  style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.8)' }}>
                  <span className="text-sm font-bold text-slate-700 leading-none">{b.day}</span>
                  <span className="text-[9px] text-slate-400 font-medium">{HU_MONTHS_SHORT[b.month]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{b.name}</p>
                  <p className="text-[11px] text-slate-400">{b.age} éves lesz</p>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                  b.diffDays <= 3
                    ? 'bg-red-50 text-red-600'
                    : 'bg-slate-100 text-slate-500'
                }`} style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)' }}>
                  {b.diffDays === 1 ? 'holnap' : `${b.diffDays} nap`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {allMembers.length > 0 && (
        <BirthdayListDialog
          open={filterOpen}
          onOpenChange={setFilterOpen}
          allMembers={allMembers}
          congregationName={congregationName}
          congregationLogo={congregationLogo}
        />
      )}
    </div>
  )
}
