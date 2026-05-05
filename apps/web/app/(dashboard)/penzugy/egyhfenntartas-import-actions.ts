'use server'

/**
 * Egyházfenntartás-import server actions (2026-05-06).
 *
 * A wizard 2 fájlt fogad (xlsx + xml), kereszt-fájl deduplikációt csinál,
 * minden sort párosít a `szemely` táblával (quad-lookup), és a
 * `befizetes` táblába importál.
 *
 * Felelősségek:
 *   - parseAndPreviewEgyhf — két fájl parsolása + match + quad-lookup
 *   - executeEgyhfImport   — elfogadott sorok beszúrása a `befizetes`-be
 *
 * A duplikáció-szűrés DB-szintű:
 *   `idx_befizetes_egyhf_import_lookup` index-et használ a
 *   (congregation_id, fizetettev, iratszam, osszeg, id_befizetescel) kulcsra.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseDonorString } from '@/components/finance/finance-import/helpers/donor-string-parser'
import {
  parseXlsxEgyhf,
  type XlsxEgyhfRow,
} from '@/components/finance/finance-import/egyhfenntartas/helpers/xlsx-egyhf-parser'
import {
  parseXmlBevetelek,
  type XmlBevetelekRow,
} from '@/components/finance/finance-import/egyhfenntartas/helpers/xml-bevetelek-parser'
import {
  matchSources,
  type MatchedRow,
} from '@/components/finance/finance-import/egyhfenntartas/helpers/cross-source-matcher'

const EGYHF_SZAMADASI_KOD = '101.01'

// ──────────────────────────────────────────────────────────────────────
// Típusok (a UI-val megosztott)
// ──────────────────────────────────────────────────────────────────────

export interface SzemelyMatchInfo {
  /** Egyetlen biztos egyezés (vagy null) */
  szemelyId: number | null
  /** Család id (akkor van, ha a quad-lookup családon át talált) */
  csaladId: number | null
  /** Több egyezés (manuális választás kell) */
  candidates: Array<{
    szemelyId: number
    csaladId: number | null
    csaladnev: string | null
    k_nev: string | null
    cim: string | null
  }>
  /** Egy debug/UI tooltip — milyen módon talált rá */
  matchMode: 'exact' | 'fuzzy-name' | 'multiple' | 'not-found' | 'company'
}

export interface PreviewMatchedRow {
  /** Stable kliens-key React-hez */
  clientKey: string
  /** Eredeti match-info (xlsx, xml, vagy mindkettő) */
  source: MatchedRow
  /** Tag-egyezés eredménye */
  szemely: SzemelyMatchInfo
  /** A normalizált tételek mezői az importáláshoz */
  finalRow: {
    forrasa: string
    osszeg: number
    datum: string
    nyugta: string
    iratszam: string
    irattipus: string
    fizetettev: number
    megjegyzes: string | null
    ksz: string
  }
}

export interface ParsePreviewResult {
  matched: PreviewMatchedRow[]
  stats: {
    matchCount: number
    onlyXlsxCount: number
    onlyXmlCount: number
    uncertainCount: number
    xlsxTotal: number
    xmlTotal: number
    /** Tag-egyezés eredménye */
    szemelyExactCount: number
    szemelyFuzzyCount: number
    szemelyMultipleCount: number
    szemelyNotFoundCount: number
    szemelyCompanyCount: number
  }
  detectedYear: number | null
  warnings: string[]
}

// ──────────────────────────────────────────────────────────────────────
// 1) parseAndPreviewEgyhf — fájlok parsolása + match + quad-lookup
// ──────────────────────────────────────────────────────────────────────

export async function parseAndPreviewEgyhf(
  formData: FormData,
): Promise<{ data: ParsePreviewResult } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const xlsxFile = formData.get('xlsxFile')
  const xmlFile = formData.get('xmlFile')

  if (!(xlsxFile instanceof File) || xlsxFile.size === 0) {
    return { error: 'A Kassza-xlsx fájl kötelező.' }
  }
  if (!(xmlFile instanceof File) || xmlFile.size === 0) {
    return { error: 'A bevételek-xml fájl kötelező.' }
  }

  const warnings: string[] = []

  let xlsxResult, xmlResult
  try {
    xlsxResult = await parseXlsxEgyhf(await xlsxFile.arrayBuffer())
  } catch (err: unknown) {
    return {
      error: `A Kassza-xlsx parsolása sikertelen: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  try {
    xmlResult = await parseXmlBevetelek(await xmlFile.arrayBuffer())
  } catch (err: unknown) {
    return {
      error: `A bevételek-xml parsolása sikertelen: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  warnings.push(...xlsxResult.warnings, ...xmlResult.warnings)

  // 2) Cross-source matching
  const crossMatch = matchSources(xlsxResult.rows, xmlResult.rows)

  // 3) Profil → congregation_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, congregation_id')
    .eq('id', user.id)
    .single()
  if (!profile?.congregation_id) {
    return { error: 'Nincs hozzád rendelt gyülekezet — kérlek lépj kapcsolatba a rendszergazdával.' }
  }

  // 4) Tag-egyezés minden sorra
  const previewRows: PreviewMatchedRow[] = []
  let szemelyExactCount = 0
  let szemelyFuzzyCount = 0
  let szemelyMultipleCount = 0
  let szemelyNotFoundCount = 0
  let szemelyCompanyCount = 0

  for (let i = 0; i < crossMatch.matched.length; i++) {
    const row = crossMatch.matched[i]
    const finalRow = buildFinalRow(row, xlsxResult.detectedYear || xmlResult.detectedYear)
    if (!finalRow) continue // hiányos kötelező mező — kihagyott

    const parsedDonor = parseDonorString(finalRow.forrasa)

    let szemelyMatch: SzemelyMatchInfo
    if (parsedDonor.isCompany) {
      szemelyMatch = {
        szemelyId: null,
        csaladId: null,
        candidates: [],
        matchMode: 'company',
      }
      szemelyCompanyCount++
    } else {
      szemelyMatch = await lookupSzemely(
        supabase,
        profile.congregation_id,
        parsedDonor,
      )
      switch (szemelyMatch.matchMode) {
        case 'exact':
          szemelyExactCount++
          break
        case 'fuzzy-name':
          szemelyFuzzyCount++
          break
        case 'multiple':
          szemelyMultipleCount++
          break
        case 'not-found':
        default:
          szemelyNotFoundCount++
          break
      }
    }

    previewRows.push({
      clientKey: `egyhf-${i}-${Date.now()}`,
      source: row,
      szemely: szemelyMatch,
      finalRow,
    })
  }

  return {
    data: {
      matched: previewRows,
      stats: {
        ...crossMatch.stats,
        szemelyExactCount,
        szemelyFuzzyCount,
        szemelyMultipleCount,
        szemelyNotFoundCount,
        szemelyCompanyCount,
      },
      detectedYear: xlsxResult.detectedYear || xmlResult.detectedYear,
      warnings,
    },
  }
}

// ──────────────────────────────────────────────────────────────────────
// 2) executeEgyhfImport — elfogadott sorok mentése
// ──────────────────────────────────────────────────────────────────────

export interface ExecuteImportItem {
  clientKey: string
  /** A felhasználó döntése — manuálisan választott szemely, ha más */
  manualSzemelyId?: number | null
  manualCsaladId?: number | null
  /** Skip-ed sorok ne kerüljenek ide */
  finalRow: PreviewMatchedRow['finalRow']
  /** A párolt szemely-info (a server-oldali quad-lookup eredménye) */
  szemelyId: number | null
  csaladId: number | null
}

export interface ExecuteImportResult {
  insertedCount: number
  skippedDuplicateCount: number
  skippedReason: Array<{ clientKey: string; reason: string }>
  errors: string[]
}

export async function executeEgyhfImport(
  items: ExecuteImportItem[],
  selectedYear: number,
): Promise<ExecuteImportResult> {
  const result: ExecuteImportResult = {
    insertedCount: 0,
    skippedDuplicateCount: 0,
    skippedReason: [],
    errors: [],
  }

  if (items.length === 0) {
    result.errors.push('Nincs importálható tétel.')
    return result
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    result.errors.push('Nincs bejelentkezett felhasználó.')
    return result
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, congregation_id')
    .eq('id', user.id)
    .single()
  if (!profile?.congregation_id) {
    result.errors.push('Nincs hozzád rendelt gyülekezet.')
    return result
  }

  // Befizetescel id lookup (101.01)
  const { data: bcData, error: bcErr } = await supabase
    .from('befizetescel')
    .select('id')
    .eq('id_szamadasicel', EGYHF_SZAMADASI_KOD)
    .eq('aktiv', true)
    .maybeSingle()
  if (bcErr || !bcData) {
    result.errors.push(
      `A "${EGYHF_SZAMADASI_KOD}" (Egyházfenntartói járulék) cél nem található vagy nem aktív a befizetescel táblában. Kérlek lépj kapcsolatba a rendszergazdával.`,
    )
    return result
  }
  const idBefizetescel = bcData.id

  // Minden tételen: dup-check + insert
  for (const item of items) {
    const finalSzemelyId = item.manualSzemelyId ?? item.szemelyId
    const finalCsaladId = item.manualCsaladId ?? item.csaladId

    // Dup-check: meglévő befizetes a (cong, év, iratszam, összeg, cél) kulcsra
    const iratszamForDup = item.finalRow.iratszam || ''
    const { data: existing } = await supabase
      .from('befizetes')
      .select('id')
      .eq('congregation_id', profile.congregation_id)
      .eq('fizetettev', selectedYear)
      .eq('iratszam', iratszamForDup)
      .eq('osszeg', item.finalRow.osszeg)
      .eq('id_befizetescel', idBefizetescel)
      .eq('deleted', false)
      .maybeSingle()

    if (existing) {
      result.skippedDuplicateCount++
      result.skippedReason.push({
        clientKey: item.clientKey,
        reason: `Már létezik (befizetes id ${existing.id}) — duplikáció elkerülve.`,
      })
      continue
    }

    // Insert
    const xkey = `egyhf-${profile.congregation_id}-${selectedYear}-${iratszamForDup}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    const { error: insErr } = await supabase.from('befizetes').insert({
      xkey,
      forrasa: item.finalRow.forrasa,
      id_befizetescel: idBefizetescel,
      id_szemely: finalSzemelyId ?? null,
      id_csalad: finalCsaladId ?? null,
      datum: item.finalRow.datum,
      osszeg: item.finalRow.osszeg,
      nyugta: item.finalRow.nyugta,
      iratszam: iratszamForDup,
      irattipus: item.finalRow.irattipus,
      csalad: false,
      deleted: false,
      fizetettev: item.finalRow.fizetettev,
      userid: user.id,
      congregation_id: profile.congregation_id,
      megjegyzes: item.finalRow.megjegyzes,
      synced: true,
      stornozott: false,
    })
    if (insErr) {
      result.errors.push(`${item.clientKey}: ${insErr.message}`)
      continue
    }
    result.insertedCount++
  }

  if (result.insertedCount > 0) {
    revalidatePath('/penzugy', 'layout')
  }

  return result
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function buildFinalRow(
  row: MatchedRow,
  fallbackYear: number | null,
): PreviewMatchedRow['finalRow'] | null {
  const xml = row.xmlRow
  const xlsx = row.xlsxRow

  // Forrása: xml elsőbbség, fallback xlsx
  const forrasa = xml?.rawForrasa ?? xlsx?.rawName ?? null
  if (!forrasa) return null

  // Összeg: xml elsőbbség
  const osszeg = xml?.osszeg ?? xlsx?.osszeg ?? null
  if (osszeg === null) return null

  // Dátum: xml elsőbbség
  const datum = xml?.datum ?? xlsx?.datum ?? null
  if (!datum) return null

  // Iratszám (5 jegyű hivatalos, xml-ből)
  const iratszamNumeric = xml?.iratszam ?? xlsx?.iratszam ?? null
  if (iratszamNumeric === null) return null
  const iratszam = String(iratszamNumeric)

  // Nyugta (1-329 sorszám) — xml.Nyugta vagy xlsx.Iratszam (mind ugyanaz)
  const nyugtaNumeric = xml?.nyugta ?? xlsx?.iratszam ?? null
  const nyugta = nyugtaNumeric !== null ? String(nyugtaNumeric) : ''

  // Irattípus: xml elsőbbség
  const irattipus = xml?.irattipus ?? xlsx?.irattipus ?? 'chitanta'

  // Befizetett év: xml elsőbbség, fallback dátumból
  const fizetettev = xml?.fizetettev ?? fallbackYear ?? parseInt(datum.slice(0, 4), 10)
  if (!fizetettev || !Number.isFinite(fizetettev)) return null

  // Megjegyzés: xml.Megjegyzés vagy xlsx.Megjegyzes (lehet null)
  const megjegyzes = xml?.megjegyzes ?? xlsx?.megjegyzes ?? null

  // Költségvetési kód: xml-ben "101,01" → "101.01" (parser konvertálta)
  // Ha nincs, default "101.01"
  const ksz = xml?.ksz ?? xlsx?.ksz ?? EGYHF_SZAMADASI_KOD

  return {
    forrasa,
    osszeg,
    datum,
    nyugta,
    iratszam,
    irattipus,
    fizetettev,
    megjegyzes,
    ksz,
  }
}

/**
 * Quad-lookup a `szemely` táblában.
 *
 * Algoritmus:
 *   1. Strict match: csaladnev + k_nev + utca + házszám
 *   2. Loose: csak családnév + utca (ha a k_nev nem egyértelmű)
 *   3. Husbandszerű: ha női férjes-név, husbandFamilyName + utca + házszám
 */
async function lookupSzemely(
  supabase: Awaited<ReturnType<typeof createClient>>,
  congregationId: string,
  donor: ReturnType<typeof parseDonorString>,
): Promise<SzemelyMatchInfo> {
  if (donor.isCompany) {
    return {
      szemelyId: null,
      csaladId: null,
      candidates: [],
      matchMode: 'company',
    }
  }

  // 1) Utca-id resolúció (ha van utca-szöveg)
  let utcaId: number | null = null
  if (donor.street) {
    const { data: streetData } = await supabase
      .from('adrstreet')
      .select('id')
      .ilike('name', `%${donor.street}%`)
      .limit(1)
      .maybeSingle()
    if (streetData) utcaId = streetData.id as number
  }

  // 2) Strict match
  // Próbáljuk meg a csaladnev + k_nev + utca + szam kombinációval
  const familyName = donor.husbandFamilyName ?? donor.csaladnev
  if (familyName && utcaId && donor.houseNumber) {
    const baseQuery = supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, c_szam, c_utcaid, ferjk_nev, szcs_nev')
      .eq('c_utcaid', utcaId)
      .eq('c_szam', donor.houseNumber)
      .eq('meghalt', false)

    // Családnév-feltétel (vagy a férj családneve, vagy a saját)
    const { data: candidates } = await baseQuery
    if (candidates && candidates.length > 0) {
      // Szűrjük családnévre + keresztnévre / lánykori névre / férjes-névre
      const filtered = candidates.filter(c => matchesSzemely(c, donor, familyName))
      if (filtered.length === 1) {
        const csaladId = await lookupCsaladId(supabase, filtered[0].id)
        return {
          szemelyId: filtered[0].id,
          csaladId,
          candidates: [],
          matchMode: 'exact',
        }
      }
      if (filtered.length > 1) {
        return {
          szemelyId: null,
          csaladId: null,
          candidates: filtered.map(c => ({
            szemelyId: c.id,
            csaladId: null,
            csaladnev: c.csaladnev,
            k_nev: c.k_nev,
            cim: `${c.c_szam}`,
          })),
          matchMode: 'multiple',
        }
      }
    }
  }

  // 3) Fuzzy-name fallback: csak a családnév alapján a gyülekezetben
  if (familyName) {
    const { data: byName } = await supabase
      .from('szemely')
      .select('id, csaladnev, k_nev, c_szam, c_utcaid, ferjk_nev, szcs_nev')
      .ilike('csaladnev', `%${familyName}%`)
      .eq('meghalt', false)
      .limit(8)

    if (byName && byName.length > 0) {
      const exactByGivenName = byName.filter(
        c =>
          donor.k_nev &&
          c.k_nev &&
          c.k_nev.toLowerCase() === donor.k_nev.toLowerCase(),
      )
      if (exactByGivenName.length === 1) {
        const csaladId = await lookupCsaladId(supabase, exactByGivenName[0].id)
        return {
          szemelyId: exactByGivenName[0].id,
          csaladId,
          candidates: [],
          matchMode: 'fuzzy-name',
        }
      }
      if (byName.length > 1) {
        return {
          szemelyId: null,
          csaladId: null,
          candidates: byName.slice(0, 5).map(c => ({
            szemelyId: c.id,
            csaladId: null,
            csaladnev: c.csaladnev,
            k_nev: c.k_nev,
            cim: c.c_szam ?? null,
          })),
          matchMode: 'multiple',
        }
      }
    }
  }

  return {
    szemelyId: null,
    csaladId: null,
    candidates: [],
    matchMode: 'not-found',
  }
}

interface SzemelyRow {
  id: number
  csaladnev: string | null
  k_nev: string | null
  c_szam: string | null
  c_utcaid: number | null
  ferjk_nev: string | null
  szcs_nev: string | null
}

function matchesSzemely(
  c: SzemelyRow,
  donor: ReturnType<typeof parseDonorString>,
  familyName: string,
): boolean {
  // Családnév-egyezés (saját családnév VAGY férjes-családnév első tokene)
  const cFamily = (c.csaladnev || '').toLowerCase()
  const cFerjk = (c.ferjk_nev || '').toLowerCase()
  const familyLower = familyName.toLowerCase()

  const familyMatches =
    cFamily === familyLower ||
    cFerjk.startsWith(familyLower) ||
    cFamily.includes(familyLower)

  if (!familyMatches) return false

  // Keresztnév-egyezés
  if (donor.k_nev) {
    const cKnev = (c.k_nev || '').toLowerCase()
    if (cKnev === donor.k_nev.toLowerCase()) return true
  }

  // Lánykori családnév (szcs_nev) — ha az XML-ben jelölve van
  if (donor.szcs_nev) {
    const cSzcsNev = (c.szcs_nev || '').toLowerCase()
    if (cSzcsNev === donor.szcs_nev.toLowerCase()) return true
  }

  // Férjes-név teljes (pl. "Beder Győzőné")
  if (donor.husbandName) {
    const cFerjk2 = (c.ferjk_nev || '').toLowerCase()
    if (cFerjk2.includes(donor.husbandName.toLowerCase())) return true
  }

  return false
}

async function lookupCsaladId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  szemelyId: number,
): Promise<number | null> {
  const { data: cs } = await supabase
    .from('csalad')
    .select('id')
    .or(`id_ferfi.eq.${szemelyId},id_no.eq.${szemelyId}`)
    .maybeSingle()
  return cs?.id ?? null
}
