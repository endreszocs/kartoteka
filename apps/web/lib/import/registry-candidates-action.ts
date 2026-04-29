'use server'

/**
 * Anyakönyvi import — TOP-5 jelölt-keresés a nem-talált sorokhoz.
 *
 * Endre kérése (2026-04-28): "Ha nem találja biztosan, akkor segítsen
 * a lelkésznek a wizard és adjon alternatívákat valószínűség szerint.
 * Pontozza a valószínűséget és a lelkész kapcsolja össze a párokat."
 *
 * A wizard person-link lépésén minden nem-talált sorhoz megkeresi a TOP-5
 * legközelebbi szemely-jelöltet, pontszámmal. A lelkész választja a
 * megfelelőt.
 *
 * Pontozási algoritmus (max ~140 pont):
 *   - csaladnev pontos egyezés (normalize + unaccent): +30
 *   - csaladnev fuzzy (substring egyik a másikban): +15
 *   - k_nev pontos egyezés: +30
 *   - k_nev részleges (közös szó): +15
 *   - szcs_nev pontos egyezés a XML csaladnev-vel (lánykori): +25
 *   - sz_datum pontos egyezés: +20 (ha mindkettőn van)
 *   - sz_datum év-egyezés: +10
 *   - ferfi egyezés: +10
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

import { parseWorkbook, parseCsvString, parseXmlSpreadsheet } from './excel-parser'
import type { ParsedWorkbook } from './excel-parser'
import { REGISTRY_PROFILES } from './import-profiles'
import { resolveLookups } from './lookup-resolver'
import { transformSheet, type AutoColumnContext } from './row-transformer'

export interface CandidatePerson {
  id: number
  csaladnev: string | null
  k_nev: string | null
  sz_datum: string | null
  ferfi: boolean | null
  szcs_nev: string | null
  /** Pontszám (0-100+) — minél nagyobb, annál valószínűbb a match. */
  score: number
  /** Pontozási részletek — milyen szabályok adtak pontot (UI tooltip-hez). */
  reasons: string[]
}

export interface UnresolvedRowCandidates {
  rowIndex: number
  /** A nem-talált fél azonosítása: '' (általános), 'ferfi' (vőlegény), 'no' (menyasszony) */
  slot: '' | 'ferfi' | 'no'
  /** A XML-ből az érintett személy adatai (a UI mutathatja a "keresett" név-et) */
  searchedCsaladnev: string
  searchedKnev: string
  searchedSzDatum: string | null
  searchedFerfi: boolean | null
  /** TOP-5 jelölt pontszám szerint csökkenően */
  candidates: CandidatePerson[]
}

export interface CandidatesResult {
  success?: boolean
  error?: string
  unresolvedRows?: UnresolvedRowCandidates[]
}

const SUPPORTED_EXTS = ['xlsx', 'xls', 'csv', 'xml']
const COMBINING_MARKS_RE = new RegExp('[\\u0300-\\u036f]', 'g')

function norm(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function normYear(d: string | null | undefined): string {
  if (!d) return ''
  const m = d.match(/^(\d{4})/)
  return m ? m[1] : ''
}

function coerceFerfi(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (['true', '1', 'igen', 'yes', 'i', 'm', 'férfi', 'ferfi'].includes(s)) return true
    if (['false', '0', 'nem', 'no', 'n', 'f', 'nő'].includes(s)) return false
  }
  return null
}

interface ScoringInput {
  searchCsaladnev: string
  searchKnev: string
  searchSzDatum: string | null
  searchFerfi: boolean | null
}

interface PersonRow {
  id: number
  csaladnev: string | null
  k_nev: string | null
  sz_datum: string | null
  ferfi: boolean | null
  szcs_nev: string | null
}

function scorePerson(p: PersonRow, s: ScoringInput): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  const sCsNorm = norm(s.searchCsaladnev)
  const sKnNorm = norm(s.searchKnev)
  const pCsNorm = norm(p.csaladnev)
  const pKnNorm = norm(p.k_nev)
  const pScsNorm = norm(p.szcs_nev)

  // Családnév
  if (sCsNorm && pCsNorm) {
    if (sCsNorm === pCsNorm) {
      score += 30
      reasons.push('Családnév egyezik')
    } else if (sCsNorm.length >= 3 && pCsNorm.length >= 3 && (sCsNorm.includes(pCsNorm) || pCsNorm.includes(sCsNorm))) {
      score += 15
      reasons.push('Családnév részben egyezik')
    }
  }

  // Lánykori (szcs_nev) — a XML csaladnev-jét matcheli a szemely.szcs_nev-jével
  if (sCsNorm && pScsNorm && sCsNorm === pScsNorm) {
    score += 25
    reasons.push('Lánykori név egyezik')
  }

  // Keresztnév
  if (sKnNorm && pKnNorm) {
    if (sKnNorm === pKnNorm) {
      score += 30
      reasons.push('Keresztnév pontos egyezés')
    } else {
      // Fuzzy: kötőjel ↔ szóköz, részleges egyezés
      const sKnParts = new Set(sKnNorm.split(/[-\s]+/).filter(Boolean))
      const pKnParts = new Set(pKnNorm.split(/[-\s]+/).filter(Boolean))
      const common = [...sKnParts].filter(x => pKnParts.has(x))
      if (common.length > 0) {
        score += 15
        reasons.push(`Keresztnév részben egyezik (${common.join(', ')})`)
      }
    }
  }

  // Születési dátum
  if (s.searchSzDatum && p.sz_datum) {
    if (s.searchSzDatum === p.sz_datum) {
      score += 20
      reasons.push('Születési dátum egyezik')
    } else if (normYear(s.searchSzDatum) === normYear(p.sz_datum) && normYear(p.sz_datum)) {
      score += 10
      reasons.push('Születési év egyezik')
    }
  }

  // Férfi/nő
  if (s.searchFerfi !== null && p.ferfi !== null && s.searchFerfi === p.ferfi) {
    score += 10
    reasons.push('Nem egyezik')
  }

  return { score, reasons }
}

export async function getCandidatesForUnresolvedAction(
  formData: FormData,
): Promise<CandidatesResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const file = formData.get('file') as File | null
  const sheetName = formData.get('sheetName') as string | null
  const profileKey = formData.get('profileKey') as string | null
  const targetCongregationId =
    (formData.get('targetCongregationId') as string | null) ||
    access.effectiveCongregationId

  if (!file) return { error: 'Nincs fájl kiválasztva.' }
  if (!profileKey) return { error: 'Hiányzó profil-kulcs.' }
  if (!targetCongregationId) return { error: 'Nincs cél gyülekezet.' }

  const profile = REGISTRY_PROFILES.find(p => p.key === profileKey)
  if (!profile) return { error: `Érvénytelen profil-kulcs: ${profileKey}` }

  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (!SUPPORTED_EXTS.includes(ext)) {
    return { error: `Nem támogatott fájlformátum (.${ext}).` }
  }

  // 1. Parse + transformSheet (mint a többi action-ben)
  let workbook: ParsedWorkbook
  try {
    if (ext === 'csv') workbook = parseCsvString(await file.text(), file.name)
    else if (ext === 'xml') workbook = parseXmlSpreadsheet(await file.text(), file.name)
    else workbook = parseWorkbook(await file.arrayBuffer(), file.name)
  } catch (e) {
    return { error: `A fájl olvasása sikertelen: ${e instanceof Error ? e.message : 'ismeretlen'}` }
  }

  const sheet = sheetName
    ? workbook.sheets.find(s => s.name === sheetName)
    : workbook.sheets.find(s => !s.warning && s.rowCount > 0) || workbook.sheets[0]
  if (!sheet) return { error: `Nem található a megadott fül: ${sheetName || '(első)'}` }

  const ctx: AutoColumnContext = {
    congregationId: targetCongregationId,
    userId: access.user.id,
    currentYear: new Date().getFullYear(),
  }
  const transformResult = transformSheet(sheet.rows, sheet.headers, profile, ctx)
  const records = transformResult.records.map(r => ({ ...r.record })) as Array<Record<string, string | number | boolean | null>>

  // 2. resolveLookups (a már megtalált tagokat azonosítjuk)
  const supabase = await createClient()
  await resolveLookups(supabase, targetCongregationId, records)

  // 3. Lekérdezzük az ÖSSZES szemely-t a gyülekezetből egyszer (a TOP-5 jelölt-
  //    keresés az összes tagra fut). 1000-2000 tag ↔ kis adattömeg, gyors.
  const { data: allPersons, error: dbError } = await supabase
    .from('szemely')
    .select('id, csaladnev, k_nev, sz_datum, ferfi, szcs_nev')
    .eq('congregation_id', targetCongregationId)
    .eq('isvisible', true)
    .limit(5000)

  if (dbError) return { error: `Tagnyilv. lekérés hiba: ${dbError.message}` }
  const persons: PersonRow[] = (allPersons || []) as PersonRow[]

  // 4. A nem-talált sorokat összegyűjtjük + jelölteket pontozzuk
  const isMarriage = profileKey === 'marriage'
  const result: UnresolvedRowCandidates[] = []
  const MIN_SCORE = 20  // ennél kisebb pontszámú jelöltet nem mutatunk
  const TOP_N = 5

  function scoreAndPickTop(input: ScoringInput): CandidatePerson[] {
    const scored = persons
      .map(p => ({ p, ...scorePerson(p, input) }))
      .filter(x => x.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N)
    return scored.map(x => ({
      id: x.p.id,
      csaladnev: x.p.csaladnev,
      k_nev: x.p.k_nev,
      sz_datum: x.p.sz_datum,
      ferfi: x.p.ferfi,
      szcs_nev: x.p.szcs_nev,
      score: x.score,
      reasons: x.reasons,
    }))
  }

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (isMarriage) {
      // Vőlegény ellenőrzés
      if (r.id_ferfi == null || r.id_ferfi === '') {
        const cs = String(r._ferfi_csaladnev || '')
        const k = String(r._ferfi_k_nev || '')
        if (cs.trim() && k.trim()) {
          const candidates = scoreAndPickTop({
            searchCsaladnev: cs,
            searchKnev: k,
            searchSzDatum: typeof r._ferfi_sz_datum === 'string' ? r._ferfi_sz_datum : null,
            searchFerfi: true,
          })
          result.push({
            rowIndex: i + 1,
            slot: 'ferfi',
            searchedCsaladnev: cs,
            searchedKnev: k,
            searchedSzDatum: typeof r._ferfi_sz_datum === 'string' ? r._ferfi_sz_datum : null,
            searchedFerfi: true,
            candidates,
          })
        }
      }
      // Menyasszony ellenőrzés
      if (r.id_no == null || r.id_no === '') {
        const cs = String(r._no_csaladnev || '')
        const k = String(r._no_k_nev || '')
        if (cs.trim() && k.trim()) {
          const candidates = scoreAndPickTop({
            searchCsaladnev: cs,
            searchKnev: k,
            searchSzDatum: typeof r._no_sz_datum === 'string' ? r._no_sz_datum : null,
            searchFerfi: false,
          })
          result.push({
            rowIndex: i + 1,
            slot: 'no',
            searchedCsaladnev: cs,
            searchedKnev: k,
            searchedSzDatum: typeof r._no_sz_datum === 'string' ? r._no_sz_datum : null,
            searchedFerfi: false,
            candidates,
          })
        }
      }
    } else {
      if (r.id_szemely == null || r.id_szemely === '') {
        const cs = String(r._csaladnev || '')
        const k = String(r._k_nev || '')
        if (cs.trim() && k.trim()) {
          const candidates = scoreAndPickTop({
            searchCsaladnev: cs,
            searchKnev: k,
            searchSzDatum: typeof r._sz_datum === 'string' ? r._sz_datum : null,
            searchFerfi: coerceFerfi(r._ferfi),
          })
          result.push({
            rowIndex: i + 1,
            slot: '',
            searchedCsaladnev: cs,
            searchedKnev: k,
            searchedSzDatum: typeof r._sz_datum === 'string' ? r._sz_datum : null,
            searchedFerfi: coerceFerfi(r._ferfi),
            candidates,
          })
        }
      }
    }
  }

  return { success: true, unresolvedRows: result }
}
