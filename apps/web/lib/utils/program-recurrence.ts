import type { Program } from '@/lib/constants/dashboard'

/**
 * Ismétlődő gyülekezeti programok feloldása (2026-06-07).
 *
 * A `gyulekezeti_programok` táblában egy ismétlődő program EGYETLEN sorként él
 * (`ismetlodes_tipus` = 'heti' | 'ketheti' | 'havi'). Korábban ezt az
 * információt sehol nem oldottuk fel: egy „Heti bibliaóra" csak a kezdődátumon
 * jelent meg. Ez a segédfüggvény a megjelenítéshez (naptár, lista, nyomtatás)
 * virtuálisan kibontja az ismétlődő sorokat az adott naptári alkalmakra.
 *
 * Fontos elvek:
 *  - A visszaadott alkalmak megtartják a valódi adatbázis-`id`-t, így a
 *    szerkesztés / törlés / „teljesítve" továbbra is a sorozat egészére hat.
 *    (React-kulcsként ezért `id`+`datum` kombinációt kell használni.)
 *  - Az ismétlődés horizontja a kezdő ÉV vége (`YYYY-12-31`). A programokat
 *    amúgy is évenként töltjük be, így ez fedi a tényleges használatot
 *    (egy adott év heti bibliaórájának megtervezése). Évhatáron túli,
 *    „örök" ismétlődés nincs (nincs hozzá záró-dátum mező sem).
 *  - Többnapos ismétlődő program esetén a `datum_vege` minden alkalomnál
 *    ugyanannyi nappal tolódik, mint az eredeti hossz.
 */

const STEP_DAYS: Record<string, number> = { heti: 7, ketheti: 14 }

/** Védőkorlát elszabadult ciklus ellen (heti × 1 év ≈ 53). */
const MAX_OCCURRENCES = 120

/** 'YYYY-MM-DD' → n nappal eltolva, 'YYYY-MM-DD' (UTC-matek, TZ-független). */
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' → n hónappal eltolva, a hónap végét tisztelve (jan 31 → feb 28/29). */
function addMonths(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, 1))
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()
  dt.setUTCDate(Math.min(d, lastDay))
  return dt.toISOString().slice(0, 10)
}

/** Két 'YYYY-MM-DD' közti naptári napok különbsége (vege - kezdes). */
function dayDiff(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000)
}

/**
 * A programlista kibontása: a nem ismétlődő sorok változatlanul kerülnek
 * vissza, az ismétlődők pedig a tényleges alkalmaikra bontva (a kezdő év
 * végéig). Az eredmény dátum szerint rendezett.
 */
export function expandProgramOccurrences(programs: Program[]): Program[] {
  const result: Program[] = []

  for (const p of programs) {
    const rec = p.ismetlodes_tipus
    const isRecurring = rec === 'heti' || rec === 'ketheti' || rec === 'havi'

    if (!isRecurring || !p.datum) {
      result.push(p)
      continue
    }

    const spanDays = p.datum_vege ? Math.max(0, dayDiff(p.datum, p.datum_vege)) : 0
    const horizon = `${p.datum.slice(0, 4)}-12-31`

    let cur = p.datum
    let count = 0
    while (cur <= horizon && count < MAX_OCCURRENCES) {
      result.push({
        ...p,
        datum: cur,
        datum_vege: spanDays > 0 ? addDays(cur, spanDays) : null,
      })
      cur = rec === 'havi' ? addMonths(cur, 1) : addDays(cur, STEP_DAYS[rec])
      count++
    }
  }

  return result.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0))
}
