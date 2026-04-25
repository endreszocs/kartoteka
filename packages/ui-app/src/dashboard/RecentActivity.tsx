'use client'

import { ClipboardList, Calendar, Users as UsersIcon } from 'lucide-react'

export interface RecentActivityEntry {
  id: number
  /** ISO timestamp (YYYY-MM-DD vagy hosszabb). */
  idopont: string | null
  /** Az alkalom típusa (istentisztelet / látogatás / temetés / esketés stb.). */
  jellege: string | null
  /** Cím / fő-tartalom rövid összefoglalása. */
  cim: string | null
  /** Jelenlét száma (ha van), pl. istentiszteletnél. */
  jelenlet?: number | null
}

export interface RecentActivityProps {
  entries: RecentActivityEntry[]
  /** Kattintás egy bejegyzésre — a wrapper irányíthat a /munkanaplo/<id>-re. */
  onEntryClick?: (entry: RecentActivityEntry) => void
  /** Kattintás a „Mind mutatása" gombra. */
  onShowAllClick?: () => void
}

const HU_MONTHS_SHORT = [
  'jan', 'feb', 'márc', 'ápr', 'máj', 'jún',
  'júl', 'aug', 'szept', 'okt', 'nov', 'dec',
]
const HU_DAYS_SHORT = ['vas', 'hét', 'kedd', 'szer', 'csüt', 'pén', 'szom']

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (isNaN(date.getTime())) return iso
  return `${HU_MONTHS_SHORT[date.getMonth()]} ${date.getDate()}. (${HU_DAYS_SHORT[date.getDay()]})`
}

export function RecentActivity({ entries, onEntryClick, onShowAllClick }: RecentActivityProps) {
  return (
    <div className="card-raised relative overflow-hidden p-5 sm:p-6">
      <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-sky-200/35 blur-3xl" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700/70">
              Munkanapló
            </p>
            <h2 className="mt-1 font-heading text-xl text-slate-800 sm:text-2xl">
              Friss bejegyzések
            </h2>
          </div>
          {onShowAllClick && (
            <button
              type="button"
              onClick={onShowAllClick}
              className="rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-white"
            >
              Mind mutatása
            </button>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-white/50 p-6 text-center">
            <ClipboardList className="mx-auto size-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">
              Még nincsen napló-bejegyzés.
            </p>
            <p className="text-xs text-slate-400">
              Az új bejegyzéseket a Munkanapló oldalon rögzítheted.
            </p>
          </div>
        ) : (
          <ul className="mt-5 space-y-2">
            {entries.map((e) => {
              const interactive = Boolean(onEntryClick)
              const Wrapper: React.ElementType = interactive ? 'button' : 'div'
              return (
                <li key={e.id}>
                  <Wrapper
                    type={interactive ? 'button' : undefined}
                    onClick={onEntryClick ? () => onEntryClick(e) : undefined}
                    className={`flex w-full items-start gap-3 rounded-xl border border-slate-200/60 bg-white/60 p-3 text-left transition ${
                      interactive ? 'hover:border-slate-300 hover:bg-white' : ''
                    }`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-cyan-500 text-white">
                      <Calendar className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-slate-500">
                          {formatDate(e.idopont)}
                        </p>
                        {e.jellege && (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                            {e.jellege}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-slate-800">
                        {e.cim ?? '(nincs cím)'}
                      </p>
                    </div>
                    {typeof e.jelenlet === 'number' && e.jelenlet > 0 && (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                        <UsersIcon className="size-3.5" />
                        {e.jelenlet}
                      </span>
                    )}
                  </Wrapper>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
