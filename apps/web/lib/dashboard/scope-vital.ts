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
 * Az aggregáció JS-oldalon történik. A meglévő `lib/dashboard/scope-overview.ts`
 * mintát követjük.
 *
 * ⚠️ 2026-08-11 (K5-#31) — HOL HASZNÁLJUK VALÓJÁBAN
 * A fenti „dashboardokhoz" felirat ELAVULT: az egyházmegyei és a kerületi
 * irányítópult 2026-04-17 óta SZÁNDÉKOSAN nem hívja ezt (nem kérdezhetnek
 * közvetlenül az anyakönyvi táblákból — lásd `dashboard-egyhazmegye/page.tsx`
 * és `dashboard-kerulet/page.tsx` fejléc-kommentjét). Az EGYETLEN élő hívó ma
 * a `lib/annual-report/generator.ts` — vagyis ezek a számok a HIVATALOS,
 * NYOMTATOTT Éves jelentés III. „Kazuáliák" szekciójába kerülnek. Ezért lett
 * a hibakezelés hangos (lásd lentebb), és ezért lapozunk.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 2026-08-11 (K5-#31): LAPOZÓ segéd — a PostgREST NÉMÁN 1000 sorra vágja a
 * választ. A hívónak KÖTELEZŐ determinisztikus rendezést (`.order('id')`)
 * adnia. Minta: `lib/dashboard/scope-financial.ts` (2026-08-11, K5-#10).
 */
async function fetchAllPagedRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; ; ) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) return { data: out, error }
    const page = (data ?? []) as T[]
    out.push(...page)
    if (page.length === 0) break
    from += page.length
  }
  return { data: out, error: null }
}

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
  /** Csak a determinisztikus lapozó rendezéshez kérjük le. */
  id?: number
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

  // 4 párhuzamos lekérdezés a 4 anyakönyvi táblára — LAPOZVA és determinisztikus
  // rendezéssel (2026-08-11, K5-#31): a `temetes`/`keresztseg` sorszám egy nagyobb
  // hatókörben átlépheti a PostgREST 1000-es néma plafonját, és a hivatalos
  // jelentés kevesebb keresztelést/temetést mutatna, mint amennyi történt.
  const [keresztsegRes, hazassagRes, temetesRes, konfirmalasRes, congRes, dioRes] = await Promise.all([
    fetchAllPagedRows<VitalEventRow>(
      supabase
        .from('keresztseg')
        .select('id, congregation_id')
        .in('congregation_id', congregationIds)
        .gte('datum', yearStart)
        .lt('datum', yearEndExclusive)
        .order('id', { ascending: true }),
    ),
    fetchAllPagedRows<VitalEventRow>(
      supabase
        .from('hazassag')
        .select('id, congregation_id')
        .in('congregation_id', congregationIds)
        .gte('datum', yearStart)
        .lt('datum', yearEndExclusive)
        .order('id', { ascending: true }),
    ),
    fetchAllPagedRows<VitalEventRow>(
      supabase
        .from('temetes')
        .select('id, congregation_id')
        .in('congregation_id', congregationIds)
        .gte('tdatum', yearStart)
        .lt('tdatum', yearEndExclusive)
        .order('id', { ascending: true }),
    ),
    fetchAllPagedRows<VitalEventRow>(
      supabase
        .from('konfirmalas')
        .select('id, congregation_id')
        .in('congregation_id', congregationIds)
        .gte('datum', yearStart)
        .lt('datum', yearEndExclusive)
        .order('id', { ascending: true }),
    ),
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

  // 2026-08-11 (K5-#31): NÉMA NULLA HELYETT HANGOS HIBA.
  // Korábban BÁRMELYIK lekérdezés hibája `emptyStats(year)`-t adott: az Éves
  // jelentés III. „Kazuáliák" szekciója „0 keresztelés / 0 temetés"-t írt volna —
  // hihető, de HAMIS adat egy aláírt, hivatalos dokumentumban. Egy RLS-változás
  // vagy oszlop-átnevezés pontosan így nézne ki. A hívó
  // (`generateAnnualReportPreview`) try/catch-ben van, tehát a lelkész ezt a
  // magyar szöveget kapja hibaüzenetként.
  if (
    keresztsegRes.error ||
    hazassagRes.error ||
    temetesRes.error ||
    konfirmalasRes.error ||
    congRes.error
  ) {
    const detail =
      keresztsegRes.error?.message ||
      hazassagRes.error?.message ||
      temetesRes.error?.message ||
      konfirmalasRes.error?.message ||
      congRes.error?.message ||
      ''
    throw new Error(
      'Az anyakönyvi adatok (keresztelés, esketés, temetés, konfirmáció) összesítése nem sikerült, ' +
        'ezért az Éves jelentés III. szekciója nem készíthető el — nullát nem írunk be helyette. ' +
        `Próbáld újra néhány perc múlva; ha újra hibázik, jelezd a rendszergazdának${detail ? ` (részlet: ${detail})` : ''}.`,
    )
  }
  if (dioRes.error) {
    // Az egyházmegye-nevek csak CÍMKÉK — a hiányuk nem torzít darabszámot,
    // ezért ettől nem buktatjuk el a jelentést („Egyházmegye nélkül" marad).
    console.warn('[scope-vital] az egyházmegye-nevek lekérdezése hibázott:', dioRes.error.message)
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
