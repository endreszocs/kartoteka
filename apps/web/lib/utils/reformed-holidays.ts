/**
 * Erdélyi református egyház ünnepei — köszöntés-generálás a Dashboard hero-hoz.
 *
 * Fix ünnepek: újév, reformáció, karácsony.
 * Mozgó ünnepek: virágvasárnap, nagypéntek, húsvét, mennybemenetel, pünkösd.
 *
 * A húsvét dátumát a Gauss-féle algoritmussal számoljuk (nyugati / gergely-naptár).
 * Az erdélyi református egyház a nyugati húsvétot ünnepli (szemben a keleti
 * ortodox havi eltéréssel).
 */

export interface HolidayInfo {
  /** A konkrét dátum (YYYY-MM-DD) */
  date: string
  /** Az ünnep rövid neve */
  name: string
  /** Az üdvözlő szöveg sablonja — {name} helyére a keresztnév kerül */
  greetingTemplate: string
  /** Mennyi napig tart a köszöntés (alapértelmezett: 1) */
  durationDays?: number
}

/**
 * Húsvét dátumának kiszámítása a Gauss-Butcher algoritmussal.
 * A gregorián húsvét.
 */
export function getEasterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

/**
 * YYYY-MM-DD formátumú dátum-string a Date objektumból (helyi idő).
 */
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Napok hozzáadása egy dátumhoz.
 */
function addDays(d: Date, days: number): Date {
  const result = new Date(d)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Visszaadja az adott évre vonatkozó összes református ünnep listáját.
 */
export function getReformedHolidaysForYear(year: number): HolidayInfo[] {
  const easter = getEasterDate(year)

  return [
    // ─── FIX ÜNNEPEK ───
    {
      date: `${year}-01-01`,
      name: 'Újév',
      greetingTemplate: 'Boldog Új Évet, {name}!',
    },
    {
      date: `${year}-10-31`,
      name: 'Reformáció napja',
      greetingTemplate: 'Áldott Reformáció Napját, {name}!',
    },
    {
      date: `${year}-12-24`,
      name: 'Szenteste',
      greetingTemplate: 'Áldott Szentestét, {name}!',
    },
    {
      date: `${year}-12-25`,
      name: 'Karácsony',
      greetingTemplate: 'Áldott Karácsonyt, {name}!',
      durationDays: 2, // 25. és 26. is karácsony
    },
    // ─── MOZGÓ (HÚSVÉTHOZ KÖTÖTT) ───
    {
      date: formatDate(addDays(easter, -7)),
      name: 'Virágvasárnap',
      greetingTemplate: 'Áldott Virágvasárnapot, {name}!',
    },
    {
      date: formatDate(addDays(easter, -2)),
      name: 'Nagypéntek',
      greetingTemplate: 'Áldott Nagypénteket, {name}!',
    },
    {
      date: formatDate(easter),
      name: 'Húsvét',
      greetingTemplate: 'Áldott Húsvéti Ünnepeket, {name}!',
      durationDays: 2, // Húsvétvasárnap + Húsvéthétfő
    },
    {
      date: formatDate(addDays(easter, 39)),
      name: 'Áldozócsütörtök (Mennybemenetel)',
      greetingTemplate: 'Áldott Mennybemenetel Ünnepét, {name}!',
    },
    {
      date: formatDate(addDays(easter, 49)),
      name: 'Pünkösd',
      greetingTemplate: 'Áldott Pünkösdi Ünnepeket, {name}!',
      durationDays: 2, // Pünkösdvasárnap + Pünkösdhétfő
    },
  ]
}

/**
 * 2026-08-26 (5. kör): a naptár-fogyasztók (képernyő-rács, éves terv
 * nyomtatás, ICS) KANONIKUS, naponkénti ünneplistája — a többnapos ünnepek
 * napjai SAJÁT NÉVVEL (Húsvéthétfő, Pünkösdhétfő, Karácsony 2. napja).
 *
 * MIÉRT: eddig HÁROM, egymásnak részben ellentmondó ünnep-forrás élt a
 * kódban (ez a modul, az annual-plan-print saját húsvét-számítása és listája,
 * ill. az ICS a durationDays-t bontotta) — a nyomtatott éves terv és a feed
 * MÁS ünnepeket mutatott. Mostantól minden fogyasztó EZT a listát használja;
 * a köszöntés-logika (getHolidayForDate) viselkedése változatlan.
 */
export interface UnnepNap {
  /** YYYY-MM-DD */
  date: string
  name: string
}

export function getUnnepnapokForYear(year: number): UnnepNap[] {
  const easter = getEasterDate(year)
  const e = (days: number) => formatDate(addDays(easter, days))
  return [
    { date: `${year}-01-01`, name: 'Újév' },
    { date: e(-7), name: 'Virágvasárnap' },
    { date: e(-2), name: 'Nagypéntek' },
    { date: e(0), name: 'Húsvét' },
    { date: e(1), name: 'Húsvéthétfő' },
    { date: e(39), name: 'Áldozócsütörtök (Mennybemenetel)' },
    { date: e(49), name: 'Pünkösd' },
    { date: e(50), name: 'Pünkösdhétfő' },
    { date: `${year}-10-31`, name: 'Reformáció napja' },
    { date: `${year}-12-24`, name: 'Szenteste' },
    { date: `${year}-12-25`, name: 'Karácsony' },
    { date: `${year}-12-26`, name: 'Karácsony 2. napja' },
  ]
}

/** Gyors napi kikeresés a képernyő-naptárhoz: 'YYYY-MM-DD' → ünnepnév. */
export function getUnnepnapTerkep(year: number): Map<string, string> {
  return new Map(getUnnepnapokForYear(year).map(u => [u.date, u.name]))
}

/**
 * Ha a megadott dátum ünnep — visszaadja az info-t.
 * Figyelembe veszi a durationDays-t (pl. karácsony 25-26, húsvét 2 nap).
 */
export function getHolidayForDate(date: Date): HolidayInfo | null {
  const year = date.getFullYear()
  const target = formatDate(date)
  const holidays = getReformedHolidaysForYear(year)

  for (const holiday of holidays) {
    const duration = holiday.durationDays ?? 1
    const startDate = new Date(holiday.date + 'T00:00:00')
    const endDate = addDays(startDate, duration - 1)
    const targetDate = new Date(target + 'T00:00:00')
    if (targetDate >= startDate && targetDate <= endDate) {
      return holiday
    }
  }
  return null
}

/**
 * Az aktuális órához kötött napszak üdvözlés.
 * Reggel / nappal / este / éjszaka.
 */
export function getTimeOfDayGreetingTemplate(hour: number): string {
  if (hour < 6) return 'Jó éjszakát, {name}!'
  if (hour < 12) return 'Jó reggelt, {name}!'
  if (hour < 18) return 'Jó napot, {name}!'
  return 'Jó estét, {name}!'
}

/**
 * A fő kombinált üdvözlés — ünnep prioritás, különben napszak.
 *
 * Példák:
 *   - 2026-04-05 09:00, firstName="Endre" → "Áldott Virágvasárnapot, Endre!"
 *   - 2026-03-15 15:00, firstName="Endre" → "Jó napot, Endre!"
 *   - 2026-12-25 10:00, firstName="Endre" → "Áldott Karácsonyt, Endre!"
 */
export function getPersonalizedGreeting(firstName: string, date: Date = new Date()): {
  text: string
  isHoliday: boolean
  holidayName: string | null
} {
  const holiday = getHolidayForDate(date)
  if (holiday) {
    return {
      text: holiday.greetingTemplate.replace('{name}', firstName || 'Kedves Testvér'),
      isHoliday: true,
      holidayName: holiday.name,
    }
  }

  const template = getTimeOfDayGreetingTemplate(date.getHours())
  return {
    text: template.replace('{name}', firstName || 'Kedves Testvér'),
    isHoliday: false,
    holidayName: null,
  }
}

/**
 * Kivonja a keresztnevet a teljes magyar névből.
 * Magyar sorrend: "Szőcs Endre" → "Endre" (utolsó szó).
 * Ha csak egy szó van, azt adja vissza.
 */
export function extractFirstName(fullName: string | null | undefined): string {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 0) return ''
  return parts[parts.length - 1] // utolsó szó = keresztnév (magyar sorrend)
}
