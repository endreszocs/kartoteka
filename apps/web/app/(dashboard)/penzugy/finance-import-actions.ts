'use server'

/**
 * Pénzügyi import server action-ök.
 *
 * 4 akció a wizard kiszolgálására:
 *   1. parseAndPreviewFinance(formData) — fájl parse + sheet előnézet
 *   2. analyzeKasszaRows(formData)      — Kassza fül sor-szétválasztás
 *   3. resolveBudgetCodes(formData)     — költségvetési kódok feloldása
 *   4. resolveDonors(formData)          — befizető-stringek feloldása szemely-ID-re
 *
 * Az 5. (executeFinanceImport) a Fázis 6-ban kerül implementálásra.
 *
 * **Csak admin** role-nak — minden action a `getEffectiveAccessContext()`-szel
 * ellenőrzi a jogosultságot, és csak a `master`/`admin`/`egyhazkeruletiAdmin`
 * vagy `konyvelo` (saját gyülekezet) role-okat fogadja el.
 *
 * 2026-05-02 (Fázis 3): első verzió.
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  parseWorkbook,
  parseCsvString,
  parseXmlSpreadsheet,
  type ParsedSheet,
  type ParsedWorkbook,
} from '@/lib/import/excel-parser'
import {
  buildAllPersonsLookupMap,
  lookupPersonByQuadAttempt,
  type PersonLookupMaps,
  type LookupRecord,
} from '@/lib/import/lookup-resolver'
import { parseDonorString } from '@/components/finance/finance-import/helpers/donor-string-parser'
import { splitKasszaRow } from '@/components/finance/finance-import/helpers/kassza-row-classifier'
import {
  buildBudgetCodeMaps,
  resolveBudgetCode,
  normalizeBudgetCode,
} from '@/components/finance/finance-import/helpers/budget-code-resolver'
import {
  diagnoseMonetar,
  type MonetarDiagnostic,
} from '@/components/finance/finance-import/helpers/monetar-diagnostic'
import {
  parseXmlBevetelek,
  type XmlBevetelekRow,
} from '@/components/finance/finance-import/egyhfenntartas/helpers/xml-bevetelek-parser'
import {
  detectKasszaColumns,
  type KasszaFieldKey,
} from '@/components/finance/finance-import/helpers/kassza-column-mapping'
import { applyKasszaFix } from '@/components/finance/finance-import/helpers/kassza-sheet-parser'
import { logImportRun } from '@/lib/import/import-log'
import type {
  FinanceParseResult,
  FinanceSheetPreview,
  KasszaAnalysisResult,
  KasszaStats,
  ClassifiedKasszaRow,
  BudgetCodeResolutionResult,
  BudgetCodeResolution,
  DonorResolutionResult,
  DonorResolution,
  ResolvedSzemelyCandidate,
  FinanceImportItem,
  FinanceImportResult,
} from './finance-import-types'

// ════════════════════════════════════════════════════════════════════════
// Közös segédfüggvények
// ════════════════════════════════════════════════════════════════════════

/**
 * Auth-ellenőrzés: csak admin-jellegű szerepkör. A `konyvelo` is megengedett,
 * mert a pénzügyi import a könyvelési munkamenethez tartozik (de mindenképp
 * approved kell legyen).
 */
async function requireFinanceImportAccess() {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' as const }
  if (!access.effectiveCongregationId) {
    return { error: 'Nincs aktív gyülekezet kiválasztva.' as const }
  }
  const allowed =
    access.master ||
    access.admin ||
    access.egyhazkeruletiAdmin ||
    access.konyvelo
  if (!allowed) {
    return {
      error: 'Pénzügyi import csak rendszergazdának vagy könyvelőnek érhető el.' as const,
    }
  }
  return { access, congregationId: access.effectiveCongregationId, userId: access.user.id }
}

/**
 * A FormData-ból File-t olvasó, validáló helper.
 */
async function parseUploadedFile(
  formData: FormData,
): Promise<{ workbook?: ParsedWorkbook; error?: string }> {
  const file = formData.get('file') as File | null
  if (!file) return { error: 'Nincs fájl kiválasztva.' }

  if (file.size > 10 * 1024 * 1024) {
    return { error: 'A fájl mérete meghaladja a 10 MB-os limitet.' }
  }

  const ext = file.name.toLowerCase().split('.').pop()
  if (!['xlsx', 'xls', 'csv', 'xml'].includes(ext || '')) {
    return {
      error: 'Nem támogatott fájlformátum. Elfogadott: .xlsx, .xls, .csv, .xml',
    }
  }

  try {
    if (ext === 'csv') {
      const text = await file.text()
      return { workbook: parseCsvString(text, file.name) }
    } else if (ext === 'xml') {
      const text = await file.text()
      return { workbook: parseXmlSpreadsheet(text, file.name) }
    } else {
      const buffer = await file.arrayBuffer()
      const workbook = parseWorkbook(buffer, file.name)
      // A Kassza fül első 4 sora tájékoztató szöveg, az 5. az igazi fejléc.
      // Az automatikus fejléc-detektálás tévesen az 1. sort veszi fejlécnek,
      // ezért külön újrabontjuk a Kassza fülét a "Dátum"-mal kezdődő sorra.
      const fixed = applyKasszaFix(workbook, buffer)
      return { workbook: fixed }
    }
  } catch (e) {
    return {
      error: `A fájl olvasása sikertelen: ${e instanceof Error ? e.message : 'ismeretlen hiba'}.`,
    }
  }
}

/**
 * A Kassza fül `ParsedSheet` rekordjából egy "virtuális oszlopos" rekordot
 * alakít, amit a `splitKasszaRow` és `parseDonorString` tud értelmezni.
 *
 * A Kassza fejléc sorrendje:
 *   col D=Dátum, E=Iratszám, F=Irattip., G=Név,
 *   H=Bev. - Összeg, I=Bevétel - Költ.vet. név,
 *   J=Kiad. - Összeg, K=Kiadás - költ.vet. név,
 *   L=Megjegyzés, M=Magyarázat, N=Költségvetési szám
 */
function kasszaRowToRecord(
  row: Record<string, string | number | null>,
  headers: string[],
): Record<string, unknown> {
  // EGYETLEN FORRÁS: ugyanaz az oszlop-felismerés, amit az ellenőrző UI is mutat
  // (`kassza-column-mapping.ts`) → amit a felhasználó lát, az a tényleges parsolás.
  const { mapping } = detectKasszaColumns(headers)
  const get = (k: KasszaFieldKey) => (mapping[k] ? row[mapping[k] as string] : null)

  return {
    datum: get('datum'),
    iratszam: get('iratszam'),
    irattipus: get('irattipus'),
    _donor_string: get('nev'),
    _bev_osszeg: get('bevOsszeg'),
    _bev_cel_nev: get('bevCel'),
    _kia_osszeg: get('kiaOsszeg'),
    _kia_cel_nev: get('kiaCel'),
    megjegyzes: get('megjegyzes'),
    _szamadasicel_kod: get('kod'),
  }
}

// ════════════════════════════════════════════════════════════════════════
// 1. parseAndPreviewFinance — fájl parse + sheet előnézet
// ════════════════════════════════════════════════════════════════════════

export async function parseAndPreviewFinance(
  formData: FormData,
): Promise<FinanceParseResult> {
  const auth = await requireFinanceImportAccess()
  if ('error' in auth) return { error: auth.error }

  const parseResult = await parseUploadedFile(formData)
  if (parseResult.error) return { error: parseResult.error }
  const workbook = parseResult.workbook!

  const sheets: FinanceSheetPreview[] = workbook.sheets.map((sheet) => {
    const isKasszaSheet = sheet.name.trim().toLowerCase() === 'kassza'
    return {
      sheetName: sheet.name,
      headers: sheet.headers,
      rowCount: sheet.rowCount,
      isKasszaSheet,
      sampleRows: sheet.rows.slice(0, 5),
      openingBalance: sheet.openingBalance ?? null,
      closingBalance: sheet.closingBalance ?? null,
    }
  })

  return {
    success: true,
    fileName: workbook.fileName,
    isCsv: workbook.isCsv,
    sheets,
  }
}

// ════════════════════════════════════════════════════════════════════════
// 1b. parseXmlReference — opcionális bevételek-XML referencia (overlay-hez)
// ════════════════════════════════════════════════════════════════════════

export interface XmlReferenceResult {
  success?: boolean
  error?: string
  rows?: XmlBevetelekRow[]
}

/**
 * A felhasználó által OPCIONÁLISAN feltöltött `bevételek YYYY.xml` referencia-fájl
 * parse-olása MINDEN bevétel-kategóriára (categoryKeyword: null). A kliens ezután az
 * `applyXmlOverlay`-jel egyezteti a Kassza bevétel-soraival (Befizetett év + hivatalos
 * iratszám átvétele). Beszúrást NEM végez — csak referencia.
 */
export async function parseXmlReference(formData: FormData): Promise<XmlReferenceResult> {
  const auth = await requireFinanceImportAccess()
  if ('error' in auth) return { error: auth.error }

  const file = formData.get('xmlFile')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Nincs XML-referencia fájl.' }
  }
  if (file.size > 50 * 1024 * 1024) {
    return { error: 'Az XML-referencia túl nagy (max 50 MB).' }
  }
  try {
    const parsed = await parseXmlBevetelek(await file.arrayBuffer(), { categoryKeyword: null })
    return { success: true, rows: parsed.rows }
  } catch (e) {
    return {
      error: `Az XML-referencia olvasása sikertelen: ${e instanceof Error ? e.message : 'ismeretlen hiba'}.`,
    }
  }
}

// ════════════════════════════════════════════════════════════════════════
// 2. analyzeKasszaRows — Kassza fül sor-szétválasztás
// ════════════════════════════════════════════════════════════════════════

export async function analyzeKasszaRows(
  formData: FormData,
): Promise<KasszaAnalysisResult> {
  const auth = await requireFinanceImportAccess()
  if ('error' in auth) return { error: auth.error }

  const parseResult = await parseUploadedFile(formData)
  if (parseResult.error) return { error: parseResult.error }
  const workbook = parseResult.workbook!

  // A Kassza sheet keresése
  const kasszaSheet = workbook.sheets.find(
    (s) => s.name.trim().toLowerCase() === 'kassza',
  )
  if (!kasszaSheet) {
    return { error: 'A fájlban nincs "Kassza" nevű munkalap.' }
  }
  if (kasszaSheet.warning) {
    return { error: `A Kassza fül problémás: ${kasszaSheet.warning}` }
  }

  return analyzeKasszaSheet(kasszaSheet)
}

/**
 * Kassza fül analízisének belső megvalósítása — egy `ParsedSheet` bemenet,
 * a klasszifikáció + statisztika.
 *
 * **Dátum-örökítés**: a hivatalos EREK könyvelési Excel "Kassza" fülén az
 * azonos napra eső sorok közül csak az ELSŐ kapott dátumot — a többi sor
 * dátum-mezője üres, és vizuálisan a fenti sor dátumát örökli. Ezt itt
 * forward-fill-jük, hogy minden importálandó tételhez legyen érvényes dátum.
 */
function analyzeKasszaSheet(kasszaSheet: ParsedSheet): KasszaAnalysisResult {
  const stats: KasszaStats = {
    income: 0,
    expense: 0,
    internalTransferIn: 0,
    internalTransferOut: 0,
    skip: 0,
    total: 0,
  }

  const rows: ClassifiedKasszaRow[] = []
  const uniqueBudgetCodes = new Set<string>()
  const uniqueDonorStrings = new Set<string>()

  // Forward-fill változó: az utolsó nem-üres dátum, amit ezután következő üres
  // dátumú soroknak átörökítünk. Az "Előző évi készpénzegyenleg" sornál is van
  // dátum, így ezzel kezdődik.
  let lastDatum: string | null = null

  for (let i = 0; i < kasszaSheet.rows.length; i++) {
    const rawRow = kasszaSheet.rows[i]
    const record = kasszaRowToRecord(rawRow, kasszaSheet.headers)

    // Dátum-örökítés a record beállítása előtt: ha a sor dátum-mezője üres,
    // de van fenti dátumunk, ezt használjuk a record.datum-hoz is, hogy a
    // splitKasszaRow valós dátummal kapja meg.
    if (typeof record.datum === 'string' && record.datum.trim() !== '') {
      lastDatum = record.datum
    } else if (lastDatum) {
      record.datum = lastDatum
    }

    const classified = splitKasszaRow(record)

    stats.total++

    const datum = typeof record.datum === 'string' ? record.datum : null
    const iratszam =
      record.iratszam !== null && record.iratszam !== undefined
        ? String(record.iratszam)
        : null
    const irattipus = typeof record.irattipus === 'string' ? record.irattipus : null
    const megjegyzes = typeof record.megjegyzes === 'string' ? record.megjegyzes : null
    const kodRaw =
      record._szamadasicel_kod !== null && record._szamadasicel_kod !== undefined
        ? String(record._szamadasicel_kod)
        : null
    const kodNorm = kodRaw ? normalizeBudgetCode(kodRaw) : null

    if (kodNorm) uniqueBudgetCodes.add(kodNorm)

    const donor =
      typeof record._donor_string === 'string' ? record._donor_string : null
    if (donor && classified.kind !== 'skip') uniqueDonorStrings.add(donor)

    const baseRow: ClassifiedKasszaRow = {
      rowIndex: i,
      kind: classified.kind,
      datum,
      iratszam,
      irattipus,
      megjegyzes,
      budgetCode: kodNorm,
    }

    switch (classified.kind) {
      case 'income': {
        stats.income++
        rows.push({
          ...baseRow,
          amount: classified.bevOsszeg,
          celNev: classified.celNev,
          donorString: classified.donorString,
        })
        break
      }
      case 'expense': {
        stats.expense++
        rows.push({
          ...baseRow,
          amount: classified.kiaOsszeg,
          celNev: classified.celNev,
          donorString: classified.targetText,
        })
        break
      }
      case 'internal-transfer-in': {
        stats.internalTransferIn++
        rows.push({
          ...baseRow,
          amount: classified.amount,
          celNev: classified.celNev,
          donorString: classified.bankRef,
        })
        break
      }
      case 'internal-transfer-out': {
        stats.internalTransferOut++
        rows.push({
          ...baseRow,
          amount: classified.amount,
          celNev: classified.celNev,
          donorString: classified.bankRef,
        })
        break
      }
      case 'skip': {
        stats.skip++
        // A skipnél is megtartjuk a donorString-et és az amount-ot, mert
        // a Monetar diagnosztikához az "Előző évi készpénzegyenleg" sor
        // értékét kell visszanyerni.
        const bevAmount =
          typeof record._bev_osszeg === 'number'
            ? record._bev_osszeg
            : null
        const kiaAmount =
          typeof record._kia_osszeg === 'number'
            ? record._kia_osszeg
            : null
        rows.push({
          ...baseRow,
          skipReason: classified.reason,
          donorString: donor,
          amount: bevAmount ?? kiaAmount ?? undefined,
        })
        break
      }
    }
  }

  return {
    success: true,
    stats,
    rows,
    uniqueBudgetCodes: [...uniqueBudgetCodes].sort(),
    uniqueDonorStrings: [...uniqueDonorStrings].sort(),
  }
}

// ════════════════════════════════════════════════════════════════════════
// 3. resolveBudgetCodes — költségvetési kódok feloldása
// ════════════════════════════════════════════════════════════════════════

export async function resolveBudgetCodes(
  formData: FormData,
): Promise<BudgetCodeResolutionResult> {
  const auth = await requireFinanceImportAccess()
  if ('error' in auth) return { error: auth.error }

  const parseResult = await parseUploadedFile(formData)
  if (parseResult.error) return { error: parseResult.error }
  const workbook = parseResult.workbook!

  const kasszaSheet = workbook.sheets.find(
    (s) => s.name.trim().toLowerCase() === 'kassza',
  )
  if (!kasszaSheet) {
    return { error: 'A fájlban nincs "Kassza" nevű munkalap.' }
  }

  // Kódok kigyűjtése
  const kodCounts = new Map<string, { rawKod: string; count: number }>()
  for (const rawRow of kasszaSheet.rows) {
    const record = kasszaRowToRecord(rawRow, kasszaSheet.headers)
    const kodRaw =
      record._szamadasicel_kod !== null && record._szamadasicel_kod !== undefined
        ? String(record._szamadasicel_kod)
        : null
    if (!kodRaw || kodRaw.trim() === '') continue
    const norm = normalizeBudgetCode(kodRaw)
    const key = norm ?? `__raw__${kodRaw}`
    const existing = kodCounts.get(key)
    if (existing) {
      existing.count++
    } else {
      kodCounts.set(key, { rawKod: kodRaw, count: 1 })
    }
  }

  // Supabase-ből feltöltjük a kód-térképet
  const maps = await buildBudgetCodeMaps(auth.access.supabase, auth.congregationId)

  const resolutions: BudgetCodeResolution[] = []
  for (const [, { rawKod, count }] of kodCounts) {
    const result = resolveBudgetCode(rawKod, maps)
    if (result.kind === 'income') {
      resolutions.push({
        rawKod,
        normalizedKod: result.szamadasicel,
        kind: 'income',
        befizetescelId: result.befizetescelId,
        szamadasicelNev: maps.szamadasicel.get(result.szamadasicel)?.nev,
        occurrenceCount: count,
      })
    } else if (result.kind === 'expense') {
      resolutions.push({
        rawKod,
        normalizedKod: result.szamadasicel,
        kind: 'expense',
        kiadascelId: result.kiadascelId,
        szamadasicelNev: maps.szamadasicel.get(result.szamadasicel)?.nev,
        occurrenceCount: count,
      })
    } else if (result.kind === 'internal-transfer') {
      // 400.xx kódoknál mindkét cel-ID visszamehet — ez teszi lehetővé a
      // kassza→bank és bank→kassza átvitelek importálását.
      resolutions.push({
        rawKod,
        normalizedKod: result.szamadasicel,
        kind: 'internal-transfer',
        befizetescelId: result.befizetescelId,
        kiadascelId: result.kiadascelId,
        szamadasicelNev: result.nev,
        occurrenceCount: count,
      })
    } else {
      resolutions.push({
        rawKod,
        normalizedKod: normalizeBudgetCode(rawKod),
        kind: 'unknown',
        reason: result.reason,
        occurrenceCount: count,
      })
    }
  }

  // Rendezés: occurrence-szám szerint csökkenő
  resolutions.sort((a, b) => b.occurrenceCount - a.occurrenceCount)

  return { success: true, resolutions }
}

// ════════════════════════════════════════════════════════════════════════
// 4. resolveDonors — befizető-stringek feloldása szemely-ID-re
// ════════════════════════════════════════════════════════════════════════

export async function resolveDonors(
  formData: FormData,
): Promise<DonorResolutionResult> {
  const auth = await requireFinanceImportAccess()
  if ('error' in auth) return { error: auth.error }

  const parseResult = await parseUploadedFile(formData)
  if (parseResult.error) return { error: parseResult.error }
  const workbook = parseResult.workbook!

  const kasszaSheet = workbook.sheets.find(
    (s) => s.name.trim().toLowerCase() === 'kassza',
  )
  if (!kasszaSheet) {
    return { error: 'A fájlban nincs "Kassza" nevű munkalap.' }
  }

  // Egyedi donor-stringek kigyűjtése + occurrence-szám
  const donorCounts = new Map<string, number>()
  for (const rawRow of kasszaSheet.rows) {
    const record = kasszaRowToRecord(rawRow, kasszaSheet.headers)
    const classified = splitKasszaRow(record)
    if (classified.kind === 'skip') continue
    const donor =
      typeof record._donor_string === 'string' ? record._donor_string.trim() : ''
    if (donor) {
      donorCounts.set(donor, (donorCounts.get(donor) || 0) + 1)
    }
  }

  // Person-lookup map felépítése (a teljes gyülekezeti tagsággal)
  const personMaps = await buildAllPersonsLookupMap(
    auth.access.supabase,
    auth.congregationId,
  )

  const resolutions: DonorResolution[] = []
  for (const [donor, count] of donorCounts) {
    resolutions.push(resolveSingleDonor(donor, count, personMaps))
  }

  // Rendezés: cégek alulra (kvázi "tisztább" mind a magánszemélyek esetén)
  resolutions.sort((a, b) => {
    if (a.isCompany !== b.isCompany) return a.isCompany ? 1 : -1
    return b.occurrenceCount - a.occurrenceCount
  })

  return { success: true, resolutions }
}

/**
 * Egy donor-string parse-olása + szemely-feloldás kombinálva.
 */
function resolveSingleDonor(
  donor: string,
  occurrenceCount: number,
  personMaps: PersonLookupMaps,
): DonorResolution {
  const parsed = parseDonorString(donor)

  if (parsed.isCompany) {
    return {
      raw: donor,
      isCompany: true,
      parseConfidence: parsed.parseConfidence,
      status: 'company',
      occurrenceCount,
    }
  }

  // Készítsük elő a quad-lookup paramétereket
  const csaladnev = parsed.csaladnev || parsed.husbandFamilyName
  const k_nev = parsed.k_nev
  const szcs_nev = parsed.szcs_nev

  // Közös alap-objektum a parse-eredménnyel (raw + isCompany kihagyva,
  // mert azokat explicit állítjuk)
  const parsedBase = {
    csaladnev: parsed.csaladnev,
    k_nev: parsed.k_nev,
    husbandFamilyName: parsed.husbandFamilyName,
    husbandName: parsed.husbandName,
    szcs_nev: parsed.szcs_nev,
    prefix: parsed.prefix,
    street: parsed.street,
    houseNumber: parsed.houseNumber,
    parseConfidence: parsed.parseConfidence,
  }

  if (!csaladnev && !szcs_nev && !k_nev) {
    return {
      raw: donor,
      isCompany: false,
      ...parsedBase,
      status: 'unparsed',
      occurrenceCount,
    }
  }

  // Ferfi-flag heurisztika: ha husbandFamilyName van, akkor nő (F);
  // ha "né"-jelölés nincs és prefix='Elv.' nélküli, akkor ?-nek hagyjuk
  const ferfiFlag: 'M' | 'F' | '?' = parsed.husbandName ? 'F' : '?'

  // Utca-alapú szűrés: ha a parsed adott utca + házszámot, használjuk
  // az ambiguous-ok eldöntéséhez (pl. "Beder Győző: Főút 27 / Főút 144")
  const lookup = lookupPersonByQuadAttempt(
    csaladnev,
    k_nev,
    szcs_nev,
    null,
    ferfiFlag,
    personMaps,
    parsed.street,
    parsed.houseNumber,
  )

  if (!lookup) {
    return {
      raw: donor,
      isCompany: false,
      ...parsedBase,
      status: 'not-found',
      occurrenceCount,
    }
  }

  if ('id' in lookup) {
    return {
      raw: donor,
      isCompany: false,
      ...parsedBase,
      status: 'resolved',
      szemelyId: lookup.id,
      occurrenceCount,
    }
  }

  // Több jelölt — visszaadjuk a candidate-listát
  const candidates: ResolvedSzemelyCandidate[] = lookup.candidates
    .map((id) => personMaps.byId.get(id))
    .filter((rec): rec is LookupRecord => rec !== undefined)
    .map((rec) => {
      const addr = personMaps.addressById.get(rec.id)
      const cim = addr
        ? [addr.streetName, addr.houseNumber].filter(Boolean).join(' ').trim() || null
        : null
      return {
        id: rec.id,
        csaladnev: rec.csaladnev || null,
        k_nev: rec.k_nev || null,
        szcs_nev: rec.szcs_nev || null,
        sz_datum: rec.sz_datum || null,
        ferfi: typeof rec.ferfi === 'boolean' ? rec.ferfi : null,
        cim,
      }
    })

  return {
    raw: donor,
    isCompany: false,
    ...parsedBase,
    status: 'ambiguous',
    candidates,
    occurrenceCount,
  }
}

// ════════════════════════════════════════════════════════════════════════
// 5. getMonetarDiagnostic — Monetar fül diagnosztika
// ════════════════════════════════════════════════════════════════════════

export interface MonetarDiagnosticResult {
  success?: boolean
  error?: string
  diagnostic?: MonetarDiagnostic
}

export async function getMonetarDiagnostic(
  formData: FormData,
  totalIncome: number,
  totalExpense: number,
  nyitoEgyenleg: number,
): Promise<MonetarDiagnosticResult> {
  const auth = await requireFinanceImportAccess()
  if ('error' in auth) return { error: auth.error }

  const parseResult = await parseUploadedFile(formData)
  if (parseResult.error) return { error: parseResult.error }
  const workbook = parseResult.workbook!

  const monetarSheet = workbook.sheets.find(
    (s) => s.name.trim().toLowerCase() === 'monetar',
  ) || null

  const diagnostic = diagnoseMonetar(
    monetarSheet,
    totalIncome,
    totalExpense,
    nyitoEgyenleg,
  )

  return { success: true, diagnostic }
}

// ════════════════════════════════════════════════════════════════════════
// 6. executeFinanceImport — RPC hívás + import-log
// ════════════════════════════════════════════════════════════════════════

export async function executeFinanceImport(
  items: FinanceImportItem[],
  fileName: string,
): Promise<FinanceImportResult> {
  const auth = await requireFinanceImportAccess()
  if ('error' in auth) return { error: auth.error }

  if (items.length === 0) {
    return { error: 'Nincs importálandó tétel.' }
  }

  // Kliens-oldali items → DB-formátum (RPC kompatibilis JSONB)
  // A `pending-bank-deposit` és `pending-bank-withdrawal` típusokat lefordítjuk
  // a klasszikus `expense`/`income` kassza-oldali rekordra. A `belso_mozgas_xkey`
  // mezővel jelezzük a meglévő rendszernek, hogy ez "várakozó" belső mozgás.
  const rpcItems = items.map((item) => {
    const isPendingDeposit = item.kind === 'pending-bank-deposit'
    const isPendingWithdrawal = item.kind === 'pending-bank-withdrawal'
    // A pending-bank-deposit (Kassza→Bank) → `kiadas` táblába kassza-oldal
    // A pending-bank-withdrawal (Bank→Kassza) → `befizetes` táblába kassza-oldal
    const targetKind: 'income' | 'expense' = isPendingDeposit
      ? 'expense'
      : isPendingWithdrawal
        ? 'income'
        : (item.kind as 'income' | 'expense')

    return {
      kind: targetKind,
      datum: item.datum,
      osszeg: item.osszeg,
      id_befizetescel: targetKind === 'income' ? item.celId : undefined,
      id_kiadascel: targetKind === 'expense' ? item.celId : undefined,
      forrasa: item.forrasa || '',
      nyugta: item.nyugta || '',
      iratszam: item.iratszam || '',
      irattipus: item.irattipus || '',
      fizetettev: item.fizetettev,
      megjegyzes: item.megjegyzes || '',
      id_szemely: item.szemelyId ?? null,
      id_csalad: item.csaladId ?? null,
      atvevo: targetKind === 'expense' ? item.forrasa || '' : undefined,
      atvevoid: targetKind === 'expense' ? item.szemelyId ?? null : undefined,
      csalad: false,
      // A belső mozgás várakozó tételeinél a `belso_mozgas_xkey` UUID
      // jelzi a rendszer többi részének, hogy ez egy belső mozgás párja.
      belso_mozgas_xkey: item.belsoMozgasXkey ?? null,
      // Banki tételnél a bankszámla, kassza-oldalon null.
      bankszamla_id: item.bankszamlaId ?? null,
    }
  })

  // RPC hívás
  const { data, error } = await auth.access.supabase.rpc(
    'import_finance_batch',
    {
      p_congregation_id: auth.congregationId,
      p_user_id: auth.userId,
      p_items: rpcItems,
    },
  )

  if (error) {
    return {
      error: `Az importálás megakadt: ${error.message}`,
    }
  }

  type RpcResult = {
    inserted: number
    skipped: number
    skippedDuplicates?: number
    errors: Array<{ rowIndex?: number; reason?: string }>
  }
  const result = (data as RpcResult) || { inserted: 0, skipped: 0, skippedDuplicates: 0, errors: [] }

  // Import-log audit-rekord
  try {
    await logImportRun({
      supabase: auth.access.supabase,
      congregationId: auth.congregationId,
      userId: auth.userId,
      module: 'finance',
      fileName,
      totalInserted: result.inserted,
      totalSkipped: result.skipped,
      perSheetLog: [
        {
          sheet: 'Kassza',
          profile: 'kassza',
          inserted: result.inserted,
          skipped: result.skipped,
        },
      ],
      lookupStats: {
        personResolved: 0,
        personUnresolved: 0,
        categoryResolved: 0,
        categoryUnresolved: 0,
        warnings: [],
      },
      errors: (result.errors || []).map((e) => ({
        sheet: 'Kassza',
        row: e.rowIndex ?? 0,
        message: e.reason ?? 'Ismeretlen hiba',
      })),
    })
  } catch {
    // Naplózás hiba nem blocker — az import sikeres lefutott
  }

  return {
    success: true,
    inserted: result.inserted,
    skipped: result.skipped,
    skippedDuplicates: result.skippedDuplicates ?? 0,
    errors: (result.errors || []).map((e) => ({
      rowIndex: e.rowIndex ?? 0,
      reason: e.reason ?? 'Ismeretlen hiba',
    })),
  }
}

