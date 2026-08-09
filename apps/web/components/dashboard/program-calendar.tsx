'use client'

// ── Hónap-naptár (navigátor) — Claude Design widget, 2026-06-07 ──
// A napra kattintás SZŰRI az agendát arra a napra (nem nyit azonnal új programot).
import { CAL_DAYS_HU, HU_MONTHS, progColor } from '@/lib/constants/dashboard'
import type { Program } from '@/lib/constants/dashboard'
import { ymd, eventsForDay } from '@/lib/utils/program-day'

interface ProgramCalendarProps {
  /** A betöltött év (ismétlődés-feloldott) programjai. */
  programs: Program[]
  month: number
  year: number
  today: Date
  selectedDay: number | null
  onSelectDay: (day: number) => void
  /**
   * 2026-08-10: kompakt („kis kockás") rács az irányítópult-csempéhez.
   * Kisebb cellák + FIX 6 hetes rács, hogy a csempe magassága hónapváltáskor
   * se ugráljon, és a három csempe egy magasságú maradjon.
   */
  compact?: boolean
}

/** Egy teljes hónapnézet 6 hét × 7 nap = 42 cellából áll. */
const COMPACT_CELLS = 42

export function ProgramCalendar({
  programs, month, year, today, selectedDay, onSelectDay, compact = false,
}: ProgramCalendarProps) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let startDow = new Date(year, month, 1).getDay() - 1 // hétfő-kezdés
  if (startDow < 0) startDow = 6
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate())
  // 2026-08-10: a kis kockába csak 2 pötty fér el olvashatóan, a többi „+N"
  const maxDots = compact ? 2 : 3

  const cells: React.ReactNode[] = []

  CAL_DAYS_HU.forEach((d, i) => {
    cells.push(
      <div key={`h${i}`} className={`kt-cal-head${i >= 5 ? ' is-weekend' : ''}`}>{d}</div>
    )
  })
  for (let i = 0; i < startDow; i++) cells.push(<div key={`e${i}`} className="kt-cal-empty" />)

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = ymd(year, month, d)
    const isToday = dateStr === todayStr
    const isPast = dateStr < todayStr
    const isSunday = new Date(year, month, d).getDay() === 0
    const evts = eventsForDay(programs, year, month, d)
    const has = evts.length > 0
    const selected = selectedDay === d

    const colors: string[] = []
    for (const e of evts) { if (colors.length < maxDots) colors.push(progColor(e)) }
    const extra = evts.length - colors.length

    let cls = 'kt-cal-day'
    if (selected) cls += ' is-selected'
    if (isToday) cls += ' is-today'
    if (isSunday) cls += ' is-sunday'
    if (isPast && !isToday) cls += ' is-past'
    if (has) cls += ' has-events'

    cells.push(
      <button
        key={d}
        type="button"
        className={cls}
        onClick={() => onSelectDay(d)}
        title={has ? `${HU_MONTHS[month]} ${d}. — ${evts.length} program` : `${HU_MONTHS[month]} ${d}.`}
        aria-pressed={selected}
        aria-label={`${HU_MONTHS[month]} ${d}.${has ? `, ${evts.length} program` : ''}`}
      >
        <span className="kt-cal-num">{d}</span>
        {has && (
          <span className="kt-cal-dots">
            {colors.map((c, i) => (
              <span key={i} className="kt-cal-dot" style={{ background: c }} />
            ))}
            {extra > 0 && <span className="kt-cal-more">+{extra}</span>}
          </span>
        )}
      </button>
    )
  }

  // 2026-08-10: kompakt módban a hónap végét üres cellákkal töltjük ki teljes
  // 6 hétre — így a rács magassága minden hónapban azonos (nincs ugrálás).
  if (compact) {
    for (let i = startDow + daysInMonth; i < COMPACT_CELLS; i++) {
      cells.push(<div key={`t${i}`} className="kt-cal-empty" />)
    }
  }

  return <div className={`kt-cal-grid${compact ? ' kt-cal--compact' : ''}`}>{cells}</div>
}
