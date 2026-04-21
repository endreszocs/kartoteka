/**
 * Egyházmegyei / kerületi anyakönyvi (kazuáliák) aggregáció a dashboardokhoz (B4.5).
 *
 * Az aggregáció 4 anyakönyvi eseményt összesít gyülekezetenként és
 * egyházmegyénként az adott évre:
 *  - keresztelés (`keresztseg.datum`)
 *  - házasság / esketés (`hazassag.datum`)
 *  - temetés (`temetes.tdatum` — temetés dátuma, NEM a halálozás)
 *  - konfirmáció (`konfirmalas.datum`)
 *
 * Az aggregáció JS-oldalon történik (egy táblából max. néhány száz sor évente).
 * A meglévő `lib/dashboard/scope-overview.ts` mintát követjük.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ScopeVitalCongregationRow {
  congregationId: string
  congregationName: string
  dioceseId: string | null
  dioceseName: string | null
  keresztseg: number
  hazassag: number
  temetes: number
  konfirmalas: number
  /** Az összes kazuália az adott évre. */
  total: number
}

export interface ScopeVitalDioceseRow {
  dioceseId: string | null
  dioceseName: string
  congregationCount: number
  keresztseg: number
  hazassag: number
  temetes: number
  konfirmalas: number
  total: number
}

export interface ScopeVitalStats {
  total: {
    keresztseg: number
    hazassag: number
    temetes: number
    konfirmalas: number
    total: number
  }
  byDiocese: ScopeVitalDioceseRow[]
  byCongregation: ScopeVitalCongregationRow[]
  year: number
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

interface VitalEventRow {
  congregation_id: string | null
}

/**
 * Kazuáliák aggregáció a dashboardhoz.
 *
 * @param supabase        Supabase kliens (server-side)
 * @param congregationIds A vizsgált gyülekezetek
 * @param year            Az aggregáció éve
 * @param congregations   Opcionális: már lekérdezett gyülekezet metaadatok
 * @param dioceses        Opcionális: már lekérdezett egyházmegye metaadatok
 */
export async function getScopeVitalStats(
  supabase: SupabaseClient,
  congregationIds: string[],
  year: number,
  congregations?: CongregationLite[],
  dioceses?: DioceseLite[],
): Promise<ScopeVitalStats> {
  if (congregationIds.length === 0) {
    return emptyStats(year)
  }

  const yearStart = `${year}-01-01`
  const yearEndExclusive = `${year + 1}-01-01`

  // 4 párhuzamos lekérdezés a 4 anyakönyvi tábla
  const [keresztsegRes, hazassagRes, temetesRes, konfirmalasRes, congRes, dioRes] = await Promise.all([
    supabase
      .from('keresztseg')
      .select('congregation_id')
      .in('congregation_id', congregationIds)
      .gte('datum', yearStart)
      .lt('datum', yearEndExclusive),
    supabase
      .from('hazassag')
      .select('congregation_id')
      .in('congregation_id', congregationIds)
      .gte('datum', yearStart)
      .lt('datum', yearEndExclusive),
    supabase
      .from('temetes')
      .select('congregation_id')
      .in('congregation_id', congregationIds)
      .gte('tdatum', yearStart)
      .lt('tdatum', yearEndExclusive),
    supabase
      .from('konfirmalas')
      .select('congregation_id')
      .in('congregation_id', congregationIds)
      .gte('datum', yearStart)
      .lt('datum', yearEndExclusive),
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

  if (
    keresztsegRes.error ||
    hazassagRes.error ||
    temetesRes.error ||
    konfirmalasRes.error ||
    congRes.error ||
    dioRes.error
  ) {
    return emptyStats(year)
  }

  const keresztsegByCong = countByCongregation(keresztsegRes.data as VitalEventRow[])
  const hazassagByCong = countByCongregation(hazassagRes.data as VitalEventRow[])
  const temetesByCong = countByCongregation(temetesRes.data as VitalEventRow[])
  const konfirmalasByCong = countByCongregation(konfirmalasRes.data as VitalEventRow[])

  const dioMap = new Map<string, string>()
  for (const d of (dioRes.data as DioceseLite[]) || []) {
    dioMap.set(d.id, d.name)
  }

  const byCongregation: ScopeVitalCongregationRow[] = []
  for (const c of (congRes.data as CongregationLite[]) || []) {
    const k = keresztsegByCong.get(c.id) || 0
    const h = hazassagByCong.get(c.id) || 0
    const t = temetesByCong.get(c.id) || 0
    const ko = konfirmalasByCong.get(c.id) || 0
    byCongregation.push({
      congregationId: c.id,
      congregationName: c.nev_hu || c.name || 'Ismeretlen gyülekezet',
      dioceseId: c.diocese_id,
      dioceseName: c.diocese_id ? dioMap.get(c.diocese_id) || null : null,
      keresztseg: k,
      hazassag: h,
      temetes: t,
      konfirmalas: ko,
      total: k + h + t + ko,
    })
  }

  byCongregation.sort((a, b) => b.total - a.total)

  // Egyházmegyei aggregáció
  const dioAgg = new Map<string, ScopeVitalDioceseRow>()
  for (const row of byCongregation) {
    const key = row.dioceseId || '__none__'
    let agg = dioAgg.get(key)
    if (!agg) {
      agg = {
        dioceseId: row.dioceseId,
        dioceseName: row.dioceseName || 'Egyházmegye nélkül',
        congregationCount: 0,
        keresztseg: 0,
        hazassag: 0,
        temetes: 0,
        konfirmalas: 0,
        total: 0,
      }
      dioAgg.set(key, agg)
    }
    agg.congregationCount += 1
    agg.keresztseg += row.keresztseg
    agg.hazassag += row.hazassag
    agg.temetes += row.temetes
    agg.konfirmalas += row.konfirmalas
    agg.total += row.total
  }
  const byDiocese = Array.from(dioAgg.values()).sort((a, b) => b.total - a.total)

  // Teljes aggregátum
  const total = byCongregation.reduce(
    (acc, r) => {
      acc.keresztseg += r.keresztseg
      acc.hazassag += r.hazassag
      acc.temetes += r.temetes
      acc.konfirmalas += r.konfirmalas
      acc.total += r.total
      return acc
    },
    { keresztseg: 0, hazassag: 0, temetes: 0, konfirmalas: 0, total: 0 },
  )

  return { total, byDiocese, byCongregation, year }
}

function countByCongregation(rows: VitalEventRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (!r.congregation_id) continue
    map.set(r.congregation_id, (map.get(r.congregation_id) || 0) + 1)
  }
  return map
}

function emptyStats(year: number): ScopeVitalStats {
  return {
    total: { keresztseg: 0, hazassag: 0, temetes: 0, konfirmalas: 0, total: 0 },
    byDiocese: [],
    byCongregation: [],
    year,
  }
}
