import { HU_MONTHS_SHORT, HU_DAYS_SHORT } from '@/lib/constants/dashboard'
import type { Program } from '@/lib/constants/dashboard'

// ── Naptár-/agenda dátum-segédek (Claude Design widget, 2026-06-07) ──
// A dátumokat 'YYYY-MM-DD' szövegként kezeljük, ahol lehet (TZ-független).

export function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseYMD(s: string): Date {
  return new Date(s + 'T00:00:00')
}

/** Érint-e egy program egy adott (y,m,d) napot (többnapos kezelés). */
export function eventOnDay(p: Program, y: number, m: number, d: number): boolean {
  const cell = ymd(y, m, d)
  const start = p.datum
  const end = p.datum_vege && p.datum_vege !== p.datum ? p.datum_vege : p.datum
  return cell >= start && cell <= end
}

/** Egy nap eseményei, idő szerint rendezve. */
export function eventsForDay(programs: Program[], y: number, m: number, d: number): Program[] {
  return programs
    .filter((p) => eventOnDay(p, y, m, d))
    .sort((a, b) => {
      const ta = a.ido_kezdes || '99:99'
      const tb = b.ido_kezdes || '99:99'
      if (ta !== tb) return ta.localeCompare(tb)
      return a.cim.localeCompare(b.cim, 'hu')
    })
}

/** Idő-tartomány felirat: „10:00–11:15" vagy „10:00". */
export function fmtTime(p: Program): string | null {
  if (!p.ido_kezdes) return null
  const s = p.ido_kezdes.slice(0, 5)
  if (p.ido_befejezes) return `${s}–${p.ido_befejezes.slice(0, 5)}`
  return s
}

/** Dátum-tartomány felirat: „Jún 14. (szom)" vagy „Jún 14–16." / „Jún 28. – Júl 2." */
export function fmtDateRange(p: Program): string {
  const d1 = parseYMD(p.datum)
  if (p.datum_vege && p.datum_vege !== p.datum) {
    const d2 = parseYMD(p.datum_vege)
    if (d1.getMonth() === d2.getMonth()) {
      return `${HU_MONTHS_SHORT[d1.getMonth()]} ${d1.getDate()}–${d2.getDate()}.`
    }
    return `${HU_MONTHS_SHORT[d1.getMonth()]} ${d1.getDate()}. – ${HU_MONTHS_SHORT[d2.getMonth()]} ${d2.getDate()}.`
  }
  return `${HU_MONTHS_SHORT[d1.getMonth()]} ${d1.getDate()}. (${HU_DAYS_SHORT[d1.getDay()]})`
}
