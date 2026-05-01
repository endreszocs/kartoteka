'use client'

import { Calendar, MapPin, Repeat } from 'lucide-react'

export interface UpcomingProgramEntry {
  id: string
  cim: string
  /** YYYY-MM-DD */
  datum: string
  /** HH:MM, opcionális. */
  ido_kezdes?: string | null
  helyszin?: string | null
  tipus: string
  prioritas?: string | null
  ismetlodes_tipus?: string | null
  egyedi_tipus_nev?: string | null
  egyedi_emoji?: string | null
  /** P1 #7: rövid leírás a cím alatt (1 sor). */
  leiras?: string | null
  /** P1 #7: HEX-szín a kártya bal-szélén lévő színsávhoz. */
  szin?: string | null
  /** Hány nap múlva. 0 = ma. Opcionális; ha hiányzik, a wrapper kalkulálja. */
  daysUntil?: number
}

export interface UpcomingProgramsProps {
  entries: UpcomingProgramEntry[]
  /** Kattintás egy bejegyzésre. */
  onEntryClick?: (entry: UpcomingProgramEntry) => void
  /** „Mind mutatása" gomb (pl. /programok-ra navigál). */
  onShowAllClick?: () => void
}

const TIPUS_EMOJI: Record<string, string> = {
  istentisztelet: '⛪',
  bibliaora: '📖',
  imaora: '🙏',
  ifjusagi: '🎯',
  gyerekprogram: '🧒',
  konferencia: '🎤',
  hangverseny: '🎵',
  kozossegi: '🤝',
  presbiteri: '📋',
  latogatas: '🏠',
  unnep: '🎄',
  tabor: '⛺',
  evangelizacio: '📣',
  diakoniai: '❤️',
  noszovetseg: '🌸',
  egyeb: '📌',
}

const TIPUS_LABELS: Record<string, string> = {
  istentisztelet: 'Istentisztelet',
  bibliaora: 'Bibliaóra',
  imaora: 'Imaóra',
  ifjusagi: 'Ifjúsági',
  gyerekprogram: 'Gyerekprogram',
  konferencia: 'Konferencia',
  hangverseny: 'Hangverseny',
  kozossegi: 'Közösségi',
  presbiteri: 'Presbiteri',
  latogatas: 'Látogatás',
  unnep: 'Ünnep',
  tabor: 'Tábor',
  evangelizacio: 'Evangélizáció',
  diakoniai: 'Diakónia',
  noszovetseg: 'Nőszövetség',
  egyeb: 'Egyéb',
}

const ISMETLODES_LABELS: Record<string, string> = {
  heti: 'Heti',
  ketheti: 'Kétheti',
  havi: 'Havi',
}

const HU_MONTHS_SHORT = [
  'jan', 'feb', 'márc', 'ápr', 'máj', 'jún',
  'júl', 'aug', 'szept', 'okt', 'nov', 'dec',
]
const HU_DAYS_SHORT = ['vas', 'hét', 'kedd', 'szer', 'csüt', 'pén', 'szom']

function formatDateShort(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (isNaN(date.getTime())) return iso
  return `${HU_MONTHS_SHORT[date.getMonth()]} ${date.getDate()}. (${HU_DAYS_SHORT[date.getDay()]})`
}

function calculateDaysUntil(iso: string): number {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return 0
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function daysUntilLabel(d: number): string {
  if (d === 0) return 'ma'
  if (d === 1) return 'holnap'
  return `${d} nap múlva`
}

function progEmoji(e: UpcomingProgramEntry): string {
  if (e.tipus === 'egyeb' && e.egyedi_emoji) return e.egyedi_emoji
  return TIPUS_EMOJI[e.tipus] ?? '📌'
}

function progLabel(e: UpcomingProgramEntry): string {
  if (e.tipus === 'egyeb' && e.egyedi_tipus_nev) return e.egyedi_tipus_nev
  return TIPUS_LABELS[e.tipus] ?? 'Egyéb'
}

export function UpcomingPrograms({ entries, onEntryClick, onShowAllClick }: UpcomingProgramsProps) {
  return (
    <div className="card-raised relative overflow-hidden p-5 sm:p-6">
      <div
        className="absolute -right-6 -top-6 h-28 w-28 rounded-full blur-3xl"
        style={{ background: 'color-mix(in oklab, var(--accent) 25%, transparent)' }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700/70">
              Programok
            </p>
            <h2 className="mt-1 font-heading text-xl text-slate-800 sm:text-2xl">
              Közelgő alkalmak
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
            <Calendar className="mx-auto size-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">Nincsen közelgő alkalom.</p>
            <p className="text-xs text-slate-400">
              Új programokat a jövőben rögzíthetsz a Programok modulban.
            </p>
          </div>
        ) : (
          <ul className="mt-5 space-y-2">
            {entries.map((e) => {
              const days = e.daysUntil ?? calculateDaysUntil(e.datum)
              const isToday = days === 0
              const interactive = Boolean(onEntryClick)
              const Wrapper: React.ElementType = interactive ? 'button' : 'div'
              return (
                <li key={e.id}>
                  <Wrapper
                    type={interactive ? 'button' : undefined}
                    onClick={onEntryClick ? () => onEntryClick(e) : undefined}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                      isToday
                        ? 'border-amber-200 bg-amber-50/60'
                        : 'border-slate-200/60 bg-white/60'
                    } ${interactive ? 'hover:border-slate-300 hover:bg-white' : ''}`}
                  >
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-lg text-white"
                      style={{
                        background: isToday
                          ? 'linear-gradient(135deg, var(--accent), var(--accent2))'
                          : 'linear-gradient(135deg, var(--primary), var(--accent))',
                      }}
                      aria-hidden
                    >
                      {progEmoji(e)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-slate-500">
                          {formatDateShort(e.datum)}
                          {e.ido_kezdes && ` • ${e.ido_kezdes}`}
                        </p>
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                          {progLabel(e)}
                        </span>
                        {e.ismetlodes_tipus && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                            title="Ismétlődő alkalom"
                          >
                            <Repeat className="size-2.5" />
                            {ISMETLODES_LABELS[e.ismetlodes_tipus] ?? e.ismetlodes_tipus}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium text-slate-800">{e.cim}</p>
                      {e.leiras && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{e.leiras}</p>
                      )}
                      {e.helyszin && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="size-3" />
                          {e.helyszin}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        isToday ? 'text-accent-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                      style={isToday ? { background: 'var(--accent)' } : undefined}
                    >
                      {daysUntilLabel(days)}
                    </span>
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
