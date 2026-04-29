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
  /** Az esketés HÁZASTÁRSA — a UI mutatja, hogy ezt a vőlegény / menyasszony
   *  melyik párjához keressük (pl. "Pár: Szász Emőke, sz: 1995-03-12").
   *  Csak `marriage` profil esetén kitöltött, egyébként null. */
  partnerCsaladnev?: string | null
  partnerKnev?: string | null
  partnerSzDatum?: string | null
  /** Az esketés dátuma (UI: "Esküvő: 2025-06-12"). */
  marriageDatum?: string | null
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
  /** Ha igaz, a keresztnév egyezés (pontos vagy közös szó-rész) KÖTELEZŐ —
   *  ha nem teljesül, a jelölt 0 pontot kap (kiesik a MIN_SCORE szűrőn).
   *  Esketésnél (marriage) használjuk: a magyar gyakorlatban a házassággal
   *  csak a családnév változhat (lánykori → házassági), a keresztnév nem.
   */
  requireKnevMatch?: boolean
  /** Esketés menyasszony-keresésnél: a vőlegény csaladnev-je. Ha a jelölt
   *  jelenlegi `csaladnev`-je egyezik a férj csaladnev-jével → +35 (erős
   *  jel: ez már a férj nevét viseli). Logika: a magyar gyakorlatban a
   *  házassággal a nő csaladnev-je gyakran a férj nevére változik. */
  husbandCsaladnev?: string | null
  /** XML "SzCsaládnév" oszlopa — a lánykori családnév. Akkor segít, ha az
   *  XML-ben szerepel ez a mező (pl. temetés-XML "Özv. Szabó Áronné Bitai
   *  Tekla" sornál: `searchCsaladnev=Szabó`, `searchSzcsNev=Bitai`). Ha a
   *  jelölt `csaladnev`-je egyezik a XML lánykori nevével (a tag még a
   *  lánykori nevén van) → +30 pont. Ha a jelölt `szcs_nev`-je egyezik
   *  vele → +25 pont. */
  searchSzcsNev?: string | null
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

  // ─── Keresztnév ─────────────────────────────────────────────────────────
  // Esketésnél (requireKnevMatch=true) a keresztnév-egyezés KÖTELEZŐ — ha nem
  // teljesül, 0 pontot adunk (a jelölt kiesik a MIN_SCORE szűrőn).
  let knevMatched = false
  if (sKnNorm && pKnNorm) {
    if (sKnNorm === pKnNorm) {
      score += 30
      reasons.push('Keresztnév pontos egyezés')
      knevMatched = true
    } else {
      // Fuzzy: kötőjel ↔ szóköz, részleges egyezés
      const sKnParts = new Set(sKnNorm.split(/[-\s]+/).filter(Boolean))
      const pKnParts = new Set(pKnNorm.split(/[-\s]+/).filter(Boolean))
      const common = [...sKnParts].filter(x => pKnParts.has(x))
      if (common.length > 0) {
        score += 15
        reasons.push(`Keresztnév részben egyezik (${common.join(', ')})`)
        knevMatched = true
      }
    }
  }

  if (s.requireKnevMatch && !knevMatched) {
    return { score: 0, reasons: [] }
  }

  // ─── Családnév ──────────────────────────────────────────────────────────
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

  // XML lánykori név (SzCsaládnév) ↔ jelölt csaladnev/szcs_nev
  // A temetés-XML kifejezetten elválasztja a férjezett és lánykori nevet.
  // Ha a tag még a lánykori néven van a tagnyilv-ban → csaladnev egyezés a
  // XML lánykori nevével erős jel.
  if (s.searchSzcsNev) {
    const sSzcsNorm = norm(s.searchSzcsNev)
    if (sSzcsNorm && sSzcsNorm !== sCsNorm) {
      if (pCsNorm === sSzcsNorm) {
        score += 30
        reasons.push(`Tag a lánykori néven (${s.searchSzcsNev})`)
      } else if (pScsNorm === sSzcsNorm) {
        score += 25
        reasons.push(`Lánykori név (${s.searchSzcsNev}) egyezik`)
      }
    }
  }

  // ─── Férj családneve (esketés menyasszony) ──────────────────────────────
  // Endre logikája: ha a férj csaladnev-jét tudjuk, és a jelölt jelenlegi
  // csaladnev-je egyezik vele → erős jel, hogy ő a férjezett asszony.
  // Pl. férj=Hatházi, jelölt csaladnev=Hatházi, k_nev=Irma, szcs_nev=Karácsony,
  // XML=Karácsony Irma → kettős egyezés (lánykori + férj-családnév).
  if (s.husbandCsaladnev) {
    const husbandNorm = norm(s.husbandCsaladnev)
    if (husbandNorm && pCsNorm === husbandNorm && pCsNorm !== sCsNorm) {
      score += 35
      reasons.push(`Férj családneve egyezik (${s.husbandCsaladnev})`)
    }
  }

  // ─── Születési dátum ────────────────────────────────────────────────────
  if (s.searchSzDatum && p.sz_datum) {
    if (s.searchSzDatum === p.sz_datum) {
      score += 20
      reasons.push('Születési dátum egyezik')
    } else if (normYear(s.searchSzDatum) === normYear(p.sz_datum) && normYear(p.sz_datum)) {
      score += 10
      reasons.push('Születési év egyezik')
    }
  }

  // ─── Férfi/nő ───────────────────────────────────────────────────────────
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
  // Reverse map: id → person (a férj-csaladnév kinyeréséhez ha id_ferfi feloldva)
  const personsById = new Map<number, PersonRow>()
  for (const p of persons) personsById.set(p.id, p)

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
      // A pár (másik fél) adatai — a UI mutatja, kihez keressük a jelöltet
      const ferfiCs = typeof r._ferfi_csaladnev === 'string' ? r._ferfi_csaladnev : null
      const ferfiK = typeof r._ferfi_k_nev === 'string' ? r._ferfi_k_nev : null
      const ferfiSz = typeof r._ferfi_sz_datum === 'string' ? r._ferfi_sz_datum : null
      const noCs = typeof r._no_csaladnev === 'string' ? r._no_csaladnev : null
      const noK = typeof r._no_k_nev === 'string' ? r._no_k_nev : null
      const noSz = typeof r._no_sz_datum === 'string' ? r._no_sz_datum : null
      const marriageDatum = typeof r.datum === 'string' ? r.datum : null

      // Vőlegény ellenőrzés — keresztnév-egyezés KÖTELEZŐ (Endre észrevétele)
      if (r.id_ferfi == null || r.id_ferfi === '') {
        const cs = String(ferfiCs || '')
        const k = String(ferfiK || '')
        if (cs.trim() && k.trim()) {
          const candidates = scoreAndPickTop({
            searchCsaladnev: cs,
            searchKnev: k,
            searchSzDatum: ferfiSz,
            searchFerfi: true,
            requireKnevMatch: true,
          })
          result.push({
            rowIndex: i + 1,
            slot: 'ferfi',
            searchedCsaladnev: cs,
            searchedKnev: k,
            searchedSzDatum: ferfiSz,
            searchedFerfi: true,
            partnerCsaladnev: noCs,
            partnerKnev: noK,
            partnerSzDatum: noSz,
            marriageDatum,
            candidates,
          })
        }
      }
      // Menyasszony ellenőrzés — keresztnév-egyezés KÖTELEZŐ (a házassággal
      // a családnév változhat, a keresztnév nem). Plus: ha id_ferfi már
      // feloldott, a férj csaladnev-jét scoring-tényezőnek vesszük.
      if (r.id_no == null || r.id_no === '') {
        const cs = String(noCs || '')
        const k = String(noK || '')
        if (cs.trim() && k.trim()) {
          // Ha id_ferfi feloldva (lookup-resolver vagy manualPicks alapján)
          // → kinyerjük a férj csaladnev-jét a scoring-hoz
          let husbandCsaladnev: string | null = null
          const idFerfi = r.id_ferfi
          if (idFerfi != null && idFerfi !== '') {
            const num = Number(idFerfi)
            if (Number.isFinite(num)) {
              const ferfiPerson = personsById.get(num)
              if (ferfiPerson?.csaladnev) {
                husbandCsaladnev = ferfiPerson.csaladnev
              }
            }
          }

          const candidates = scoreAndPickTop({
            searchCsaladnev: cs,
            searchKnev: k,
            searchSzDatum: noSz,
            searchFerfi: false,
            requireKnevMatch: true,
            husbandCsaladnev,
          })
          result.push({
            rowIndex: i + 1,
            slot: 'no',
            searchedCsaladnev: cs,
            searchedKnev: k,
            searchedSzDatum: noSz,
            searchedFerfi: false,
            partnerCsaladnev: ferfiCs,
            partnerKnev: ferfiK,
            partnerSzDatum: ferfiSz,
            marriageDatum,
            candidates,
          })
        }
      }
    } else {
      if (r.id_szemely == null || r.id_szemely === '') {
        const cs = String(r._csaladnev || '')
        const k = String(r._k_nev || '')
        if (cs.trim() && k.trim()) {
          const szcsNev = typeof r._szcs_nev === 'string' && r._szcs_nev.trim()
            ? r._szcs_nev.trim()
            : null
          const candidates = scoreAndPickTop({
            searchCsaladnev: cs,
            searchKnev: k,
            searchSzDatum: typeof r._sz_datum === 'string' ? r._sz_datum : null,
            searchFerfi: coerceFerfi(r._ferfi),
            searchSzcsNev: szcsNev,
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
