/**
 * ICS (iCalendar) feed-építő a gyülekezeti naptárhoz (2026-08-02, PR-20).
 *
 * A /api/calendar/<token> route használja: a rögzített gyülekezeti programok
 * (ismétlődés-kibontással, az app saját megjelenítésével BIT-AZONOS alkalmak)
 * + a református ünnepek egész napos eseményként. A Google/Apple/Outlook
 * naptár az URL-t előfizetésként kezeli és időnként automatikusan frissíti.
 *
 * Technika:
 *  - Az ismétlődő sorokat NEM RRULE-ként, hanem kibontott, önálló VEVENT-ekként
 *    adjuk ki — így pixelre ugyanazok az alkalmak látszanak, mint az appban
 *    (a havi hónapvég-kezelés és az év-horizont sem térhet el).
 *  - Az idők zóna-naívak a DB-ben → TZID=Europe/Bucharest + beágyazott
 *    VTIMEZONE (EET/EEST), így télen-nyáron helyes a megjelenés.
 *  - A sor-hajtás (RFC 5545: 75 oktett) a hosszú leírásokra is le van kezelve.
 */

import type { Program } from '@/lib/constants/dashboard'
import { progEmoji, progLabel } from '@/lib/constants/dashboard'
import { expandProgramOccurrences } from '@/lib/utils/program-recurrence'
import { getReformedHolidaysForYear } from '@/lib/utils/reformed-holidays'

const CRLF = '\r\n'

/** RFC 5545 szöveg-escape: backslash, pontosvessző, vessző, sortörés. */
function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Egy Unicode kódpont UTF-8 hossza oktettekben. */
function utf8Len(cp: number): number {
  return cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4
}

/**
 * RFC 5545 sor-hajtás: max 75 OKTETT soronként (nem karakter!), folytatás
 * szóközzel. Kódpontonként lépünk (for..of), így az ékezetes magyar szöveg és
 * az emoji surrogate-párja sosem törik ketté (2026-08-02, review-fix).
 */
function fold(line: string): string {
  const parts: string[] = []
  let cur = ''
  let bytes = 0
  let first = true
  for (const ch of line) {
    const len = utf8Len(ch.codePointAt(0)!)
    const limit = first ? 75 : 74 // a folytatás-sor 1 oktettet veszít a vezető szóközre
    if (bytes + len > limit) {
      parts.push((first ? '' : ' ') + cur)
      first = false
      cur = ch
      bytes = len
    } else {
      cur += ch
      bytes += len
    }
  }
  if (cur.length > 0 || parts.length === 0) parts.push((first ? '' : ' ') + cur)
  return parts.join(CRLF)
}

/** 'YYYY-MM-DD' → 'YYYYMMDD' */
function icsDate(d: string): string {
  return d.replace(/-/g, '')
}

/** 'YYYY-MM-DD' + 'HH:MM[:SS]' → 'YYYYMMDDTHHMMSS' (zóna-naív, TZID-vel adjuk ki) */
function icsDateTime(d: string, t: string): string {
  const time = t.length >= 8 ? t.slice(0, 8) : `${t.slice(0, 5)}:00`
  return `${icsDate(d)}T${time.replace(/:/g, '')}`
}

/** 'YYYY-MM-DD' + n nap → 'YYYYMMDD' (egész napos DTEND exkluzív végéhez) */
function icsAddDays(d: string, days: number): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day + days)).toISOString().slice(0, 10).replace(/-/g, '')
}
const icsNextDay = (d: string) => icsAddDays(d, 1)

/** 'YYYY-MM-DD' → a következő nap 'YYYY-MM-DD' (kötőjeles) */
function nextDayIso(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10)
}

// Európa/Bukarest VTIMEZONE (EET +02 / EEST +03, EU-s DST-szabályok)
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Bucharest',
  'BEGIN:STANDARD',
  'DTSTART:19971026T040000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0200',
  'TZNAME:EET',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19970330T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0300',
  'TZNAME:EEST',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
]

/** A feed-RPC a `leiras`-t is adja (a webes Program-típusban nincs benne —
 *  azt csak a desktop írja/olvassa). */
export type CalendarFeedProgram = Program & { leiras?: string | null }

export interface BuildIcsInput {
  congregationName: string
  programs: CalendarFeedProgram[]
  /** A feed ablaka: ettől az évtől eddig az évig (mindkettő inkluzív) */
  fromYear: number
  toYear: number
  /** Református ünnepek egész napos eseményként (alap: igen) */
  includeHolidays: boolean
}

const PRIORITY_LABELS: Record<string, string> = {
  alacsony: 'alacsony',
  normal: 'normál',
  fontos: 'fontos',
  kiemelt: 'kiemelt',
}

export function buildCalendarIcs(input: BuildIcsInput): string {
  const { congregationName, programs, fromYear, toYear, includeHolidays } = input
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kartoteka//Gyulekezeti naptar//HU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${esc(congregationName)} — gyülekezeti naptár`),
    'X-WR-TIMEZONE:Europe/Bucharest',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...VTIMEZONE,
  ]

  const windowStart = `${fromYear}-01-01`
  const windowEnd = `${toYear}-12-31`
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'

  // ── Programok (ismétlődés kibontva, az app-pal azonos alkalmak) ──
  const occurrences = (expandProgramOccurrences(programs, toYear) as CalendarFeedProgram[])
    .filter((p) => p.datum >= windowStart && p.datum <= windowEnd)

  for (const p of occurrences) {
    const emoji = progEmoji(p)
    const label = progLabel(p)
    const descParts = [
      p.leiras?.trim() || null,
      p.megjegyzes?.trim() || null,
      `Típus: ${label}`,
      p.prioritas && p.prioritas !== 'normal' ? `Prioritás: ${PRIORITY_LABELS[p.prioritas] ?? p.prioritas}` : null,
      p.ismetlodes_tipus ? `Ismétlődés: ${p.ismetlodes_tipus === 'heti' ? 'hetente' : p.ismetlodes_tipus === 'ketheti' ? 'kéthetente' : 'havonta'}` : null,
      `Forrás: Kartotéka — ${congregationName}`,
    ].filter(Boolean) as string[]

    lines.push('BEGIN:VEVENT')
    lines.push(fold(`UID:kartoteka-prog-${p.id}-${icsDate(p.datum)}@kartoteka.app`))
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(fold(`SUMMARY:${esc(`${emoji} ${p.cim}`)}`))
    if (p.ido_kezdes) {
      lines.push(`DTSTART;TZID=Europe/Bucharest:${icsDateTime(p.datum, p.ido_kezdes)}`)
      // 2026-08-02 (review-fixek): (a) záróidő nélkül 1 óra alapértelmezett
      // hossz ÉJFÉL-ÁTFORDULÁSSAL (23:30 → másnap 00:30, nem 23:30); (b) ha a
      // záróidő KORÁBBI a kezdésnél és nincs külön záró nap → éjszakába nyúló
      // alkalom, a vége másnapra esik.
      let endDate = p.datum_vege && p.datum_vege > p.datum ? p.datum_vege : p.datum
      let endTime: string
      if (p.ido_befejezes) {
        endTime = p.ido_befejezes
        if (endDate === p.datum && endTime.slice(0, 5) <= p.ido_kezdes.slice(0, 5)) {
          endDate = nextDayIso(endDate)
        }
      } else {
        const [h, m] = p.ido_kezdes.split(':').map(Number)
        if (h + 1 >= 24) {
          endDate = nextDayIso(endDate)
          endTime = `00:${String(m).padStart(2, '0')}`
        } else {
          endTime = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        }
      }
      lines.push(`DTEND;TZID=Europe/Bucharest:${icsDateTime(endDate, endTime)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(p.datum)}`)
      const endExclusive = p.datum_vege && p.datum_vege > p.datum ? icsNextDay(p.datum_vege) : icsNextDay(p.datum)
      lines.push(`DTEND;VALUE=DATE:${endExclusive}`)
    }
    if (p.helyszin?.trim()) lines.push(fold(`LOCATION:${esc(p.helyszin.trim())}`))
    lines.push(fold(`DESCRIPTION:${esc(descParts.join('\n'))}`))
    lines.push(fold(`CATEGORIES:${esc(label)}`))
    lines.push('END:VEVENT')
  }

  // ── Református ünnepek (egész napos) ──
  if (includeHolidays) {
    for (let y = fromYear; y <= toYear; y++) {
      for (const h of getReformedHolidaysForYear(y)) {
        lines.push('BEGIN:VEVENT')
        lines.push(fold(`UID:kartoteka-unnep-${icsDate(h.date)}-${esc(h.name).replace(/[^\p{L}\p{N}]+/gu, '-')}@kartoteka.app`))
        lines.push(`DTSTAMP:${dtstamp}`)
        lines.push(fold(`SUMMARY:${esc(`✝ ${h.name}`)}`))
        lines.push(`DTSTART;VALUE=DATE:${icsDate(h.date)}`)
        // 2026-08-02 (review): a kétnapos ünnepek (húsvét/pünkösd/karácsony)
        // mindkét napja — a durationDays a DTEND exkluzív végét tolja
        lines.push(`DTEND;VALUE=DATE:${icsAddDays(h.date, h.durationDays ?? 1)}`)
        lines.push('TRANSP:TRANSPARENT')
        lines.push(fold(`DESCRIPTION:${esc(`Református ünnep — Kartotéka naptár (${congregationName})`)}`))
        lines.push('CATEGORIES:Ünnep')
        lines.push('END:VEVENT')
      }
    }
  }

  lines.push('END:VCALENDAR')
  return lines.join(CRLF) + CRLF
}
