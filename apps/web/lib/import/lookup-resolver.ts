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
 *  - **QUAD-LOOKUP** (anyakönyvi import — 2026-04-27):
 *    - `_csaladnev` + `_k_nev` + `_sz_datum` + `_ferfi` → `id_szemely`
 *    - `_ferfi_csaladnev` + `_ferfi_k_nev` + `_ferfi_sz_datum` → `id_ferfi` (auto ferfi=true)
 *    - `_no_csaladnev` + `_no_k_nev` + `_no_sz_datum` → `id_no` (auto ferfi=false)
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
  sz_datum: string | null
  ferfi: boolean | null
  /** Születési (lánykori) családnév — magyar reformárus tagnyilvántartásban a
   *  férjes asszonyoknál a `csaladnev` a férj családneve, a `szcs_nev` a
   *  lánykori. Az esketési import a lánykori nevet adja → ezen kell matchelni. */
  szcs_nev: string | null
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

// Combining diacritical marks (̀-ͯ) — explicit Unicode escape
// hogy az editor-encoding ne másoljon zagyva karaktert
const COMBINING_MARKS_RE = new RegExp('[\\u0300-\\u036f]', 'g')

/**
 * Quad-lookup-szintű név-normalizáció: ékezet-eltávolítás (Unicode NFD),
 * lowercase, trim, többszörös-szóköz-összevonás. A SQL-oldali
 * `public.normalize_name()`-mel konzisztens.
 */
function normalizeNameForQuad(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Egységes ISO date string (YYYY-MM-DD) az XML / Excel oldali változatokból.
 * Üres / hibás bemenet → ''.
 */
function normalizeDateForQuad(value: string | number | boolean | null | undefined): string {
  if (value == null || value === '') return ''
  const str = typeof value === 'string' ? value.trim() : String(value).trim()
  // Ha már ISO (YYYY-MM-DD vagy YYYY-MM-DDTHH:mm…), a 10 első karakter elég
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  // Magyar formátum: 1947.09.24 vagy 1947. 09. 24.
  const huMatch = str.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/)
  if (huMatch) {
    return `${huMatch[1]}-${huMatch[2].padStart(2, '0')}-${huMatch[3].padStart(2, '0')}`
  }
  // Próba Date-tel
  const d = new Date(str)
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10)
  }
  return ''
}

/**
 * `ferfi` mező → 'M' | 'F' | '?' normalizáció.
 * Támogatott bemenetek (case-insensitive):
 *   - boolean true / false
 *   - 'M' / 'F' / 'true' / 'false' / '1' / '0'
 *   - 'igen' / 'nem' (magyar XML)
 *   - 'férfi' / 'ferfi' / 'nő' / 'no' (magyar)
 *   - 'yes' / 'no' (angol)
 * '?' = ismeretlen (üres / hiányzó / fel nem ismert érték)
 */
function ferfiToFlag(ferfi: boolean | string | null | undefined): 'M' | 'F' | '?' {
  if (ferfi === true) return 'M'
  if (ferfi === false) return 'F'
  if (typeof ferfi !== 'string') return '?'
  const s = ferfi.trim().toLowerCase()
  if (s === '') return '?'
  if (['m', 'true', '1', 'igen', 'férfi', 'ferfi', 'yes'].includes(s)) return 'M'
  if (['f', 'false', '0', 'nem', 'nő', 'no'].includes(s)) return 'F'
  return '?'
}

/**
 * Quad-key generátor: `${csaladnev}|${k_nev}|${sz_datum}|${ferfi:M|F|?}`.
 * sz_datum vagy ferfi üres lehet — akkor a triple/double-fallback használt.
 */
function quadKey(
  csaladnev: string | null | undefined,
  k_nev: string | null | undefined,
  sz_datum: string | null | undefined,
  ferfi: boolean | string | null | undefined,
): string {
  const cs = normalizeNameForQuad(csaladnev)
  const k = normalizeNameForQuad(k_nev)
  const d = normalizeDateForQuad(sz_datum)
  return `${cs}|${k}|${d}|${ferfiToFlag(ferfi)}`
}

/**
 * Kettős keresztnév-variánsok generálása fuzzy match-hez.
 * Pl. `Viktória-Olivia` → ['viktoria-olivia', 'viktoria olivia', 'viktoria', 'olivia']
 * Pl. `Krisztina - Panna` → ['krisztina - panna', 'krisztina-panna', 'krisztina panna', 'krisztina', 'panna']
 */
function knevVariants(k_nev: string | null | undefined): string[] {
  const norm = normalizeNameForQuad(k_nev)
  if (!norm) return []
  const variants = new Set<string>([norm])
  // Kötőjel ↔ szóköz csere
  variants.add(norm.replace(/\s*-\s*/g, '-'))     // "krisztina - panna" → "krisztina-panna"
  variants.add(norm.replace(/\s*-\s*/g, ' '))     // "krisztina - panna" → "krisztina panna"
  variants.add(norm.replace(/-+/g, ' '))           // "viktoria-olivia" → "viktoria olivia"
  // Külön darabok (egyszerű első/második név)
  for (const part of norm.split(/[-\s]+/).filter(Boolean)) {
    if (part.length >= 2) variants.add(part)
  }
  return Array.from(variants)
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
interface PersonLookupMaps {
  byCnp: Map<string, string>
  byName: Map<string, string>
  /** Pontos egyezés: csaladnev|k_nev|sz_datum|ferfi */
  byQuad: Map<string, string>
  /** Triple fallback: csaladnev|k_nev|ferfi (sz_datum nélkül). 1 érték = egyértelmű, több = ambiguous. */
  byTriple: Map<string, string[]>
  /** LÁNYKORI (szcs_nev) fallback: szcs_nev|k_nev|ferfi */
  byMaiden: Map<string, string[]>
  /** Csak keresztnév + ferfi (UTOLSÓ ESÉLY) — k_nev|ferfi → szemely-id-k.
   *  Akkor segít, ha az esketési XML lánykori családnevet ad, de a tagnyilv.-
   *  ban csak a férjezett családnév szerepel ÉS NINCS szcs_nev mezője.
   *  Csak akkor matchel, ha 1 találat van (különben ambivalens, kihagyjuk). */
  byKnameFerfi: Map<string, string[]>
  /** Reverse lookup: szemely.id → szemely rekord (csaladnev, k_nev, …).
   *  A "férj-családnév" alapú menyasszony-keresés használja
   *  (esketésnél: ha id_ferfi feloldva, akkor a férj csaladnev-jét
   *  + XML lánykori keresztnevet használhatjuk a menyasszony megtalálásához). */
  byId: Map<string, LookupRecord>
}

async function buildPersonLookupMap(
  supabase: SupabaseClient,
  congregationId: string,
  cnps: Set<string>,
  names: Set<string>,
  quads: Set<string>,
): Promise<PersonLookupMaps> {
  const byCnp = new Map<string, string>()
  const byName = new Map<string, string>()
  const byQuad = new Map<string, string>()
  const byTriple = new Map<string, string[]>()
  const byMaiden = new Map<string, string[]>()
  const byKnameFerfi = new Map<string, string[]>()
  const byId = new Map<string, LookupRecord>()

  const allCnps = Array.from(cnps).filter(Boolean)
  const allNames = Array.from(names).filter(Boolean)
  const allQuads = Array.from(quads).filter(Boolean)

  if (allCnps.length === 0 && allNames.length === 0 && allQuads.length === 0) {
    return { byCnp, byName, byQuad, byTriple, byMaiden, byKnameFerfi, byId }
  }

  // A query: szemely táblában csak a saját gyülekezet személyeit nézzük
  // (congregation_id szerint szűr az RLS, de biztonságból is). 2026-04-28:
  // a `szcs_nev` mező a lánykori név — a férjezett asszonyok azonosításához.
  const { data, error } = await supabase
    .from('szemely')
    .select('id, cnp, csaladnev, k_nev, sz_datum, ferfi, isvisible, szcs_nev')
    .eq('congregation_id', congregationId)
    .eq('isvisible', true)

  if (error || !data) return { byCnp, byName, byQuad, byTriple, byMaiden, byKnameFerfi, byId }

  for (const row of data as Array<LookupRecord & { isvisible?: boolean }>) {
    byId.set(row.id, row)
    if (row.cnp) {
      byCnp.set(row.cnp.trim(), row.id)
    }
    // Név-alapú lookup (régi)
    const csal = normalizeString(row.csaladnev)
    const ker = normalizeString(row.k_nev)
    if (csal && ker) {
      byName.set(`${csal} ${ker}`, row.id)
      byName.set(`${ker} ${csal}`, row.id) // fordított sorrend
    }
    // Quad-lookup (anyakönyvi import) — kettős keresztnév-variánsokkal együtt
    if (row.csaladnev && row.k_nev) {
      const dbFerfiFlag = ferfiToFlag(row.ferfi)
      const csNorm = normalizeNameForQuad(row.csaladnev)
      const knVariants = knevVariants(row.k_nev)
      const dNorm = normalizeDateForQuad(row.sz_datum)

      for (const knVar of knVariants) {
        // Quad: csaladnev|k_nev_variant|sz_datum|ferfi
        const quad = `${csNorm}|${knVar}|${dNorm}|${dbFerfiFlag}`
        if (!byQuad.has(quad)) {
          byQuad.set(quad, row.id)
        }
        // Triple fallback (sz_datum nélkül) — minden ilyen szemely-id-t gyűjtünk
        const triple = `${csNorm}|${knVar}|${dbFerfiFlag}`
        const arr = byTriple.get(triple) || []
        if (!arr.includes(row.id)) arr.push(row.id)
        byTriple.set(triple, arr)
        // Plus: triple ferfi-flag NÉLKÜL is (utolsó fallback ha az XML _ferfi ismeretlen)
        const tripleNoFerfi = `${csNorm}|${knVar}|?`
        const arr2 = byTriple.get(tripleNoFerfi) || []
        if (!arr2.includes(row.id)) arr2.push(row.id)
        byTriple.set(tripleNoFerfi, arr2)
      }

      // LÁNYKORI (szcs_nev) fallback — csak nőknél van értelme:
      // ha a férjezett asszony `szcs_nev` mezője ki van töltve, indexeljük
      // szcs_nev|k_nev|ferfi alá. Az esketés-import a lánykori nevet keresi.
      if (row.szcs_nev && row.szcs_nev.trim() !== '') {
        const szcsNorm = normalizeNameForQuad(row.szcs_nev)
        for (const knVar of knVariants) {
          const maidenKey = `${szcsNorm}|${knVar}|${dbFerfiFlag}`
          const arr = byMaiden.get(maidenKey) || []
          if (!arr.includes(row.id)) arr.push(row.id)
          byMaiden.set(maidenKey, arr)
          // Plus: ferfi-flag NÉLKÜL is
          const maidenKeyNoFerfi = `${szcsNorm}|${knVar}|?`
          const arr2 = byMaiden.get(maidenKeyNoFerfi) || []
          if (!arr2.includes(row.id)) arr2.push(row.id)
          byMaiden.set(maidenKeyNoFerfi, arr2)
        }
      }

      // K-NEV + FERFI fuzzy index (UTOLSÓ ESÉLY)
      // Akkor segít, ha sem a csaladnev sem a szcs_nev nem találja a tagot —
      // pl. férjes asszony, akinek a tagnyilv. csak a férj családnevét tárolja
      // (lánykori szcs_nev mező üres). Csak akkor matchel a resolve-on, ha
      // pontosan 1 jelölt van — különben skipped (több azonos keresztnevű
      // azonos nemű tag = ambivalens).
      for (const knVar of knVariants) {
        const knFerfiKey = `${knVar}|${dbFerfiFlag}`
        const arr = byKnameFerfi.get(knFerfiKey) || []
        if (!arr.includes(row.id)) arr.push(row.id)
        byKnameFerfi.set(knFerfiKey, arr)
      }
    }
  }

  return { byCnp, byName, byQuad, byTriple, byMaiden, byKnameFerfi, byId }
}

/**
 * Egy-egy sor felvesz egy CNP-t vagy nevet és kikeresi az id_szemely-t.
 */
function resolvePerson(
  rec: Record<string, string | number | boolean | null>,
  cnpKey: string,
  nameKey: string,
  targetFk: string,
  maps: PersonLookupMaps,
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

/**
 * QUAD-LOOKUP — anyakönyvi import: csaladnev + k_nev + sz_datum + ferfi.
 *
 * `prefix` változatok:
 *   - '' (üres) — `_csaladnev`/`_k_nev`/`_sz_datum`/`_ferfi` → `id_szemely`
 *   - 'ferfi'   — `_ferfi_csaladnev`/.../`_ferfi_sz_datum` → `id_ferfi` (auto férfi=true)
 *   - 'no'      — `_no_csaladnev`/.../`_no_sz_datum` → `id_no` (auto férfi=false)
 *
 * Algoritmus:
 *   1. Ha van sz_datum → quad-key próba (legbiztosabb, 4-elemű egyezés)
 *   2. Ha nincs sz_datum vagy nem talál → triple-fallback (csaladnev|k_nev|ferfi)
 *      - Ha pontosan 1 jelölt → ID
 *      - Ha több → ambiguous warning (a wizard person-link lépésen rendezhető)
 *   3. Ha nincs jelölt → unresolved warning
 */
function resolvePersonByQuad(
  rec: Record<string, string | number | boolean | null>,
  prefix: '' | 'ferfi' | 'no',
  targetFk: string,
  maps: PersonLookupMaps,
  stats: ResolveStats,
  rowIndex: number,
): void {
  const csaladnevKey = prefix ? `_${prefix}_csaladnev` : '_csaladnev'
  const k_nevKey = prefix ? `_${prefix}_k_nev` : '_k_nev'
  const sz_datumKey = prefix ? `_${prefix}_sz_datum` : '_sz_datum'
  const ferfiKey = prefix === 'ferfi'
    ? null // explicit true
    : prefix === 'no'
      ? null // explicit false
      : '_ferfi'

  const csaladnev = rec[csaladnevKey]
  const k_nev = rec[k_nevKey]
  if (typeof csaladnev !== 'string' || !csaladnev.trim()) return
  if (typeof k_nev !== 'string' || !k_nev.trim()) return

  const sz_datum = rec[sz_datumKey]
  let ferfi: boolean | string | null = null
  if (prefix === 'ferfi') ferfi = true
  else if (prefix === 'no') ferfi = false
  else if (ferfiKey) {
    const v = rec[ferfiKey]
    if (typeof v === 'boolean') ferfi = v
    else if (typeof v === 'string') ferfi = v
  }

  // Generáljuk a kettős keresztnév-variánsokat
  const queryFerfiFlag = ferfiToFlag(ferfi)
  const csNorm = normalizeNameForQuad(csaladnev)
  const knVariants = knevVariants(k_nev)
  const dNorm = normalizeDateForQuad(typeof sz_datum === 'string' ? sz_datum : sz_datum != null ? String(sz_datum) : '')

  // 1. Quad próba minden knev-variánssal (sz_datummal + ferfi-vel)
  if (dNorm) {
    for (const knVar of knVariants) {
      const quad = `${csNorm}|${knVar}|${dNorm}|${queryFerfiFlag}`
      const id = maps.byQuad.get(quad)
      if (id) {
        rec[targetFk] = id
        stats.personResolved += 1
        return
      }
    }
  }

  // 2. Triple fallback (sz_datum nélkül, ferfi-vel)
  let lastCandidates: string[] | undefined
  for (const knVar of knVariants) {
    const tripleKey = `${csNorm}|${knVar}|${queryFerfiFlag}`
    const candidates = maps.byTriple.get(tripleKey)
    if (candidates && candidates.length === 1) {
      rec[targetFk] = candidates[0]
      stats.personResolved += 1
      return
    }
    if (candidates) lastCandidates = candidates
  }

  // 3. Triple-NoFerfi fallback (ha az XML _ferfi ismeretlen)
  for (const knVar of knVariants) {
    const tripleNoFerfi = `${csNorm}|${knVar}|?`
    const candidates = maps.byTriple.get(tripleNoFerfi)
    if (candidates && candidates.length === 1) {
      rec[targetFk] = candidates[0]
      stats.personResolved += 1
      return
    }
  }

  // 4. LÁNYKORI (szcs_nev) fallback — csak a `prefix='no'` (esketés menyasszony)
  //    esetén jelentős, mert a férjes asszony `csaladnev`-je a férj családneve,
  //    de a `szcs_nev`-ben tárolt lánykori név egyezik a XML "Csaladnev_2"-vel.
  //    Általánosan is alkalmazható (a férfiak `szcs_nev`-je általában megegyezik
  //    a `csaladnev`-vel, így nem ad téves találatot).
  for (const knVar of knVariants) {
    const maidenKey = `${csNorm}|${knVar}|${queryFerfiFlag}`
    const candidates = maps.byMaiden.get(maidenKey)
    if (candidates && candidates.length === 1) {
      rec[targetFk] = candidates[0]
      stats.personResolved += 1
      return
    }
    if (candidates && !lastCandidates) lastCandidates = candidates
  }
  // 4b. Maiden + ferfi nélkül (utolsó esély a lánykori-keresésre)
  for (const knVar of knVariants) {
    const maidenKeyNoFerfi = `${csNorm}|${knVar}|?`
    const candidates = maps.byMaiden.get(maidenKeyNoFerfi)
    if (candidates && candidates.length === 1) {
      rec[targetFk] = candidates[0]
      stats.personResolved += 1
      return
    }
  }

  // 5. UTOLSÓ ESÉLY: csak k_nev + ferfi (csaladnev NÉLKÜL)
  //    Akkor segít, ha a férjes asszony tagnyilv. csak a férj családnevét
  //    tárolja (szcs_nev üres) — a XML lánykori családneve nem matchel
  //    sem a csaladnev-en sem a szcs_nev-en. Ha pontosan 1 jelölt van
  //    `k_nev='Beáta Linda', ferfi=false` → biztosan ő az.
  //    Ha több → ambivalens, NEM matchelünk (különben rossz tagot kötne).
  for (const knVar of knVariants) {
    const knFerfiKey = `${knVar}|${queryFerfiFlag}`
    const candidates = maps.byKnameFerfi.get(knFerfiKey)
    if (candidates && candidates.length === 1) {
      rec[targetFk] = candidates[0]
      stats.personResolved += 1
      return
    }
    if (candidates && candidates.length > 1 && !lastCandidates) lastCandidates = candidates
  }

  // 6. Nincs vagy ambiguous
  stats.personUnresolved += 1
  if (stats.warnings.length < 30) {
    const ambiguous = lastCandidates && lastCandidates.length > 1 ? ` (${lastCandidates.length} jelölt)` : ''
    stats.warnings.push(
      `${rowIndex + 1}. sor: tag nem található${ambiguous} — ${csaladnev} ${k_nev}${sz_datum ? `, sz: ${sz_datum}` : ''}${prefix ? ` [${prefix}]` : ''}`,
    )
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

  // 1. Összegyűjtjük az összes egyedi CNP-t, nevet és quad-kulcsot
  const cnps = new Set<string>()
  const names = new Set<string>()
  const quads = new Set<string>()
  // Anyakönyvi quad-mezők: 3 prefix-variáció
  const quadVariants: Array<{ prefix: '' | 'ferfi' | 'no'; cs: string; k: string; d: string; f: string | null }> = [
    { prefix: '',      cs: '_csaladnev',       k: '_k_nev',       d: '_sz_datum',       f: '_ferfi' },
    { prefix: 'ferfi', cs: '_ferfi_csaladnev', k: '_ferfi_k_nev', d: '_ferfi_sz_datum', f: null /* auto true */ },
    { prefix: 'no',    cs: '_no_csaladnev',    k: '_no_k_nev',    d: '_no_sz_datum',    f: null /* auto false */ },
  ]
  let needsQuadLookup = false

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
    // Quad-mezők gyűjtése
    for (const variant of quadVariants) {
      const cs = rec[variant.cs]
      const k = rec[variant.k]
      if (typeof cs === 'string' && cs.trim() && typeof k === 'string' && k.trim()) {
        needsQuadLookup = true
        const d = rec[variant.d]
        let ferfi: boolean | string | null = null
        if (variant.prefix === 'ferfi') ferfi = true
        else if (variant.prefix === 'no') ferfi = false
        else if (variant.f) {
          const v = rec[variant.f]
          if (typeof v === 'boolean') ferfi = v
          else if (typeof v === 'string') ferfi = v
        }
        quads.add(quadKey(cs, k, typeof d === 'string' ? d : d != null ? String(d) : '', ferfi))
      }
    }
  }

  // 2. Batch query-k párhuzamosan
  const [personMaps, befCatMap, kiaCatMap] = await Promise.all([
    cnps.size > 0 || names.size > 0 || needsQuadLookup
      ? buildPersonLookupMap(supabase, congregationId, cnps, names, quads)
      : Promise.resolve<PersonLookupMaps>({
          byCnp: new Map(), byName: new Map(), byQuad: new Map(), byTriple: new Map(), byMaiden: new Map(), byKnameFerfi: new Map(), byId: new Map(),
        }),
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

    // QUAD-LOOKUP (anyakönyvi import) — csak akkor fut, ha a record tartalmaz
    // ilyen mezőket. Visszafele kompatibilis: a régi profilok érintetlen.
    resolvePersonByQuad(rec, '',      'id_szemely', personMaps, stats, i)
    resolvePersonByQuad(rec, 'ferfi', 'id_ferfi',   personMaps, stats, i)
    resolvePersonByQuad(rec, 'no',    'id_no',      personMaps, stats, i)

    // Kategória — befizetescel
    if (befCatMap.size > 0) {
      resolveCategory(rec, '_befizetescel_nev', 'id_befizetescel', befCatMap, stats, i)
    }
    // Kategória — kiadascel
    if (kiaCatMap.size > 0) {
      resolveCategory(rec, '_kiadascel_nev', 'id_kiadascel', kiaCatMap, stats, i)
    }
  }

  // ─── 2. KÖR — Férj-családnév alapján menyasszony-keresés ───────────────
  //
  // Endre észrevétele (2026-04-29): "Ha megvan a vőlegény, akkor a vőlegény
  // családneve és a menyasszony keresztnevével kellene egyeztetni — és ami
  // megmarad az a lánykori neve."
  //
  // Logika a magyar reformárus gyakorlatban:
  //   - A vőlegény: pl. "Hatházi András" (csaladnev=Hatházi, k_nev=András)
  //   - Menyasszony XML-ben (lánykori): pl. "Karácsony Irma"
  //   - A menyasszony MOST a tagnyilv.-ban: pl. "Hatházi Irma"
  //     (csaladnev=Hatházi a férj nevéről, k_nev=Irma változatlan,
  //      szcs_nev=Karácsony lánykori).
  //
  // Tehát ha id_ferfi feloldva, de id_no nincs → próbáljuk:
  //   csaladnev = férj.csaladnev AND k_nev = XML._no_k_nev AND ferfi=false
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    const idFerfi = rec.id_ferfi
    const idNo = rec.id_no
    const noKnev = rec._no_k_nev
    if (
      (idNo == null || idNo === '')
      && idFerfi != null && idFerfi !== ''
      && typeof noKnev === 'string' && noKnev.trim()
    ) {
      const ferfiPerson = personMaps.byId.get(String(idFerfi))
      if (ferfiPerson?.csaladnev) {
        const csNorm = normalizeNameForQuad(ferfiPerson.csaladnev)
        const knVariants = knevVariants(noKnev)
        const noSzDatum = rec._no_sz_datum
        const dNorm = normalizeDateForQuad(typeof noSzDatum === 'string' ? noSzDatum : noSzDatum != null ? String(noSzDatum) : '')

        let resolved = false
        // 2a. Quad-key: férj-csaladnev | XML keresztnév | sz_datum | F
        if (dNorm) {
          for (const knVar of knVariants) {
            const quad = `${csNorm}|${knVar}|${dNorm}|F`
            const id = personMaps.byQuad.get(quad)
            if (id) {
              rec.id_no = id
              stats.personResolved += 1
              resolved = true
              break
            }
          }
        }

        // 2b. Triple fallback: férj-csaladnev | XML keresztnév | F (csak 1 jelölt esetén)
        if (!resolved) {
          for (const knVar of knVariants) {
            const tripleKey = `${csNorm}|${knVar}|F`
            const candidates = personMaps.byTriple.get(tripleKey)
            if (candidates && candidates.length === 1) {
              rec.id_no = candidates[0]
              stats.personResolved += 1
              resolved = true
              break
            }
          }
        }
      }
    }
  }

  return { records, stats }
}
