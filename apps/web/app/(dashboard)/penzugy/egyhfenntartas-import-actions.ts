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
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseDonorString } from '@/components/finance/finance-import/helpers/donor-string-parser'
import { parseXlsxEgyhf } from '@/components/finance/finance-import/egyhfenntartas/helpers/xlsx-egyhf-parser'
import { parseXmlBevetelek } from '@/components/finance/finance-import/egyhfenntartas/helpers/xml-bevetelek-parser'
import {
  matchSources,
  type MatchedRow,
} from '@/components/finance/finance-import/egyhfenntartas/helpers/cross-source-matcher'
import {
  buildAllPersonsLookupMap,
  lookupPersonByQuadAttempt,
  type PersonLookupMaps,
} from '@/lib/import/lookup-resolver'
import {
  reconcileWithBooks,
  type ReconcileResult,
  type ReconcileFileRow,
  type ReconcileBookRow,
} from '@/components/finance/finance-import/egyhfenntartas/helpers/books-reconciler'

const EGYHF_SZAMADASI_KOD = '101.01'

// ──────────────────────────────────────────────────────────────────────
// DIAGNOSTICS P1-9: input-validáció (Zod-séma + MIME/size + RLS-scope)
// ──────────────────────────────────────────────────────────────────────

/** Max fájl-méret feltöltésnél (parseAndPreviewEgyhf) — DoS-védelem. */
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024 // 50 MB

/** xlsx MIME-typok — minden böngészőben más; permissive whitelist. */
const ACCEPTED_XLSX_MIMES = new Set<string>([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
  '', // egyes böngészők nem küldenek MIME-typot
])

/** xml MIME-typok — szintén permissive. */
const ACCEPTED_XML_MIMES = new Set<string>([
  'application/xml',
  'text/xml',
  'application/octet-stream',
  '',
])

/** finalRow szerkezet validációja — a kliens-tól érkezett payload-on. */
const finalRowSchema = z.object({
  forrasa: z.string().min(1).max(500),
  osszeg: z.number().finite().min(0).max(1_000_000_000), // 1 mrd RON felső plafon
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD formátum'),
  nyugta: z.string().max(50),
  iratszam: z.string().max(50),
  irattipus: z.string().max(50),
  fizetettev: z.number().int().min(2000).max(2100),
  megjegyzes: z.string().max(2000).nullable(),
  ksz: z.string().max(20),
})

/** Egy import-tétel a kliens-től. */
const executeImportItemSchema = z.object({
  clientKey: z.string().min(1).max(200),
  manualSzemelyId: z.number().int().positive().nullable().optional(),
  manualCsaladId: z.number().int().positive().nullable().optional(),
  finalRow: finalRowSchema,
  szemelyId: z.number().int().positive().nullable(),
  csaladId: z.number().int().positive().nullable(),
})

/** Teljes batch a kliens-től — max 10 000 sor egy importban. */
const importBatchSchema = z.object({
  items: z.array(executeImportItemSchema).max(10_000),
  selectedYear: z.number().int().min(2000).max(2100),
})

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
  /** #2: egyeztetés a DB-ben már könyvelt befizetésekkel (kétirányú hibakeresés). */
  reconcile: ReconcileResult | null
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

  // P1-9b: fájl-méret és MIME-type validáció (DoS + sanity check)
  if (xlsxFile.size > MAX_UPLOAD_SIZE) {
    return { error: `A Kassza-xlsx fájl túl nagy (max ${Math.round(MAX_UPLOAD_SIZE / 1024 / 1024)} MB).` }
  }
  if (xmlFile.size > MAX_UPLOAD_SIZE) {
    return { error: `A bevételek-xml fájl túl nagy (max ${Math.round(MAX_UPLOAD_SIZE / 1024 / 1024)} MB).` }
  }
  if (!ACCEPTED_XLSX_MIMES.has(xlsxFile.type)) {
    return { error: `A Kassza-xlsx fájl-típusa nem támogatott: ${xlsxFile.type || '(üres)'}.` }
  }
  if (!ACCEPTED_XML_MIMES.has(xmlFile.type)) {
    return { error: `A bevételek-xml fájl-típusa nem támogatott: ${xmlFile.type || '(üres)'}.` }
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

  // 4) Tag-egyezés minden sorra — a megosztott, pontosabb lookup-infrastruktúrával.
  //    A teljes tagság-térképet EGYSZER építjük fel (nincs per-soros N+1 query),
  //    majd memóriában oldjuk fel a `lookupPersonByQuadAttempt` 6-szintű fallback-jével
  //    (quad → triple → maiden → keresztnév) + utca/házszám-szűréssel.
  const personMaps = await buildAllPersonsLookupMap(supabase, profile.congregation_id)

  const previewRows: PreviewMatchedRow[] = []
  let szemelyExactCount = 0
  let szemelyFuzzyCount = 0
  let szemelyMultipleCount = 0
  let szemelyNotFoundCount = 0
  let szemelyCompanyCount = 0

  // A pontosan feloldott szemely-id-khez a végén batch-ben kérjük le a csalad-id-t.
  const resolvedSzemelyIds = new Set<number>()
  const pendingCsaladAssign: Array<{ rowIdx: number; szemelyId: number }> = []

  for (let i = 0; i < crossMatch.matched.length; i++) {
    const row = crossMatch.matched[i]
    const finalRow = buildFinalRow(row, xlsxResult.detectedYear || xmlResult.detectedYear)
    if (!finalRow) continue // hiányos kötelező mező — kihagyott

    const parsedDonor = parseDonorString(finalRow.forrasa)

    let szemelyMatch: SzemelyMatchInfo
    if (parsedDonor.isCompany) {
      szemelyMatch = { szemelyId: null, csaladId: null, candidates: [], matchMode: 'company' }
      szemelyCompanyCount++
    } else {
      szemelyMatch = resolveSzemelyViaMaps(parsedDonor, personMaps)
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
      if (szemelyMatch.szemelyId !== null) {
        resolvedSzemelyIds.add(szemelyMatch.szemelyId)
        pendingCsaladAssign.push({ rowIdx: previewRows.length, szemelyId: szemelyMatch.szemelyId })
      }
    }

    previewRows.push({
      clientKey: `egyhf-${i}-${Date.now()}`,
      source: row,
      szemely: szemelyMatch,
      finalRow,
    })
  }

  // 4b) Csalad-id batch-feloldás (egyetlen query az összes feloldott személyre)
  if (resolvedSzemelyIds.size > 0) {
    const csaladBySzemely = await batchLookupCsaladIds(supabase, Array.from(resolvedSzemelyIds))
    for (const { rowIdx, szemelyId } of pendingCsaladAssign) {
      const csaladId = csaladBySzemely.get(szemelyId) ?? null
      if (csaladId !== null) previewRows[rowIdx].szemely.csaladId = csaladId
    }
  }

  // 4c) NINCS vak round-robin auto-elosztás (2026-06-19).
  //     A korábbi logika feltételezte, hogy egy címen több befizetés = több KÜLÖN ember,
  //     és körbe-osztotta őket. A 2025-ös valós adat (bevételek 2025.xml „Befizetett év" +
  //     megjegyzés) ezt MEGCÁFOLTA: a többszörös fizetés ugyanannak a személynek a KÜLÖNBÖZŐ
  //     ÉVEKRE szóló hátraléka (pl. Kádár Barna Zsolt 5 tétele 2021–2025-re). Egy személy
  //     ÉVENTE egyszer fizet → a tételeket NEM osztjuk szét emberek közt. A genuin bizonytalan
  //     (azonos név+cím, pl. apa-fia) eseteket a felhasználó KÉZZEL dönti el a párosító UI-ban —
  //     a rendszer nem tippel (ez okozta a „más fizet, más látszik elmaradottnak" hibát).

  // 5) #2 EGYEZTETÉS A KÖNYVELÉSSEL — a fájl sorait a DB-ben már könyvelt
  //    egyházfenntartási (101.01) befizetésekkel vetjük össze, kétirányú hibakereséssel.
  const selectedYearRaw = formData.get('selectedYear')
  const reconcileYear =
    typeof selectedYearRaw === 'string' && /^\d{4}$/.test(selectedYearRaw)
      ? parseInt(selectedYearRaw, 10)
      : xlsxResult.detectedYear || xmlResult.detectedYear
  let reconcile: ReconcileResult | null = null
  if (reconcileYear) {
    reconcile = await reconcileAgainstBooks(
      supabase,
      profile.congregation_id,
      reconcileYear,
      previewRows,
    )
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
      reconcile,
    },
  }
}

/**
 * #2: a fájl egyházfenntartás-sorait egyezteti a DB-ben már könyvelt 101.01
 * befizetésekkel. A `befizetescel.id_szamadasicel = '101.01'` cél-id alapján
 * lekéri az adott évre könyvelt, nem törölt/nem sztornózott befizetéseket.
 */
async function reconcileAgainstBooks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  congregationId: string,
  year: number,
  previewRows: PreviewMatchedRow[],
): Promise<ReconcileResult | null> {
  const { data: bcData } = await supabase
    .from('befizetescel')
    .select('id')
    .eq('id_szamadasicel', EGYHF_SZAMADASI_KOD)
    .eq('aktiv', true)
    .maybeSingle()
  if (!bcData) return null

  const { data: booked } = await supabase
    .from('befizetes')
    .select('id, forrasa, osszeg, datum, iratszam, nyugta')
    .eq('congregation_id', congregationId)
    .eq('fizetettev', year)
    .eq('id_befizetescel', bcData.id)
    .eq('deleted', false)
    .eq('stornozott', false)

  const bookRows: ReconcileBookRow[] = (booked ?? []).map((b) => ({
    id: b.id as number,
    forrasa: (b.forrasa as string | null) ?? null,
    osszeg: Number(b.osszeg) || 0,
    datum: (b.datum as string | null) ?? null,
    iratszam: (b.iratszam as string | null) ?? null,
    nyugta: (b.nyugta as string | null) ?? null,
  }))

  const fileRows: ReconcileFileRow[] = previewRows.map((r) => ({
    clientKey: r.clientKey,
    forrasa: r.finalRow.forrasa,
    osszeg: r.finalRow.osszeg,
    datum: r.finalRow.datum,
    iratszam: r.finalRow.iratszam,
    nyugta: r.finalRow.nyugta,
  }))

  return reconcileWithBooks(fileRows, bookRows)
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

  // P1-9a: Zod-validáció a kliens-payload-on. Hibás finalRow / túl nagy batch /
  // érvénytelen év azonnal hibára fut, mielőtt bármilyen DB-hívást teszünk.
  const parsed = importBatchSchema.safeParse({ items, selectedYear })
  if (!parsed.success) {
    result.errors.push(
      `Érvénytelen import-payload: ${parsed.error.issues[0]?.message ?? 'ismeretlen séma-hiba'}`,
    )
    return result
  }
  const validatedItems = parsed.data.items
  const validatedYear = parsed.data.selectedYear

  if (validatedItems.length === 0) {
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

  // 2026-07-10 (S3-#3): véglegesített évbe az egyházfenntartás-import sem
  // rögzíthet új tételt — ADMINOKNAK SEM: a zárt évhez előbb feloldás (unlock)
  // kell. A tételek KÖNYVELÉSI dátum-évét ellenőrizzük (a fizetettev lehet
  // korábbi év — az nem könyvelési dátum, csak attribútum).
  const importYears = Array.from(
    new Set(
      validatedItems
        .map((i) => Number(String(i.finalRow.datum || '').slice(0, 4)))
        .filter((y) => Number.isFinite(y) && y >= 2000),
    ),
  )
  if (importYears.length > 0) {
    const { data: lockRows } = await supabase
      .from('bealitas')
      .select('id, accounting_finalized')
      .eq('congregation_id', profile.congregation_id)
      .in('id', importYears.map(String))
    const closedYears = ((lockRows || []) as Array<{ id: string; accounting_finalized: boolean | null }>)
      .filter((r) => r.accounting_finalized)
      .map((r) => Number(r.id))
      .sort((a, b) => a - b)
    if (closedYears.length > 0) {
      result.errors.push(
        `A ${closedYears.join(', ')}. évi számadás már véglegesítve van — az import blokkolva. Először kérj javítási engedélyt az egyházmegyétől (feloldás), utána próbáld újra.`,
      )
      return result
    }
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

  // P1-9c: RLS-aware id_szemely / id_csalad batch-check.
  // Egy rosszhiszemű kliens más gyülekezet szemely.id-jét vagy csalad.id-jét
  // helyettesíthetné — itt egy batch-query verifikálja, hogy minden hivatkozott
  // ID a HIVÓ gyülekezetében van. A nem-stimmelő ID-jű tételek skip-elve lesznek.
  const allSzemelyIds = new Set<number>()
  const allCsaladIds = new Set<number>()
  for (const item of validatedItems) {
    const sz = item.manualSzemelyId ?? item.szemelyId
    const cs = item.manualCsaladId ?? item.csaladId
    if (sz !== null && sz !== undefined) allSzemelyIds.add(sz)
    if (cs !== null && cs !== undefined) allCsaladIds.add(cs)
  }
  const validSzemelyIds = new Set<number>()
  const validCsaladIds = new Set<number>()
  if (allSzemelyIds.size > 0) {
    const { data: szRows } = await supabase
      .from('szemely')
      .select('id')
      .in('id', Array.from(allSzemelyIds))
      .eq('congregation_id', profile.congregation_id)
    for (const r of szRows ?? []) {
      if (typeof r.id === 'number') validSzemelyIds.add(r.id)
    }
  }
  if (allCsaladIds.size > 0) {
    // 2026-06-01 (hibrid család-modell Fázis 2): a régi `csalad` táblán nincs
    // congregation_id oszlop (a query sosem talált semmit). Helyette az új
    // `haztartas`-ből szűrünk congregation_id szerint, és a legacy_csalad_id
    // visszafelé-kompatibilis a régi csalad.id-vel.
    const { data: csRows } = await supabase
      .from('haztartas')
      .select('legacy_csalad_id')
      .in('legacy_csalad_id', Array.from(allCsaladIds))
      .eq('congregation_id', profile.congregation_id)
    for (const r of csRows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const id = (r as any).legacy_csalad_id
      if (typeof id === 'number') validCsaladIds.add(id)
    }
  }

  // Minden tételen: scope-check, dup-check, insert
  for (const item of validatedItems) {
    const rawSzemelyId = item.manualSzemelyId ?? item.szemelyId
    const rawCsaladId = item.manualCsaladId ?? item.csaladId
    // P1-9c: ha a hivatkozott ID nem stimmel a gyülekezethez, NULL-lá tesszük
    // és skip-jelzéssel folytatjuk (a befizetes attribútumai megmaradnak).
    let finalSzemelyId: number | null = null
    let finalCsaladId: number | null = null
    if (rawSzemelyId !== null && rawSzemelyId !== undefined) {
      if (validSzemelyIds.has(rawSzemelyId)) {
        finalSzemelyId = rawSzemelyId
      } else {
        result.skippedReason.push({
          clientKey: item.clientKey,
          reason: `Az ${rawSzemelyId} szemely.id nem a saját gyülekezetedhez tartozik — összerendelés ignorálva.`,
        })
      }
    }
    if (rawCsaladId !== null && rawCsaladId !== undefined) {
      if (validCsaladIds.has(rawCsaladId)) {
        finalCsaladId = rawCsaladId
      } else {
        result.skippedReason.push({
          clientKey: item.clientKey,
          reason: `Az ${rawCsaladId} csalad.id nem a saját gyülekezetedhez tartozik — összerendelés ignorálva.`,
        })
      }
    }

    // Dup-check: meglévő befizetes a (cong, év, iratszam, összeg, cél, SZEMÉLY)
    // kulcsra. P1-5: az `id_szemely` is a kulcs része — egy tömbös nyugtán (azonos
    // iratszám) több KÜLÖN személy azonos összegű befizetése így NEM ütközik
    // (korábban a 2. tétel némán „duplikátumként" kiesett → adatvesztés). A
    // `.limit(1)` véd a történelmi >1 találat okozta PGRST116-hiba ellen.
    const iratszamForDup = item.finalRow.iratszam || ''
    let dupQuery = supabase
      .from('befizetes')
      .select('id')
      .eq('congregation_id', profile.congregation_id)
      .eq('fizetettev', validatedYear)
      .eq('iratszam', iratszamForDup)
      .eq('osszeg', item.finalRow.osszeg)
      .eq('id_befizetescel', idBefizetescel)
      .eq('deleted', false)
    dupQuery =
      finalSzemelyId === null
        ? dupQuery.is('id_szemely', null)
        : dupQuery.eq('id_szemely', finalSzemelyId)
    const { data: existing } = await dupQuery.limit(1).maybeSingle()

    if (existing) {
      result.skippedDuplicateCount++
      result.skippedReason.push({
        clientKey: item.clientKey,
        reason: `Már létezik (befizetes id ${existing.id}) — duplikáció elkerülve.`,
      })
      continue
    }

    // Insert
    const xkey = `egyhf-${profile.congregation_id}-${validatedYear}-${iratszamForDup}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

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
 * Tag-egyeztetés a megosztott, memóriában futó lookup-infrastruktúrával.
 *
 * A korábbi inline `lookupSzemely` per-soros DB-query-kkel dolgozott (N+1) és csak
 * a férjes-családnévre + utca-ilike-ra épült. Ehelyett most a `lookupPersonByQuadAttempt`
 * 6-szintű fallback-láncát használjuk (quad → triple → maiden → keresztnév) + utca/házszám
 * pontos szűréssel — UGYANAZ, amit a Kassza-import wizard használ.
 */
function resolveSzemelyViaMaps(
  donor: ReturnType<typeof parseDonorString>,
  maps: PersonLookupMaps,
): SzemelyMatchInfo {
  if (donor.isCompany) {
    return { szemelyId: null, csaladId: null, candidates: [], matchMode: 'company' }
  }

  // A férjes asszonynak a Kasszában nincs saját családneve — a férj családnevét
  // (husbandFamilyName) használjuk fő kulcsként, a lánykorit (szcs_nev) maiden-fallbackre.
  const familyName = donor.csaladnev ?? donor.husbandFamilyName
  const ferfiFlag: 'M' | 'F' | '?' = donor.husbandName ? 'F' : '?'

  const lookup = lookupPersonByQuadAttempt(
    familyName,
    donor.k_nev,
    donor.szcs_nev,
    null,
    ferfiFlag,
    maps,
    donor.street,
    donor.houseNumber,
  )

  if (!lookup) {
    return { szemelyId: null, csaladId: null, candidates: [], matchMode: 'not-found' }
  }

  if ('id' in lookup) {
    return { szemelyId: Number(lookup.id), csaladId: null, candidates: [], matchMode: 'exact' }
  }

  // Több jelölt — a UI manuális választást kér
  const candidates = lookup.candidates.map((idStr) => {
    const rec = maps.byId.get(idStr)
    const addr = maps.addressById.get(idStr)
    const cim = addr
      ? [addr.streetName, addr.houseNumber].filter(Boolean).join(' ').trim() || null
      : null
    return {
      szemelyId: Number(idStr),
      csaladId: null,
      csaladnev: rec?.csaladnev ?? null,
      k_nev: rec?.k_nev ?? null,
      cim,
    }
  })

  return {
    szemelyId: null,
    csaladId: null,
    candidates,
    matchMode: lookup.approximate ? 'fuzzy-name' : 'multiple',
  }
}

/**
 * Csalad-id batch-feloldás a hibrid család-modellből (haztartas_tag → haztartas.legacy_csalad_id),
 * egyetlen query-vel az összes feloldott személyre — a per-soros `lookupCsaladId` N+1-jét kerüli.
 */
async function batchLookupCsaladIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  szemelyIds: number[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>()
  if (szemelyIds.length === 0) return result

  const { data: tagRows } = await supabase
    .from('haztartas_tag')
    .select('id_szemely, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
    .in('id_szemely', szemelyIds)
    .is('ervenyes_ig', null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (tagRows || []) as any[]) {
    const szId = row.id_szemely as number
    if (result.has(szId)) continue
    const h = Array.isArray(row.haztartas) ? row.haztartas[0] : row.haztartas
    if (h && h.isaktiv === true && h.ervenyes_ig == null && h.legacy_csalad_id) {
      result.set(szId, h.legacy_csalad_id as number)
    }
  }
  return result
}
