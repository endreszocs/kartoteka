'use server'

/**
 * Általános bevétel-import — KÉZI oszlop-párosítással (2026-06-09, #D igény).
 *
 * A „hivatalos Kassza-import" fix sablonnal dolgozik; ez az általánosabb felület a
 * felhasználó SAJÁT Excel/CSV/XML fájljához, ahol az oszlopok elnevezése/sorrendje
 * tetszőleges. A felhasználó kézzel rendeli a fájl fejléceit a cél-mezőkhöz, majd
 * ugyanaz a donor-parszer + tag-lookup + könyvelés-egyeztetés + dedup-os beszúrás fut,
 * mint az egyházfenntartás-importnál.
 *
 * Két action:
 *   1. parseGeneralPreview — fájl parse → sheet-ek + fejlécek + minta-sorok (mapping UI-hoz)
 *   2. executeGeneralImport — a kézzel mappelt sorok beszúrása (dedup) + tag-lookup + reconcile
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  parseWorkbook,
  parseCsvString,
  parseXmlSpreadsheet,
} from '@/lib/import/excel-parser'
import { toLocalIsoDate } from '@/lib/import/date-utils'
import { parseDonorString } from '@/components/finance/finance-import/helpers/donor-string-parser'
import {
  buildAllPersonsLookupMap,
  lookupPersonByQuadAttempt,
  type PersonLookupMaps,
} from '@/lib/import/lookup-resolver'
import {
  buildBudgetCodeMaps,
  resolveBudgetCode,
  normalizeBudgetCode,
} from '@/components/finance/finance-import/helpers/budget-code-resolver'
import {
  reconcileWithBooks,
  type ReconcileResult,
  type ReconcileFileRow,
  type ReconcileBookRow,
} from '@/components/finance/finance-import/egyhfenntartas/helpers/books-reconciler'

const MAX_UPLOAD = 25 * 1024 * 1024
const MAX_ROWS = 5000

async function requireAccess() {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' as const }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' as const }
  const allowed = access.master || access.admin || access.egyhazkeruletiAdmin || access.konyvelo
  if (!allowed) return { error: 'Csak rendszergazdának vagy könyvelőnek érhető el.' as const }
  return { access, congregationId: access.effectiveCongregationId, userId: access.user.id }
}

// ── Típusok ─────────────────────────────────────────────────────────────

export interface GeneralSheetPreview {
  name: string
  headers: string[]
  rowCount: number
  /** Az összes sor (MAX_ROWS-ig) — a kliens ebből építi a mappelt tételeket. */
  rows: Array<Record<string, string | number | null>>
}

export interface GeneralParseResult {
  success?: boolean
  error?: string
  sheets?: GeneralSheetPreview[]
}

// ── 1) parse + preview ──────────────────────────────────────────────────

export async function parseGeneralPreview(formData: FormData): Promise<GeneralParseResult> {
  const auth = await requireAccess()
  if ('error' in auth) return { error: auth.error }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Nincs fájl kiválasztva.' }
  if (file.size > MAX_UPLOAD) return { error: 'A fájl túl nagy (max 25 MB).' }

  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (!['xlsx', 'xls', 'csv', 'xml'].includes(ext)) {
    return { error: 'Nem támogatott formátum. Elfogadott: .xlsx, .xls, .csv, .xml' }
  }

  try {
    let workbook
    if (ext === 'csv') {
      workbook = parseCsvString(await file.text(), file.name)
    } else if (ext === 'xml') {
      workbook = parseXmlSpreadsheet(await file.text(), file.name)
    } else {
      workbook = parseWorkbook(await file.arrayBuffer(), file.name)
    }

    const sheets: GeneralSheetPreview[] = workbook.sheets.map((s) => ({
      name: s.name,
      headers: s.headers,
      rowCount: s.rowCount,
      rows: s.rows.slice(0, MAX_ROWS),
    }))
    return { success: true, sheets }
  } catch (e) {
    return { error: `A fájl olvasása sikertelen: ${e instanceof Error ? e.message : 'ismeretlen hiba'}.` }
  }
}

// ── 2) execute ──────────────────────────────────────────────────────────

/** Egy kézzel mappelt sor a kliensből. */
const mappedRowSchema = z.object({
  nev: z.string().max(500),
  osszeg: z.number().finite(),
  datum: z.string().max(40),
  /** Kategória — költségvetési kód (pl. "101,01") VAGY kategórianév (pl. "Egyházfenntartói járulék"). */
  kategoria: z.string().max(200).optional().default(''),
  iratszam: z.string().max(50).optional().default(''),
  nyugta: z.string().max(50).optional().default(''),
  fizetettev: z.number().int().optional().nullable(),
  megjegyzes: z.string().max(2000).optional().nullable(),
})

const executeSchema = z.object({
  rows: z.array(mappedRowSchema).max(MAX_ROWS),
  year: z.number().int().min(2000).max(2100),
  /** Kézi tag-felülbírálás: clientKey ("gen-<index>") → szemely.id. */
  manualSelections: z.record(z.string(), z.number().int().positive()).optional(),
  /** Felhasználó által kihagyott sorok clientKey-ei. */
  skipped: z.array(z.string()).max(MAX_ROWS).optional(),
})

export type GeneralMappedRow = z.infer<typeof mappedRowSchema>

const EGYHF_KOD = '101.01'

// ── Megosztott párosító-kontextus (preview + execute közös) ───────────────

type PersonMatchMode = 'exact' | 'multiple' | 'fuzzy-name' | 'not-found' | 'company'

export interface GeneralPersonInfo {
  szemelyId: number | null
  candidates: Array<{
    szemelyId: number
    csaladnev: string | null
    k_nev: string | null
    cim: string | null
  }>
  matchMode: PersonMatchMode
}

/** Egy befizető-névből tag-egyezés a megosztott lookup-infrastruktúrával. */
function resolvePersonForRow(nev: string, maps: PersonLookupMaps): GeneralPersonInfo {
  const donor = parseDonorString(nev)
  if (donor.isCompany) return { szemelyId: null, candidates: [], matchMode: 'company' }
  const familyName = donor.csaladnev ?? donor.husbandFamilyName
  const ferfiFlag: 'M' | 'F' | '?' = donor.husbandName ? 'F' : '?'
  const lookup = lookupPersonByQuadAttempt(
    familyName, donor.k_nev, donor.szcs_nev, null, ferfiFlag, maps, donor.street, donor.houseNumber,
  )
  if (!lookup) return { szemelyId: null, candidates: [], matchMode: 'not-found' }
  if ('id' in lookup) return { szemelyId: Number(lookup.id), candidates: [], matchMode: 'exact' }
  const candidates = lookup.candidates.map((idStr) => {
    const rec = maps.byId.get(idStr)
    const addr = maps.addressById.get(idStr)
    const cim = addr
      ? [addr.streetName, addr.houseNumber].filter(Boolean).join(' ').trim() || null
      : null
    return {
      szemelyId: Number(idStr),
      csaladnev: rec?.csaladnev ?? null,
      k_nev: rec?.k_nev ?? null,
      cim,
    }
  })
  return { szemelyId: null, candidates, matchMode: lookup.approximate ? 'fuzzy-name' : 'multiple' }
}

type CategoryResolver = (catRaw: string) => { celId: number; kod: string | null } | null

/** Kategória-feloldó (költségvetési KÓD vagy NÉV → befizetescel.id). */
async function buildCategoryResolver(
  supabase: SupabaseClient,
  congregationId: string,
): Promise<CategoryResolver> {
  const codeMaps = await buildBudgetCodeMaps(supabase, congregationId)
  const { data: bcRows } = await supabase
    .from('befizetescel')
    .select('id, nev, id_szamadasicel')
    .eq('aktiv', true)
  const nameToCelId = new Map<string, number>()
  for (const r of bcRows ?? []) {
    if (r.nev) nameToCelId.set(normalizeText(r.nev as string), r.id as number)
  }
  return (catRaw: string) => {
    const s = (catRaw ?? '').trim()
    if (!s) return null
    if (normalizeBudgetCode(s)) {
      const res = resolveBudgetCode(s, codeMaps)
      if (res.kind === 'income') return { celId: res.befizetescelId, kod: res.szamadasicel }
      if (res.kind === 'internal-transfer' && res.befizetescelId)
        return { celId: res.befizetescelId, kod: res.szamadasicel }
    }
    const byName = nameToCelId.get(normalizeText(s))
    if (byName) return { celId: byName, kod: null }
    return null
  }
}

// ── 1b) preview — párosítás-előnézet (beszúrás NÉLKÜL, P1-1/P1-2) ──────────

export interface GeneralPreviewRow {
  clientKey: string
  nev: string
  osszeg: number
  datum: string
  datumIso: string | null
  fizetettev: number
  iratszam: string
  nyugta: string
  megjegyzes: string | null
  /** Kategória feloldva? */
  categoryOk: boolean
  kod: string | null
  isEgyhf: boolean
  /** Érvényes sor (név + pozitív összeg + dátum + kategória)? */
  valid: boolean
  invalidReason: string | null
  person: GeneralPersonInfo
}

export interface GeneralPreviewResult {
  success?: boolean
  error?: string
  rows: GeneralPreviewRow[]
  stats: {
    total: number
    valid: number
    invalid: number
    noCategory: number
    egyhf: number
    other: number
    personExact: number
    personMultiple: number
    personNotFound: number
    personCompany: number
  }
  reconcile: ReconcileResult | null
}

export async function previewGeneralImport(payload: {
  rows: GeneralMappedRow[]
  year: number
}): Promise<GeneralPreviewResult> {
  const empty: GeneralPreviewResult = {
    rows: [],
    stats: {
      total: 0, valid: 0, invalid: 0, noCategory: 0, egyhf: 0, other: 0,
      personExact: 0, personMultiple: 0, personNotFound: 0, personCompany: 0,
    },
    reconcile: null,
  }
  const auth = await requireAccess()
  if ('error' in auth) return { ...empty, error: auth.error }

  const parsed = executeSchema.safeParse({ rows: payload.rows, year: payload.year })
  if (!parsed.success) {
    return { ...empty, error: `Érvénytelen payload: ${parsed.error.issues[0]?.message ?? 'séma-hiba'}` }
  }
  const { rows, year } = parsed.data
  const supabase = auth.access.supabase

  const personMaps = await buildAllPersonsLookupMap(supabase, auth.congregationId)
  const resolveCategory = await buildCategoryResolver(supabase, auth.congregationId)

  const stats = { ...empty.stats, total: rows.length }
  const previewRows: GeneralPreviewRow[] = rows.map((r, i) => {
    const datumIso = toLocalIsoDate(r.datum)
    const cat = resolveCategory(r.kategoria ?? '')
    const nevTrim = (r.nev ?? '').trim()
    const baseValid = !!nevTrim && r.osszeg > 0 && !!datumIso
    let valid = true
    let invalidReason: string | null = null
    if (!baseValid) {
      valid = false
      invalidReason = 'Hiányzó név / összeg / dátum'
    } else if (!cat) {
      valid = false
      invalidReason = 'Ismeretlen kategória'
    }

    const person: GeneralPersonInfo = valid
      ? resolvePersonForRow(nevTrim, personMaps)
      : { szemelyId: null, candidates: [], matchMode: 'not-found' }

    if (!valid) {
      if (baseValid && !cat) stats.noCategory++
      else stats.invalid++
    } else {
      stats.valid++
      if (cat?.kod === EGYHF_KOD) stats.egyhf++
      else stats.other++
      switch (person.matchMode) {
        case 'exact': stats.personExact++; break
        case 'multiple':
        case 'fuzzy-name': stats.personMultiple++; break
        case 'company': stats.personCompany++; break
        default: stats.personNotFound++; break
      }
    }

    return {
      clientKey: `gen-${i}`,
      nev: nevTrim,
      osszeg: r.osszeg,
      datum: r.datum,
      datumIso,
      fizetettev: r.fizetettev ?? year,
      iratszam: r.iratszam ?? '',
      nyugta: r.nyugta ?? '',
      megjegyzes: r.megjegyzes ?? null,
      categoryOk: !!cat,
      kod: cat?.kod ?? null,
      isEgyhf: cat?.kod === EGYHF_KOD,
      valid,
      invalidReason,
      person,
    }
  })

  // Egyeztetés a könyveléssel (csak az érvényes sorok)
  const { data: booked } = await supabase
    .from('befizetes')
    .select('id, forrasa, osszeg, datum, iratszam, nyugta')
    .eq('congregation_id', auth.congregationId)
    .eq('fizetettev', year)
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
  const fileRows: ReconcileFileRow[] = previewRows
    .filter((r) => r.valid && r.datumIso)
    .map((r) => ({
      clientKey: r.clientKey, forrasa: r.nev, osszeg: r.osszeg,
      datum: r.datumIso!, iratszam: r.iratszam, nyugta: r.nyugta,
    }))
  const reconcile = reconcileWithBooks(fileRows, bookRows)

  return { success: true, rows: previewRows, stats, reconcile }
}

export interface GeneralImportResult {
  success?: boolean
  error?: string
  inserted: number
  skippedDuplicates: number
  skippedInvalid: number
  /** A kategóriát (kód/név) nem lehetett feloldani — kihagyva. */
  skippedNoCategory: number
  /** A felhasználó által a párosító lépésben kihagyott sorok. */
  skippedByUser: number
  personResolved: number
  personNotFound: number
  /** Hány tétel egyházfenntartás (101.01) vs. egyéb — auto-felismerés. */
  egyhfenntartasCount: number
  otherIncomeCount: number
  errors: string[]
  reconcile: ReconcileResult | null
}

export async function executeGeneralImport(payload: {
  rows: GeneralMappedRow[]
  year: number
  manualSelections?: Record<string, number>
  skipped?: string[]
}): Promise<GeneralImportResult> {
  const base: GeneralImportResult = {
    inserted: 0,
    skippedDuplicates: 0,
    skippedInvalid: 0,
    skippedNoCategory: 0,
    skippedByUser: 0,
    personResolved: 0,
    personNotFound: 0,
    egyhfenntartasCount: 0,
    otherIncomeCount: 0,
    errors: [],
    reconcile: null,
  }

  const auth = await requireAccess()
  if ('error' in auth) return { ...base, error: auth.error }

  const parsed = executeSchema.safeParse(payload)
  if (!parsed.success) {
    return { ...base, error: `Érvénytelen payload: ${parsed.error.issues[0]?.message ?? 'séma-hiba'}` }
  }
  const { rows, year } = parsed.data
  const manualSelections = parsed.data.manualSelections ?? {}
  const skippedSet = new Set(parsed.data.skipped ?? [])
  const supabase = auth.access.supabase

  // 2026-07-10 (S3 audit KRITIKUS #3): véglegesített évbe import útján SEM
  // születhet új tétel — az érintett évek (a sorok dátum-évei) zár-ellenőrzése.
  const importYears = new Set<number>()
  for (const r of rows) {
    const y = Number(String(r.datum || '').slice(0, 4))
    if (Number.isFinite(y) && y >= 2000) importYears.add(y)
  }
  if (importYears.size === 0) importYears.add(year)
  for (const y of importYears) {
    const { data: beal } = await supabase
      .from('bealitas')
      .select('accounting_finalized')
      .eq('congregation_id', auth.congregationId)
      .eq('id', String(y))
      .maybeSingle()
    if (beal?.accounting_finalized) {
      return {
        ...base,
        error: `A ${y}. évi számadás már véglegesítve van — új tétel nem rögzíthető (importtal sem). Először kérj javítási engedélyt az egyházmegyétől.`,
      }
    }
  }

  const personMaps = await buildAllPersonsLookupMap(supabase, auth.congregationId)
  const resolveCategory = await buildCategoryResolver(supabase, auth.congregationId)

  // RLS-scope: a kézzel választott szemely.id-k a HÍVÓ gyülekezetéhez tartoznak-e?
  const manualIds = new Set<number>(Object.values(manualSelections))
  const validManualIds = new Set<number>()
  if (manualIds.size > 0) {
    const { data: szRows } = await supabase
      .from('szemely')
      .select('id')
      .in('id', Array.from(manualIds))
      .eq('congregation_id', auth.congregationId)
    for (const r of szRows ?? []) {
      if (typeof r.id === 'number') validManualIds.add(r.id)
    }
  }

  // Normalizált sorok + kategória-feloldás (clientKey index alapján — a preview-vel egyezik)
  const normRows = rows.map((r, i) => ({
    ...r,
    clientKey: `gen-${i}`,
    datumIso: toLocalIsoDate(r.datum),
    cat: resolveCategory(r.kategoria ?? ''),
  }))

  // Egyeztetés az évre könyvelt bevételekkel (csak a nem-skippelt érvényes sorok).
  const { data: booked } = await supabase
    .from('befizetes')
    .select('id, forrasa, osszeg, datum, iratszam, nyugta')
    .eq('congregation_id', auth.congregationId)
    .eq('fizetettev', year)
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
  const fileRows: ReconcileFileRow[] = normRows
    .filter((r) => r.datumIso && r.osszeg > 0 && !skippedSet.has(r.clientKey))
    .map((r) => ({
      clientKey: r.clientKey,
      forrasa: r.nev,
      osszeg: r.osszeg,
      datum: r.datumIso!,
      iratszam: r.iratszam ?? '',
      nyugta: r.nyugta ?? '',
    }))
  base.reconcile = reconcileWithBooks(fileRows, bookRows)

  // Beszúrás dedup-pal
  for (const r of normRows) {
    if (skippedSet.has(r.clientKey)) {
      base.skippedByUser++
      continue
    }
    if (!r.datumIso || !(r.osszeg > 0) || !r.nev.trim()) {
      base.skippedInvalid++
      continue
    }
    if (!r.cat) {
      base.skippedNoCategory++
      continue
    }
    const befizetescelId = r.cat.celId
    if (r.cat.kod === EGYHF_KOD) base.egyhfenntartasCount++
    else base.otherIncomeCount++

    // Tag-feloldás: a KÉZI felülbírálás elsőbbség (RLS-scope ellenőrzött), különben
    // az auto-lookup CSAK a BIZTOS (exact) találatot fogadja el — a több-jelöltes
    // (multiple) és nem-talált sorok a párosító lépésben kézzel rendezhetők.
    let szemelyId: number | null = null
    const manual = manualSelections[r.clientKey]
    if (manual !== undefined && validManualIds.has(manual)) {
      szemelyId = manual
      base.personResolved++
    } else {
      if (manual !== undefined) {
        base.errors.push(`${r.nev}: a kézzel választott tag nem a saját gyülekezethez tartozik — összerendelés kihagyva.`)
      }
      const info = resolvePersonForRow(r.nev, personMaps)
      if (info.matchMode === 'exact' && info.szemelyId !== null) {
        szemelyId = info.szemelyId
        base.personResolved++
      } else if (info.matchMode !== 'company') {
        base.personNotFound++
      }
    }

    const fizetettev = r.fizetettev ?? year
    const iratszam = r.iratszam ?? ''

    // Dedup (kategória + forrás + SZEMÉLY-aware — konzisztens az egyhf P1-5 javítással)
    let dupQuery = supabase
      .from('befizetes')
      .select('id')
      .eq('congregation_id', auth.congregationId)
      .eq('fizetettev', fizetettev)
      .eq('osszeg', r.osszeg)
      .eq('id_befizetescel', befizetescelId)
      .eq('iratszam', iratszam)
      .eq('forrasa', r.nev)
      .eq('deleted', false)
    dupQuery = szemelyId === null ? dupQuery.is('id_szemely', null) : dupQuery.eq('id_szemely', szemelyId)
    const { data: existing } = await dupQuery.limit(1).maybeSingle()
    if (existing) {
      base.skippedDuplicates++
      continue
    }

    const xkey = `general-${auth.congregationId}-${fizetettev}-${iratszam || 'na'}-${base.inserted}`
    const { error: insErr } = await supabase.from('befizetes').insert({
      xkey,
      forrasa: r.nev,
      id_befizetescel: befizetescelId,
      id_szemely: szemelyId,
      datum: r.datumIso,
      osszeg: r.osszeg,
      nyugta: r.nyugta ?? '',
      iratszam,
      irattipus: 'általános import',
      csalad: false,
      deleted: false,
      fizetettev,
      userid: auth.userId,
      congregation_id: auth.congregationId,
      megjegyzes: r.megjegyzes ?? null,
      synced: true,
      stornozott: false,
    })
    if (insErr) {
      base.errors.push(`${r.nev}: ${insErr.message}`)
      continue
    }
    base.inserted++
  }

  if (base.inserted > 0) revalidatePath('/penzugy', 'layout')
  base.success = true
  return base
}

/** Egyszerű szöveg-normalizálás kategórianév-egyezéshez (kisbetű, ékezet le, trim). */
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
