'use client'

import { CAL_DAYS_HU, HU_MONTHS, progColor, progEmoji } from '@/lib/constants/dashboard'
import type { Program } from '@/lib/constants/dashboard'

interface ProgramCalendarProps {
  events: Program[]
  month: number
  year: number
  today: Date
  onDayClick: (day: number) => void
}

export function ProgramCalendar({ events, month, year, today, onDayClick }: ProgramCalendarProps) {
  const todayStr = today.toISOString().slice(0, 10)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let startDow = new Date(year, month, 1).getDay() - 1
  if (startDow < 0) startDow = 6

  // Események napokra bontva (többnapos programok kezelése)
  const dayEvents: Record<number, Program[]> = {}
  for (let d = 1; d <= daysInMonth; d++) dayEvents[d] = []
  events.forEach(e => {
    const sd = new Date(e.datum + 'T00:00:00')
    const ed = e.datum_vege ? new Date(e.datum_vege + 'T00:00:00') : sd
    for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1)) {
      if (d.getMonth() === month && d.getFullYear() === year) {
        dayEvents[d.getDate()]?.push(e)
      }
    }
  })

  const cells: React.ReactNode[] = []

  // Fejléc
  CAL_DAYS_HU.forEach(day => {
    cells.push(
      <div key={`h-${day}`} className="text-center text-[10px] font-bold text-slate-500 py-1">
        {day}
      </div>
    )
  })

  // Üres cellák a hónap elején
  for (let i = 0; i < startDow; i++) {
    cells.push(<div key={`e-${i}`} />)
  }

  // Napok
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const isToday = dateStr === todayStr
    const isPast = dateStr < todayStr
    const isSunday = new Date(dateStr + 'T00:00:00').getDay() === 0
    const evts = dayEvents[d] || []
    const hasEvents = evts.length > 0

    const tooltip = hasEvents
      ? `${HU_MONTHS[month]} ${d}. — ${evts.map(e => progEmoji(e) + ' ' + e.cim).join(', ')}`
      : `${HU_MONTHS[month]} ${d}.`

    // Színkódolt pontok (max 3)
    const uniqueColors = [...new Set(evts.map(e => progColor(e)))].slice(0, 3)

    cells.push(
      <div
        key={d}
        title={tooltip}
        onClick={() => onDayClick(d)}
        className={`relative flex flex-col items-center justify-center rounded-md cursor-pointer h-9 text-xs transition-colors ${
          isToday
            ? 'bg-green-100 ring-2 ring-green-500 font-bold'
            : isPast
              ? 'text-slate-400'
              : isSunday
                ? 'bg-red-50 text-red-600 font-semibold'
                : 'hover:bg-slate-100'
        } ${hasEvents ? 'font-semibold' : ''}`}
      >
        <span>{d}</span>
        {uniqueColors.length > 0 && (
          <div className="flex gap-0.5 mt-0.5">
            {uniqueColors.map((c, i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-7 gap-0.5">
      {cells}
    </div>
  )
}
