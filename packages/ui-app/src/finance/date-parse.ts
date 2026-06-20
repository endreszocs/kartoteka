/**
 * Rugalmas dátum-értelmező — a lelkész bármilyen formátumban beírhatja.
 *
 * Támogatott formátumok (példák):
 *   2026-01-04 · 2026.1.4 · 2026/01/04 · 2026.01.04.   (év elöl → Y-M-D)
 *   04.01.2026 · 4/1/2026                               (év hátul → D-M-Y, európai)
 *   2026 jan 4 · 4 ianuarie 2026 · 2026. január 4.      (hónapnévvel)
 *   4.1.26                                              (2 jegyű év → 20xx)
 *
 * Visszatérés: 'yyyy-mm-dd' vagy null (ha nem értelmezhető).
 */

// Rövid prefixek magyar + román hónapnevekhez (ékezet nélkül, prefix-egyezés).
const MONTHS: Record<string, number> = {
  jan: 1, ian: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  maj: 5, mai: 5,
  jun: 6, iun: 6,
  jul: 7, iul: 7,
  aug: 8,
  sze: 9, sep: 9,
  okt: 10, oct: 10,
  nov: 11, noi: 11,
  dec: 12,
}

function strip(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function build(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null
  // Valós nap-ellenőrzés
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${pad2(m)}-${pad2(d)}`
}

export function parseFlexibleDate(input: string): string | null {
  if (!input) return null
  const raw = input.trim()
  if (!raw) return null

  // Már szabványos ISO?
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw)
  if (iso) return build(+iso[1], +iso[2], +iso[3])

  // Elválasztó nélküli, csak számjegyek: 8 jegyű YYYYMMDD vagy 6 jegyű YYMMDD.
  const digitsOnly = raw.replace(/\D/g, '')
  if (/^\d+$/.test(raw)) {
    if (digitsOnly.length === 8) return build(+digitsOnly.slice(0, 4), +digitsOnly.slice(4, 6), +digitsOnly.slice(6, 8))
    if (digitsOnly.length === 6) return build(+digitsOnly.slice(0, 2), +digitsOnly.slice(2, 4), +digitsOnly.slice(4, 6))
  }

  const s = strip(raw)
  const thisYear = new Date().getFullYear()

  // Hónapnévvel: keressük a hónap-tokent
  const tokens = s.split(/[\s.,/-]+/).filter(Boolean)
  let monthFromName: number | null = null
  const numbers: number[] = []
  for (const t of tokens) {
    if (/^\d+$/.test(t)) { numbers.push(+t); continue }
    // hónapnév-egyezés (prefix alapon)
    const key = Object.keys(MONTHS).find((k) => t.startsWith(k) || k.startsWith(t))
    if (key) monthFromName = MONTHS[key]
  }

  if (monthFromName != null && numbers.length >= 1) {
    const year =
      numbers.find((n) => n >= 1000) ??
      numbers.find((n) => n > 31) ??
      (numbers.length >= 2 ? numbers[numbers.length - 1] : thisYear)
    const day = numbers.find((n) => n !== year && n >= 1 && n <= 31) ?? numbers[0]
    return build(year, monthFromName, day)
  }

  // Csak számok
  const nums = (s.match(/\d+/g) || []).map(Number)
  if (nums.length >= 3) {
    const [a, b, c] = nums
    // év elöl?
    if (a >= 1000) return build(a, b, c)
    // év hátul (európai D.M.Y)?
    if (c >= 1000 || c > 31) return build(c, b, a)
    // minden 2 jegyű → feltételezzük Y.M.D (magyar szokás), 2 jegyű év → 20xx
    return build(a, b, c)
  }
  // Két szám, év nélkül → IDEI év. Ha az egyik > 12, az a NAP; különben hó.nap (magyar szokás).
  if (nums.length === 2) {
    const [a, b] = nums
    if (a > 12 && b <= 12) return build(thisYear, b, a) // nap.hó
    if (b > 12 && a <= 12) return build(thisYear, a, b) // hó.nap
    return build(thisYear, a, b) // kétértelmű → hó.nap
  }

  return null
}
