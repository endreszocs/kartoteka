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
})

export type GeneralMappedRow = z.infer<typeof mappedRowSchema>

export interface GeneralImportResult {
  success?: boolean
  error?: string
  inserted: number
  skippedDuplicates: number
  skippedInvalid: number
  /** A kategóriát (kód/név) nem lehetett feloldani — kihagyva. */
  skippedNoCategory: number
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
}): Promise<GeneralImportResult> {
  const base: GeneralImportResult = {
    inserted: 0,
    skippedDuplicates: 0,
    skippedInvalid: 0,
    skippedNoCategory: 0,
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
  const supabase = auth.access.supabase

  // Tag-lookup + kategória-térképek egyszer
  const personMaps = await buildAllPersonsLookupMap(supabase, auth.congregationId)
  const codeMaps = await buildBudgetCodeMaps(supabase, auth.congregationId)

  // Kategória NÉV → befizetescel.id térkép (ha a fájl nevet, nem kódot ad meg)
  const { data: bcRows } = await supabase
    .from('befizetescel')
    .select('id, nev, id_szamadasicel')
    .eq('aktiv', true)
  const nameToCelId = new Map<string, number>()
  for (const r of bcRows ?? []) {
    if (r.nev) nameToCelId.set(normalizeText(r.nev as string), r.id as number)
  }
  const EGYHF_KOD = '101.01'

  /** Egy sor kategória-szövegéből (kód VAGY név) → { befizetescelId, kod } vagy null. */
  function resolveCategory(catRaw: string): { celId: number; kod: string | null } | null {
    const s = catRaw.trim()
    if (!s) return null
    // 1) Kód-próba (pl. "101,01" / "101.01")
    if (normalizeBudgetCode(s)) {
      const res = resolveBudgetCode(s, codeMaps)
      if (res.kind === 'income') return { celId: res.befizetescelId, kod: res.szamadasicel }
      if (res.kind === 'internal-transfer' && res.befizetescelId)
        return { celId: res.befizetescelId, kod: res.szamadasicel }
    }
    // 2) Név-próba (pl. "Egyházfenntartói járulék")
    const byName = nameToCelId.get(normalizeText(s))
    if (byName) {
      // a kódot a code-maps reverse-éből nem kérjük; a név-egyezés elég
      return { celId: byName, kod: null }
    }
    return null
  }

  // Normalizált sorok + kategória-feloldás
  const normRows = rows.map((r) => {
    const cat = resolveCategory(r.kategoria ?? '')
    return { ...r, datumIso: toLocalIsoDate(r.datum), cat }
  })

  // Reconcile az ÖSSZES könyvelt bevétellel az évre (kategória-független),
  // hogy a duplikátum bármely kategóriában kiderüljön → az éves számadás helyes marad.
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
    .filter((r) => r.datumIso && r.osszeg > 0)
    .map((r, i) => ({
      clientKey: `gen-${i}`,
      forrasa: r.nev,
      osszeg: r.osszeg,
      datum: r.datumIso!,
      iratszam: r.iratszam ?? '',
      nyugta: r.nyugta ?? '',
    }))
  base.reconcile = reconcileWithBooks(fileRows, bookRows)

  // Beszúrás dedup-pal
  for (const r of normRows) {
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

    // Tag-feloldás
    let szemelyId: number | null = null
    const donor = parseDonorString(r.nev)
    if (!donor.isCompany) {
      const familyName = donor.csaladnev ?? donor.husbandFamilyName
      const ferfiFlag: 'M' | 'F' | '?' = donor.husbandName ? 'F' : '?'
      const lookup = lookupPersonByQuadAttempt(
        familyName,
        donor.k_nev,
        donor.szcs_nev,
        null,
        ferfiFlag,
        personMaps,
        donor.street,
        donor.houseNumber,
      )
      if (lookup && 'id' in lookup) szemelyId = Number(lookup.id)
    }
    if (szemelyId !== null) base.personResolved++
    else if (!donor.isCompany) base.personNotFound++

    const fizetettev = r.fizetettev ?? year
    const iratszam = r.iratszam ?? ''

    // Dedup (a sor saját kategóriájára)
    const { data: existing } = await supabase
      .from('befizetes')
      .select('id')
      .eq('congregation_id', auth.congregationId)
      .eq('fizetettev', fizetettev)
      .eq('osszeg', r.osszeg)
      .eq('id_befizetescel', befizetescelId)
      .eq('iratszam', iratszam)
      .eq('forrasa', r.nev)
      .eq('deleted', false)
      .maybeSingle()
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
