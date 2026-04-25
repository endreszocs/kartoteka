/**
 * Dashboard adat-helperek a desktop home-page-hez.
 *
 * 2026-04-25 (Sprint B) — a webes /dashboard paritás közepes csoportja.
 * A `getLocalMembersOfOwnCongregation` által visszaadott `MemberLocalRow[]`-ből
 * JS-oldalon kalkulálja a demográfiai stat-okat és a közelgő születésnapokat.
 *
 * Miért JS-oldalon, miért nem új SQL?
 *  - A tag-lista általában <2000 sor — JS-oldali aggregáció <5 ms.
 *  - Egyszerűbb karbantartani: nincs új migráció, nincs új SQL trigger.
 *  - Konzisztens minden gyülekezet-szintű kalkulációval (M8 minta).
 */

import type { MemberLocalRow } from './sync'

// ─────────────────────────────────────────────────────────────────────────
// Demográfiai stat-ok — BottomStats props-hoz
// ─────────────────────────────────────────────────────────────────────────

export interface DemographicStats {
  men: number
  women: number
  childrenCount: number
  /** Egész szám évben. 0, ha nincs adat. */
  avgAge: number
  /** Presbiterek száma — `member_status = 'presbiter'` szűrés. */
  presbCount: number
}

/**
 * Demográfiai stat-ok kalkulálása a tag-listából.
 *
 * Csak az élő (`meghalt = 0`) tagokat számoljuk — a `getLocalMembersOfOwnCongregation`
 * default-ban már így szűr, de itt is biztosítjuk a robusztusságért.
 */
export function calculateDemographicStats(members: MemberLocalRow[]): DemographicStats {
  const living = members.filter((m) => !m.meghalt)

  let men = 0
  let women = 0
  let childrenCount = 0
  let presbCount = 0
  let ageSum = 0
  let ageCount = 0

  for (const m of living) {
    if (m.ferfi) men++
    else women++

    const age = ageFromDateString(m.sz_datum)
    if (age !== null) {
      ageSum += age
      ageCount++
      if (age < 18) childrenCount++
    }

    if (m.member_status === 'presbiter') presbCount++
  }

  return {
    men,
    women,
    childrenCount,
    avgAge: ageCount > 0 ? Math.round(ageSum / ageCount) : 0,
    presbCount,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Közelgő születésnapok
// ─────────────────────────────────────────────────────────────────────────

export interface BirthdayEntry {
  /** A tag UUID-ja — kattintáskor a részlet-modal nyithatja. */
  id: string
  /** Megjelenítendő név (csaladnév + keresztnév). */
  fullName: string
  /** A születési dátum, ISO formátumban (YYYY-MM-DD). */
  birthDate: string
  /** A betöltött kor a következő születésnapon. */
  turningAge: number
  /** Hány nap múlva van a születésnap. 0 = ma. */
  daysUntil: number
}

/**
 * A következő `daysAhead` napra eső születésnapok kigyűjtése.
 *
 * @param members - A tag-lista (élő, ahogy a `getLocalMembersOfOwnCongregation` adja)
 * @param daysAhead - Hány napra előre nézzünk (alapértelmezett: 14)
 * @returns Sorba rendezve a `daysUntil` szerint (0 = ma)
 */
export function extractUpcomingBirthdays(
  members: MemberLocalRow[],
  daysAhead = 14,
): BirthdayEntry[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayYear = today.getFullYear()

  const result: BirthdayEntry[] = []

  for (const m of members) {
    if (m.meghalt) continue
    if (!m.sz_datum) continue

    const birth = parseISODate(m.sz_datum)
    if (!birth) continue

    // Idei születésnap dátuma
    const thisYearBirthday = new Date(todayYear, birth.getMonth(), birth.getDate())
    let daysUntil = Math.round(
      (thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    )

    // Ha az idei már elmúlt, jövő évit nézzünk
    if (daysUntil < 0) {
      const nextYearBirthday = new Date(todayYear + 1, birth.getMonth(), birth.getDate())
      daysUntil = Math.round(
        (nextYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      )
    }

    if (daysUntil > daysAhead) continue

    // Kor a következő születésnapon
    const turningAge = todayYear - birth.getFullYear() + (daysUntil < 0 ? 0 : daysUntil >= 0 && thisYearBirthday < today ? 1 : 0)
    // Egyszerűsített: a kort a következő szülinapra számoljuk
    const refYear =
      thisYearBirthday >= today ? todayYear : todayYear + 1
    const ageOnNextBirthday = refYear - birth.getFullYear()

    const fullName = formatMemberFullName(m)
    result.push({
      id: String(m.id),
      fullName,
      birthDate: m.sz_datum,
      turningAge: ageOnNextBirthday > 0 ? ageOnNextBirthday : turningAge,
      daysUntil,
    })
  }

  return result.sort((a, b) => a.daysUntil - b.daysUntil)
}

// ─────────────────────────────────────────────────────────────────────────
// Belső helperek
// ─────────────────────────────────────────────────────────────────────────

function ageFromDateString(d: string | null): number | null {
  if (!d) return null
  const birth = parseISODate(d)
  if (!birth) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age >= 0 && age <= 130 ? age : null
}

function parseISODate(d: string): Date | null {
  // YYYY-MM-DD vagy ISO timestamp első 10 karaktere
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const [, yyyy, mm, dd] = m
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  return isNaN(date.getTime()) ? null : date
}

function formatMemberFullName(m: MemberLocalRow): string {
  const parts: string[] = []
  if (m.csaladnev) parts.push(m.csaladnev)
  if (m.k_nev) parts.push(m.k_nev)
  if (m.ferjk_nev && m.ferjk_nev !== m.csaladnev) {
    parts.push(`(${m.ferjk_nev})`)
  }
  return parts.join(' ').trim() || '(név nélkül)'
}

// ─────────────────────────────────────────────────────────────────────────
// Korelosztás (Age distribution)
// ─────────────────────────────────────────────────────────────────────────

export interface AgeBucket {
  label: string
  /** Inkluzív minimum kor. */
  min: number
  /** Inkluzív maximum kor (Infinity a 70+ csoportnak). */
  max: number
  count: number
}

/**
 * 5-csoportos korelosztás a tag-listából.
 *
 * Csoportok (egyházi-pasztorális logika):
 *   - 0-14:  Gyermekek (iskoláskor és alatt)
 *   - 15-29: Fiatalok (konfirmáció utáni nemzedék)
 *   - 30-49: Felnőttek (keresőkorúak, családalapítók)
 *   - 50-69: Érettek (érett szolgálók)
 *   - 70+:   Idősek (szeniorok)
 */
export function calculateAgeDistribution(members: MemberLocalRow[]): AgeBucket[] {
  const buckets: AgeBucket[] = [
    { label: '0–14 (gyermekek)', min: 0, max: 14, count: 0 },
    { label: '15–29 (fiatalok)', min: 15, max: 29, count: 0 },
    { label: '30–49 (felnőttek)', min: 30, max: 49, count: 0 },
    { label: '50–69 (érettek)', min: 50, max: 69, count: 0 },
    { label: '70+ (idősek)', min: 70, max: Infinity, count: 0 },
  ]

  for (const m of members) {
    if (m.meghalt) continue
    const age = ageFromDateString(m.sz_datum)
    if (age === null) continue

    for (const b of buckets) {
      if (age >= b.min && age <= b.max) {
        b.count += 1
        break
      }
    }
  }

  return buckets
}
