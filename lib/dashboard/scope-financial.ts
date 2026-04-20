/**
 * Egyházmegyei / kerületi pénzügyi aggregáció a dashboardokhoz (B4.5).
 *
 * A funkcióját a `lib/dashboard/scope-overview.ts` egészíti ki: ott a
 * tagszám / szerepkör / adatminőség adatok aggregálódnak, itt pedig a
 * pénzügyi forgalom (bevétel, kiadás, egyenleg) — egyházmegyénként és
 * gyülekezetenként.
 *
 * Az aggregáció JS-oldalon történik (NEM Postgres view-val), mert:
 * - A meglévő `scope-overview.ts` is JS-aggregációt használ
 * - Egy egyházmegyénél ritkán van >100 gyülekezet, és a befizetes/kiadas
 *   sorok éves szinten kezelhetők (sokmillió helyett kb. 10-20k sor)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ScopeFinancialCongregationRow {
  congregationId: string
  congregationName: string
  dioceseId: string | null
  dioceseName: string | null
  bevetel: number
  kiadas: number
  egyenleg: number
}

export interface ScopeFinancialDioceseRow {
  dioceseId: string | null
  dioceseName: string
  congregationCount: number
  bevetel: number
  kiadas: number
  egyenleg: number
}

export interface ScopeFinancialData {
  /** Az adott évre vonatkozó teljes aggregátum a vizsgált gyülekezetekre. */
  total: {
    bevetel: number
    kiadas: number
    egyenleg: number
    congregationCount: number
  }
  /** Egyházmegyénkénti bontás (kerületi nézethez hasznos). */
  byDiocese: ScopeFinancialDioceseRow[]
  /** Gyülekezetenkénti részletes bontás. */
  byCongregation: ScopeFinancialCongregationRow[]
  /** Az aggregáció éve (egyezzen az UI-ban kijelzettel). */
  year: number
}

interface BefitetesAggRow {
  congregation_id: string | null
  osszeg: number | string
}

interface KiadasAggRow {
  congregation_id: string | null
  osszeg: number | string
}

interface CongregationLite {
  id: string
  name: string | null
  nev_hu?: string | null
  diocese_id: string | null
}

interface DioceseLite {
  id: string
  name: string
}

/**
 * Pénzügyi aggregáció a dashboardhoz.
 *
 * @param supabase       Supabase kliens (server-side)
 * @param congregationIds A vizsgált gyülekezetek ID-jai (egyházmegyei nézetnél
 *                        szűkebb, kerületinél tágabb)
 * @param year            Az aggregáció éve (pl. 2025)
 * @param congregations   Opcionális: már lekérdezett gyülekezet metaadatok
 *                        (név + diocese_id). Ha nem adott meg, lekérdezi.
 * @param dioceses        Opcionális: már lekérdezett egyházmegye metaadatok
 */
export async function getScopeFinancialData(
  supabase: SupabaseClient,
  congregationIds: string[],
  year: number,
  congregations?: CongregationLite[],
  dioceses?: DioceseLite[],
): Promise<ScopeFinancialData> {
  if (congregationIds.length === 0) {
    return emptyData(year)
  }

  // 1) Bevétel és kiadás párhuzamos lekérdezése az adott évre
  const yearStart = `${year}-01-01`
  const yearEndExclusive = `${year + 1}-01-01`

  const [bevRes, kiaRes, congRes, dioRes] = await Promise.all([
    supabase
      .from('befizetes')
      .select('congregation_id, osszeg')
      .in('congregation_id', congregationIds)
      .gte('datum', yearStart)
      .lt('datum', yearEndExclusive)
      .or('deleted.eq.false,deleted.is.null'),
    supabase
      .from('kiadas')
      .select('congregation_id, osszeg')
      .in('congregation_id', congregationIds)
      .gte('datum', yearStart)
      .lt('datum', yearEndExclusive)
      .or('deleted.eq.false,deleted.is.null'),
    congregations
      ? Promise.resolve({ data: congregations, error: null })
      : supabase
          .from('congregations')
          .select('id, name, nev_hu, diocese_id')
          .in('id', congregationIds),
    dioceses
      ? Promise.resolve({ data: dioceses, error: null })
      : supabase.from('dioceses').select('id, name'),
  ])

  if (bevRes.error || kiaRes.error || congRes.error || dioRes.error) {
    // A hibákat visszaadjuk üres eredményként — a UI-ban a 0 értékek
    // jelennek meg, ami "nincs adat" jelzéssel egyenértékű
    return emptyData(year)
  }

  // 2) Aggregáció gyülekezet-szintre
  const bevByCong = aggregateByCongregation(bevRes.data as BefitetesAggRow[])
  const kiaByCong = aggregateByCongregation(kiaRes.data as KiadasAggRow[])

  const dioMap = new Map<string, string>()
  for (const d of (dioRes.data as DioceseLite[]) || []) {
    dioMap.set(d.id, d.name)
  }

  // 3) Gyülekezet-szintű sorok
  const byCongregation: ScopeFinancialCongregationRow[] = []
  for (const c of (congRes.data as CongregationLite[]) || []) {
    const bev = bevByCong.get(c.id) || 0
    const kia = kiaByCong.get(c.id) || 0
    byCongregation.push({
      congregationId: c.id,
      congregationName: c.nev_hu || c.name || 'Ismeretlen gyülekezet',
      dioceseId: c.diocese_id,
      dioceseName: c.diocese_id ? dioMap.get(c.diocese_id) || null : null,
      bevetel: bev,
      kiadas: kia,
      egyenleg: bev - kia,
    })
  }

  // Csökkenő sorrend: a legtöbb bevétellel kezdve
  byCongregation.sort((a, b) => b.bevetel - a.bevetel)

  // 4) Egyházmegye-szintű bontás
  const dioAgg = new Map<string, ScopeFinancialDioceseRow>()
  for (const row of byCongregation) {
    const key = row.dioceseId || '__none__'
    let agg = dioAgg.get(key)
    if (!agg) {
      agg = {
        dioceseId: row.dioceseId,
        dioceseName: row.dioceseName || 'Egyházmegye nélkül',
        congregationCount: 0,
        bevetel: 0,
        kiadas: 0,
        egyenleg: 0,
      }
      dioAgg.set(key, agg)
    }
    agg.congregationCount += 1
    agg.bevetel += row.bevetel
    agg.kiadas += row.kiadas
    agg.egyenleg += row.egyenleg
  }
  const byDiocese = Array.from(dioAgg.values()).sort((a, b) => b.bevetel - a.bevetel)

  // 5) Teljes aggregátum
  const total = byCongregation.reduce(
    (acc, r) => {
      acc.bevetel += r.bevetel
      acc.kiadas += r.kiadas
      acc.egyenleg += r.egyenleg
      return acc
    },
    { bevetel: 0, kiadas: 0, egyenleg: 0, congregationCount: byCongregation.length },
  )

  return { total, byDiocese, byCongregation, year }
}

function aggregateByCongregation(
  rows: Array<{ congregation_id: string | null; osszeg: number | string }>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (!r.congregation_id) continue
    const value = Number(r.osszeg) || 0
    map.set(r.congregation_id, (map.get(r.congregation_id) || 0) + value)
  }
  return map
}

function emptyData(year: number): ScopeFinancialData {
  return {
    total: { bevetel: 0, kiadas: 0, egyenleg: 0, congregationCount: 0 },
    byDiocese: [],
    byCongregation: [],
    year,
  }
}
