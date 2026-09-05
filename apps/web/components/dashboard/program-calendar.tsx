'use client'

// ── Hónap-naptár (navigátor) — Claude Design widget, 2026-06-07 ──
// A napra kattintás SZŰRI az agendát arra a napra (nem nyit azonnal új programot).
import { CAL_DAYS_HU, HU_MONTHS, progColor } from '@/lib/constants/dashboard'
import type { Program } from '@/lib/constants/dashboard'
import { ymd, eventsForDay } from '@/lib/utils/program-day'
// 2026-08-26 (5. kör): a képernyő-naptár eddig SEMMILYEN ünnepet nem mutatott
// (csak a nyomtatás és az ICS) — a kanonikus ünneplistából jelezzük őket.
import { getUnnepnapTerkep } from '@/lib/utils/reformed-holidays'
import type { RetegPotty } from '@/lib/calendar/naptar-retegek-osszefesules'

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
  /**
   * 2026-09-05: a naptár-RÉTEGEK pöttyei naponként (anyakönyvi tény, születésnap,
   * névnap) — a `retegPottyokNaponkent` tiszta függvény adja, a kapcsolók és a
   * dedupe már érvényesítve. Hiányzó térkép = csak a programok.
   */
  retegPottyok?: Map<string, RetegPotty[]> | null
}

/** Egy teljes hónapnézet 6 hét × 7 nap = 42 cellából áll. */
const COMPACT_CELLS = 42

/** Egy pötty a cellában — a program a típus színét kapja, a réteg CSS-osztályt (téma-token). */
type Potty = { szin: string | null; osztaly: string; cim: string }

export function ProgramCalendar({
  programs, month, year, today, selectedDay, onSelectDay, compact = false, retegPottyok,
}: ProgramCalendarProps) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let startDow = new Date(year, month, 1).getDay() - 1 // hétfő-kezdés
  if (startDow < 0) startDow = 6
  const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate())
  // 2026-08-10: a kis kockába csak 2 pötty fér el olvashatóan, a többi „+N"
  const maxDots = compact ? 2 : 3
  const unnepek = getUnnepnapTerkep(year)

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
    const retegek = retegPottyok?.get(dateStr) ?? []
    const selected = selectedDay === d
    const unnepNev = unnepek.get(dateStr) || null

    // A pöttyök sorrendje: programok, majd a rétegek (anyakönyv → születésnap → névnap).
    const osszes: Potty[] = [
      ...evts.map((e) => ({ szin: progColor(e), osztaly: '', cim: e.cim })),
      ...retegek.map((r) => ({ szin: r.szin, osztaly: ` kt-cal-dot--${r.reteg}`, cim: r.cim })),
    ]
    const has = osszes.length > 0
    const lathato = osszes.slice(0, maxDots)
    const extra = osszes.length - lathato.length

    let cls = 'kt-cal-day'
    if (selected) cls += ' is-selected'
    if (isToday) cls += ' is-today'
    if (isSunday) cls += ' is-sunday'
    if (isPast && !isToday) cls += ' is-past'
    if (has) cls += ' has-events'

    const retegSzoveg = retegek.length > 0
      ? `${retegek.length} köszöntő/anyakönyvi esemény`
      : null
    const cimResz = [
      unnepNev ? `✝ ${unnepNev}` : null,
      evts.length > 0 ? `${evts.length} program` : null,
      retegSzoveg,
    ]
      .filter(Boolean)
      .join(' — ')

    cells.push(
      <button
        key={d}
        type="button"
        className={cls}
        onClick={() => onSelectDay(d)}
        title={`${HU_MONTHS[month]} ${d}.${cimResz ? ` — ${cimResz}` : ''}`}
        aria-pressed={selected}
        aria-label={`${HU_MONTHS[month]} ${d}.${unnepNev ? `, ${unnepNev}` : ''}${evts.length > 0 ? `, ${evts.length} program` : ''}${retegSzoveg ? `, ${retegSzoveg}` : ''}`}
      >
        <span className="kt-cal-num" style={unnepNev ? { color: '#b45309', fontWeight: 700 } : undefined}>
          {d}
          {unnepNev && <span aria-hidden style={{ fontSize: 8, lineHeight: 1, display: 'block' }}>✝</span>}
        </span>
        {has && (
          <span className="kt-cal-dots">
            {lathato.map((p, i) => (
              // A kulcs a pozíció (a pöttyök sorrendje determinisztikus, tartalom nélküli jel)
              <span key={i} className={`kt-cal-dot${p.osztaly}`} style={p.szin ? { background: p.szin } : undefined} />
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
