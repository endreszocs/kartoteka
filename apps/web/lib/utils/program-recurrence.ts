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
 *  - Az ismétlődés horizontja alapból a kezdő ÉV vége (`YYYY-12-31`), de a
 *    hívó `horizonYear`-rel a NÉZETT év végéig kérheti a kibontást (2026-08-02,
 *    PR-20: az előző évben indult heti sorozat a következő évben is látszik),
 *    és a sorozat SAJÁT záró napja (`ismetlodes_vege`, 2026-08-26) mindkettőt
 *    rövidíti. Záró nap nélküli sorozat tehát átnyúlik az évhatáron — a
 *    MAX_OCCURRENCES védőkorlát ezért 400.
 *  - Többnapos ismétlődő program esetén a `datum_vege` minden alkalomnál
 *    ugyanannyi nappal tolódik, mint az eredeti hossz.
 */

const STEP_DAYS: Record<string, number> = { heti: 7, ketheti: 14 }

/** Védőkorlát elszabadult ciklus ellen — 2026-08-02 (PR-20): 400-ra emelve,
 *  mert a horizont már a NÉZETT év vége is lehet (előző évben indult heti
 *  sorozat ≈ 105 alkalom két évre; 400 ≈ 7,5 év heti ritmusban). */
const MAX_OCCURRENCES = 400

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
 * vissza, az ismétlődők pedig a tényleges alkalmaikra bontva. Az eredmény
 * dátum szerint rendezett.
 *
 * 2026-08-02 (PR-20):
 *  - `horizonYear` (opcionális): a kibontás a megadott év végéig fut (alap:
 *    a kezdő év vége — visszafelé kompatibilis). Így az előző évben indult
 *    heti sorozat az idei nézetben is megjelenik.
 *  - HAVI csúszás-javítás: minden alkalom az EREDETI hónapnaptól számítódik
 *    (index-alapú), nem az előző alkalomtól — a jan. 31-i kezdés így
 *    febr. 28. UTÁN márc. 31-re áll vissza (eddig 28-án ragadt).
 */
export function expandProgramOccurrences(programs: Program[], horizonYear?: number): Program[] {
  const result: Program[] = []

  for (const p of programs) {
    const rec = p.ismetlodes_tipus
    // 2026-08-26 (5. kör): + 'evi' — az évente visszatérő alkalom (búcsú,
    // hálaadás, VBH) is sorozatként bontható.
    const isRecurring = rec === 'heti' || rec === 'ketheti' || rec === 'havi' || rec === 'evi'

    if (!isRecurring || !p.datum) {
      result.push(p)
      continue
    }

    const spanDays = p.datum_vege ? Math.max(0, dayDiff(p.datum, p.datum_vege)) : 0
    const baseYear = Number(p.datum.slice(0, 4))
    const endYear = Math.max(baseYear, horizonYear ?? baseYear)
    // 2026-08-26 (5. kör): a sorozat SAJÁT záró-dátuma (ismetlodes_vege) a
    // horizontot is vágja — eddig egy 2019-es heti bibliaóra „örökre futott".
    let horizon = `${endYear}-12-31`
    if (p.ismetlodes_vege && p.ismetlodes_vege < horizon) horizon = p.ismetlodes_vege

    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      const cur =
        rec === 'havi' ? addMonths(p.datum, i)
        : rec === 'evi' ? addMonths(p.datum, i * 12)
        : addDays(p.datum, i * STEP_DAYS[rec])
      if (cur > horizon) break
      result.push({
        ...p,
        datum: cur,
        datum_vege: spanDays > 0 ? addDays(cur, spanDays) : null,
      })
    }
  }

  return result.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0))
}
