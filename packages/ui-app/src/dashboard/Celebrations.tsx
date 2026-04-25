'use client'

import { Cake, Gift, Sparkles } from 'lucide-react'

export interface CelebrationEntry {
  id: string
  fullName: string
  /** YYYY-MM-DD */
  birthDate: string
  /** A betöltendő kor (a következő születésnapon). */
  turningAge: number
  /** Hány nap múlva. 0 = ma. */
  daysUntil: number
}

export interface CelebrationsProps {
  entries: CelebrationEntry[]
  /** Kattintás egy bejegyzésre (pl. tag-detail nyitása). */
  onEntryClick?: (entry: CelebrationEntry) => void
  /** Kattintás a „Nyomtatható lista" gombra (opcionális). */
  onPrintClick?: () => void
}

const HU_MONTHS_SHORT = [
  'jan', 'feb', 'márc', 'ápr', 'máj', 'jún',
  'júl', 'aug', 'szept', 'okt', 'nov', 'dec',
]

function formatBirthDayShort(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  return `${HU_MONTHS_SHORT[month] ?? '?'} ${day}.`
}

function daysUntilLabel(d: number): string {
  if (d === 0) return 'ma'
  if (d === 1) return 'holnap'
  return `${d} nap múlva`
}

export function Celebrations({ entries, onEntryClick, onPrintClick }: CelebrationsProps) {
  const today = entries.filter((e) => e.daysUntil === 0)
  const upcoming = entries.filter((e) => e.daysUntil > 0)

  const isEmpty = today.length === 0 && upcoming.length === 0

  return (
    <div className="card-raised relative overflow-hidden p-5 sm:p-6">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-pink-200/35 blur-3xl" />
      <div className="absolute -left-6 bottom-0 h-24 w-24 rounded-full bg-amber-200/30 blur-3xl" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pink-700/70">
              Születésnapok és névnapok
            </p>
            <h2 className="mt-1 font-heading text-xl text-slate-800 sm:text-2xl">
              Ma köszöntjük
            </h2>
          </div>
          {onPrintClick && (
            <button
              type="button"
              onClick={onPrintClick}
              className="rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-white"
            >
              Nyomtatható lista
            </button>
          )}
        </div>

        {isEmpty ? (
          <p className="mt-5 text-sm text-slate-500">
            A következő 14 napban nincsen születésnap.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {today.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="size-3.5 text-amber-500" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                    Ma
                  </p>
                </div>
                <ul className="space-y-1.5">
                  {today.map((e) => (
                    <CelebrationItem key={e.id} entry={e} onClick={onEntryClick} highlight />
                  ))}
                </ul>
              </div>
            )}
            {upcoming.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Cake className="size-3.5 text-pink-500" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Következő 14 napban
                  </p>
                </div>
                <ul className="space-y-1.5">
                  {upcoming.map((e) => (
                    <CelebrationItem key={e.id} entry={e} onClick={onEntryClick} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface CelebrationItemProps {
  entry: CelebrationEntry
  onClick?: (entry: CelebrationEntry) => void
  highlight?: boolean
}

function CelebrationItem({ entry, onClick, highlight }: CelebrationItemProps) {
  const interactive = Boolean(onClick)
  const Wrapper: React.ElementType = interactive ? 'button' : 'div'

  return (
    <li>
      <Wrapper
        type={interactive ? 'button' : undefined}
        onClick={onClick ? () => onClick(entry) : undefined}
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
          highlight
            ? 'border-amber-200/70 bg-amber-50/50'
            : 'border-slate-200/60 bg-white/60'
        } ${interactive ? 'hover:border-slate-300 hover:bg-white' : ''}`}
      >
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
            highlight
              ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
              : 'bg-pink-100 text-pink-700'
          }`}
        >
          <Gift className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{entry.fullName}</p>
          <p className="text-[11px] text-slate-500">
            {formatBirthDayShort(entry.birthDate)} — {entry.turningAge}. születésnap
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            highlight ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {daysUntilLabel(entry.daysUntil)}
        </span>
      </Wrapper>
    </li>
  )
}
