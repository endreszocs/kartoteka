/**
 * Lookup resolver — virtuális (`_` prefixű) oszlopok → valódi FK ID-k.
 *
 * A profilok `dbColumn: '_szemely_cnp'` stílusú mezőket definiálhatnak, amiket
 * a `transformSheet` kitölt, de FK ID-vá kell őket resolve-olni MIELŐTT a rekord
 * a DB-be kerül.
 *
 * Támogatott lookup-ok:
 *  - `_szemely_cnp` / `_szemely_nev` → `id_szemely` (szemely tábla)
 *  - `_ferfi_cnp` / `_ferfi_nev` → `id_ferfi` (szemely tábla, férfi filter opcionális)
 *  - `_no_cnp` / `_no_nev` → `id_no` (szemely tábla, nő filter opcionális)
 *  - `_teljes_nev` → `id_szemely` fallback (fuzzy)
 *  - `_befizetescel_nev` → `id_befizetescel` (befizetescel tábla)
 *  - `_kiadascel_nev` → `id_kiadascel` (kiadascel tábla)
 *
 * Algoritmus:
 *  1. Kiolvassuk az összes egyedi lookup-értéket az összes rekordból
 *  2. Egy batch queryvel lekérjük a Supabase-ből
 *  3. Map-et építünk (value → id)
 *  4. Rekordonként behelyettesítjük
 *  5. Ha egy érték nem talál egyezést: warning (de nem hiba)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface LookupRecord {
  cnp: string | null
  csaladnev: string | null
  k_nev: string | null
  id: string
}

export interface CategoryRecord {
  id: number | string
  kod?: string | null
  nev: string | null
}

export interface ResolveStats {
  personResolved: number
  personUnresolved: number
  categoryResolved: number
  categoryUnresolved: number
  warnings: string[]
}

export interface ResolvedRecords {
  records: Array<Record<string, string | number | boolean | null>>
  stats: ResolveStats
}

// ─────────────────────────────────────────────────────────────────
// Segédfüggvények
// ─────────────────────────────────────────────────────────────────

function normalizeString(s: string | null | undefined): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function splitName(fullName: string): { vezetek: string; kereszt: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { vezetek: '', kereszt: '' }
  if (parts.length === 1) return { vezetek: parts[0], kereszt: '' }
  // Magyarban: első szó = családnév, maradék = keresztnév (több is lehet)
  return { vezetek: parts[0], kereszt: parts.slice(1).join(' ') }
}

// ─────────────────────────────────────────────────────────────────
// Személy lookup — CNP + név alapján
// ─────────────────────────────────────────────────────────────────

/**
 * Batch-lel lekérdezi a szemely táblát az összes CNP-hez és névhez.
 * Visszaad egy Map-et: kulcs (CNP vagy normalizált név) → id_szemely.
 */
async function buildPersonLookupMap(
  supabase: SupabaseClient,
  congregationId: string,
  cnps: Set<string>,
  names: Set<string>,
): Promise<{ byCnp: Map<string, string>; byName: Map<string, string> }> {
  const byCnp = new Map<string, string>()
  const byName = new Map<string, string>()

  // CNP-k és nevek egy batch queryben — felülről limitálva a biztonságért
  const allCnps = Array.from(cnps).filter(Boolean)
  const allNames = Array.from(names).filter(Boolean)

  if (allCnps.length === 0 && allNames.length === 0) {
    return { byCnp, byName }
  }

  // A query: szemely táblában csak a saját gyülekezet személyeit nézzük
  // (congregation_id szerint szűr az RLS, de biztonságból is)
  const { data, error } = await supabase
    .from('szemely')
    .select('id, cnp, csaladnev, k_nev')
    .eq('congregation_id', congregationId)
    .eq('deleted', false)

  if (error || !data) return { byCnp, byName }

  for (const row of data as LookupRecord[]) {
    if (row.cnp) {
      byCnp.set(row.cnp.trim(), row.id)
    }
    // Több formátumban tároljuk a neveket, hogy fuzzy match működjön
    const csal = normalizeString(row.csaladnev)
    const ker = normalizeString(row.k_nev)
    if (csal && ker) {
      byName.set(`${csal} ${ker}`, row.id)
      byName.set(`${ker} ${csal}`, row.id) // fordított sorrend
    }
  }

  return { byCnp, byName }
}

/**
 * Egy-egy sor felvesz egy CNP-t vagy nevet és kikeresi az id_szemely-t.
 */
function resolvePerson(
  rec: Record<string, string | number | boolean | null>,
  cnpKey: string,
  nameKey: string,
  targetFk: string,
  maps: { byCnp: Map<string, string>; byName: Map<string, string> },
  stats: ResolveStats,
  rowIndex: number,
): void {
  const cnp = rec[cnpKey]
  const nev = rec[nameKey]

  if (typeof cnp === 'string' && cnp.trim()) {
    const id = maps.byCnp.get(cnp.trim())
    if (id) {
      rec[targetFk] = id
      stats.personResolved += 1
      return
    }
  }

  if (typeof nev === 'string' && nev.trim()) {
    const normalized = normalizeString(nev)
    const id = maps.byName.get(normalized)
    if (id) {
      rec[targetFk] = id
      stats.personResolved += 1
      return
    }
    // Fallback: split by space, try both directions
    const { vezetek, kereszt } = splitName(nev)
    if (vezetek && kereszt) {
      const id2 =
        maps.byName.get(`${normalizeString(vezetek)} ${normalizeString(kereszt)}`) ||
        maps.byName.get(`${normalizeString(kereszt)} ${normalizeString(vezetek)}`)
      if (id2) {
        rec[targetFk] = id2
        stats.personResolved += 1
        return
      }
    }
  }

  // Nem találtuk
  if (cnp || nev) {
    stats.personUnresolved += 1
    if (stats.warnings.length < 30) {
      stats.warnings.push(
        `${rowIndex + 1}. sor: személy nem található (${cnpKey}=${cnp || '—'}, ${nameKey}=${nev || '—'})`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Kategória lookup — befizetescel / kiadascel
// ─────────────────────────────────────────────────────────────────

/**
 * A kategória név alapján megkeres egy rekord ID-t. Pl.:
 *  - "Egyházi járulék" → 1 (befizetescel.id)
 *  - "Parókiatartás" → 2
 *
 * Case-insensitive, trim-elt egyezés. Ha a név egy `kod` formátumú string
 * (pl. "101.01"), akkor a `kod` mezőben keres.
 */
async function buildCategoryLookupMap(
  supabase: SupabaseClient,
  congregationId: string,
  tableName: 'befizetescel' | 'kiadascel',
): Promise<Map<string, number | string>> {
  const map = new Map<string, number | string>()

  const { data, error } = await supabase
    .from(tableName)
    .select('id, kod, nev')
    .eq('congregation_id', congregationId)

  if (error || !data) return map

  for (const row of data as CategoryRecord[]) {
    if (row.nev) {
      map.set(normalizeString(row.nev), row.id)
    }
    if (row.kod) {
      map.set(normalizeString(row.kod), row.id)
    }
  }

  return map
}

function resolveCategory(
  rec: Record<string, string | number | boolean | null>,
  sourceKey: string,
  targetFk: string,
  map: Map<string, number | string>,
  stats: ResolveStats,
  rowIndex: number,
): void {
  const val = rec[sourceKey]
  if (typeof val !== 'string' || !val.trim()) return

  const id = map.get(normalizeString(val))
  if (id !== undefined) {
    rec[targetFk] = id
    stats.categoryResolved += 1
  } else {
    stats.categoryUnresolved += 1
    if (stats.warnings.length < 30) {
      stats.warnings.push(
        `${rowIndex + 1}. sor: kategória nem található (${sourceKey}=${val})`,
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Fő belépési pont
// ─────────────────────────────────────────────────────────────────

/**
 * Az összes rekordon elvégzi a lookup-okat.
 *
 * Hatékonyság: EGY batch query a szemely + befizetescel + kiadascel táblákra,
 * függetlenül attól, hogy mennyi rekord van. Ezzel elkerüljük az N+1 query-t.
 */
export async function resolveLookups(
  supabase: SupabaseClient,
  congregationId: string,
  records: Array<Record<string, string | number | boolean | null>>,
): Promise<ResolvedRecords> {
  const stats: ResolveStats = {
    personResolved: 0,
    personUnresolved: 0,
    categoryResolved: 0,
    categoryUnresolved: 0,
    warnings: [],
  }

  if (records.length === 0) {
    return { records, stats }
  }

  // 1. Összegyűjtjük az összes egyedi CNP-t és nevet
  const cnps = new Set<string>()
  const names = new Set<string>()

  for (const rec of records) {
    // Szemely / presbiter / keresztelt / konfirmalt CNP-i
    const cnpKeys = ['_szemely_cnp', '_ferfi_cnp', '_no_cnp']
    const nameKeys = ['_szemely_nev', '_ferfi_nev', '_no_nev', '_teljes_nev']

    for (const key of cnpKeys) {
      const v = rec[key]
      if (typeof v === 'string' && v.trim()) cnps.add(v.trim())
    }
    for (const key of nameKeys) {
      const v = rec[key]
      if (typeof v === 'string' && v.trim()) names.add(normalizeString(v))
    }
  }

  // 2. Batch query-k párhuzamosan
  const [personMaps, befCatMap, kiaCatMap] = await Promise.all([
    cnps.size > 0 || names.size > 0
      ? buildPersonLookupMap(supabase, congregationId, cnps, names)
      : Promise.resolve({ byCnp: new Map<string, string>(), byName: new Map<string, string>() }),
    records.some(r => typeof r._befizetescel_nev === 'string' && r._befizetescel_nev)
      ? buildCategoryLookupMap(supabase, congregationId, 'befizetescel')
      : Promise.resolve(new Map<string, number | string>()),
    records.some(r => typeof r._kiadascel_nev === 'string' && r._kiadascel_nev)
      ? buildCategoryLookupMap(supabase, congregationId, 'kiadascel')
      : Promise.resolve(new Map<string, number | string>()),
  ])

  // 3. Rekordonként feloldás
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]

    // Szemely (általános: keresztelt, konfirmalt, elhunyt, presbiter stb.)
    resolvePerson(rec, '_szemely_cnp', '_szemely_nev', 'id_szemely', personMaps, stats, i)
    // Férfi (csalad, hazassag)
    resolvePerson(rec, '_ferfi_cnp', '_ferfi_nev', 'id_ferfi', personMaps, stats, i)
    // Nő (csalad, hazassag)
    resolvePerson(rec, '_no_cnp', '_no_nev', 'id_no', personMaps, stats, i)
    // Teljes név fallback presbiter
    resolvePerson(rec, '_szemely_cnp', '_teljes_nev', 'id_szemely', personMaps, stats, i)

    // Kategória — befizetescel
    if (befCatMap.size > 0) {
      resolveCategory(rec, '_befizetescel_nev', 'id_befizetescel', befCatMap, stats, i)
    }
    // Kategória — kiadascel
    if (kiaCatMap.size > 0) {
      resolveCategory(rec, '_kiadascel_nev', 'id_kiadascel', kiaCatMap, stats, i)
    }
  }

  return { records, stats }
}
