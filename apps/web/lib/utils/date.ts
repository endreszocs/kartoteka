import { HU_MONTHS, HU_DAYS } from '@/lib/constants/dashboard'

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Jó éjszakát!'
  if (h < 12) return 'Jó reggelt kívánunk!'
  if (h < 18) return 'Jó napot kívánunk!'
  return 'Jó estét kívánunk!'
}

export function formatHuDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return ''
  return `${dt.getFullYear()}. ${HU_MONTHS[dt.getMonth()]} ${dt.getDate()}.`
}

export function formatHuDateFull(d: Date): string {
  const dayName = HU_DAYS[d.getDay()]
  return `${d.getFullYear()}. ${HU_MONTHS[d.getMonth()]} ${d.getDate()}. — ${dayName}`
}

export function ageFromDate(dateStr: string | null): number | null {
  if (!dateStr) return null
  const today = new Date()
  const b = new Date(dateStr)
  if (isNaN(b.getTime())) return null
  let age = today.getFullYear() - b.getFullYear()
  const m = today.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--
  return age
}

export function weekBounds(today: Date): { start: string; end: string } {
  const d = new Date(today)
  // Hétfő = 1, Vasárnap = 0 → hétfővel kezdődő hét (magyar konvenció)
  const dayOfWeek = (d.getDay() + 6) % 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - dayOfWeek)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  }
}
