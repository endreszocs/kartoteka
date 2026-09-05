import { HU_MONTHS, HU_DAYS } from '@/lib/constants/dashboard'

const REGISTRY_TIME_ZONE = 'Europe/Bucharest'
const registryMonthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'numeric',
  timeZone: REGISTRY_TIME_ZONE,
})

export function currentRegistryMonth(date = new Date()): number {
  return Number(registryMonthFormatter.format(date))
}

export function monthFromIsoDate(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^\d{4}-(\d{2})-\d{2}/.exec(value)
  if (!match) return null

  const month = Number(match[1])
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Jó éjszakát!'
  if (h < 12) return 'Jó reggelt kívánunk!'
  if (h < 18) return 'Jó napot kívánunk!'
  return 'Jó estét kívánunk!'
}

/**
 * ⚠️ TZ-ÉRZÉKENY: egy `'YYYY-MM-DD'` sztringből `new Date()` UTC-éjfelet csinál,
 * amit a helyi getterek a FUTTATÓ gép zónájában olvasnak vissza — UTC-től
 * nyugatra ez az ELŐZŐ nap. DATE-oszlop (születésnap, szolgálat kezdete)
 * kiírására a `formatDateOnlyHu`, időbélyegre a `formatTimestampHu` való.
 * Ez a függvény `Date`-példányra és a régi hívóknak marad.
 */
export function formatHuDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return ''
  return `${dt.getFullYear()}. ${HU_MONTHS[dt.getMonth()]} ${dt.getDate()}.`
}

// ── 2026-09-05 (profil-kör D8): EGY formázó-pár a profil-felületnek ────────
//
// MIÉRT: a profil-dialógus egy nézeten belül négyféleképpen írt dátumot
// (rövid „2019. 09. 01." és hosszú „2026. augusztus 14." vegyesen), és a
// DATE-mezőket `new Date('YYYY-MM-DD')`-vel — TZ-érzékenyen — formázta.
// A két függvény kimenete AZONOS ALAKÚ („2019. szeptember 1."), csak a
// bemenet természete más: naptári nap (string-split, zóna nélkül) ⇄ időbélyeg
// (Europe/Bucharest szerinti naptári napra vetítve).

const BUKARESTI_ZONA = 'Europe/Bucharest'

/** Kisbetűs magyar hónapnév — a dátumban a magyar helyesírás kisbetűt ír. */
const HU_HONAP_KISBETUS = HU_MONTHS.map((m) => m.toLowerCase())

/**
 * NAPTÁRI NAP (`'YYYY-MM-DD'`, DATE-oszlop) → „2019. szeptember 1."
 * String-split, `Date`-példány NÉLKÜL — így a kliens és a szerver zónájától
 * függetlenül ugyanazt a napot írja. Egy `'YYYY-MM-DDTHH:mm…'` bemenetből is
 * csak a nap-részt veszi (a zóna-részt szándékosan NEM értelmezi — időbélyegre
 * a `formatTimestampHu` való). Érvénytelen bemenetre üres sztring.
 */
export function formatDateOnlyHu(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (!m) return ''
  const ev = m[1]
  const ho = Number(m[2])
  const nap = Number(m[3])
  if (ho < 1 || ho > 12 || nap < 1 || nap > 31) return ''
  return `${ev}. ${HU_HONAP_KISBETUS[ho - 1]} ${nap}.`
}

/**
 * IDŐBÉLYEG (timestamptz ISO) → „2026. augusztus 14." Europe/Bucharest szerint,
 * opcionálisan „ · 15:32"-vel. A naptári napot NEM a futtató gép zónájában
 * számoljuk (a Railway-konténer UTC-ben jár, a lelkész gépe Bukarestben), hanem
 * explicit zónával — kézi óra-eltolás TILOS (nyári/téli időszámítás).
 */
export function formatTimestampHu(
  iso: string | Date | null | undefined,
  opts: { time?: boolean } = {},
): string {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUKARESTI_ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  const nap = formatDateOnlyHu(`${get('year')}-${get('month')}-${get('day')}`)
  if (!nap) return ''
  return opts.time ? `${nap} ${get('hour')}:${get('minute')}` : nap
}

/**
 * Két időbélyeg UGYANARRA a bukaresti naptári napra esik-e. A profil
 * „örökölt szerepkör" jelzéséhez: a Fázis-1 backfill az `approved_at`-ot a
 * fiók `created_at`-jára állította, ezért az „X óta" a fiók létrejöttét
 * mutatná, nem a szerep jóváhagyását.
 */
export function ugyanazABukarestiNap(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const na = formatTimestampHu(a)
  const nb = formatTimestampHu(b)
  return Boolean(na) && na === nb
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
