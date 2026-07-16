'use server'

/**
 * Tagnyilvántartás-import wizard — szemely (+csalad) dual-insert flow.
 *
 * Az `import_family_head_batch` RPC-t hívja, ami atomikusan beszúr egy
 * `szemely`-t és (opcionálisan) egy `csalad`-rekordot soronként. Az utca/helység
 * lookup szerver oldalon történik (`_resolve_or_create_street`), ami garantálja
 * a `szemely.c_utcaid` és `csalad.c_utcaid` NOT NULL constraint-ek teljesülését.
 *
 * Mindkét tagnyilvántartás-profil ezen a flow-n megy:
 *   - PROFILE_PERSONS — csak szemely insert (createCsalad=false)
 *   - PROFILE_FAMILY_HEADS — szemely + csalad együtt (createCsalad=true)
 *
 * Bemenet (FormData):
 *   - file: a feltöltött Excel/CSV/XML fájl
 *   - sheetName: melyik sheet-et dolgozzuk fel
 *   - profileKey: 'persons' vagy 'family_heads' (default: 'family_heads')
 *   - createCsalad: 'true'/'false' string (default: 'true' a family_heads-hez)
 *   - targetCongregationId: opcionális override (admin használja); ha hiányzik,
 *     az aktív gyülekezet
 *
 * Kimenet:
 *   - success, insertedSzemely, insertedCsalad, errors[], warnings[]
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

import { parseWorkbook, parseCsvString, parseXmlSpreadsheet } from './excel-parser'
import type { ParsedWorkbook } from './excel-parser'
import { PROFILE_FAMILY_HEADS, PROFILE_PERSONS, type ImportProfile } from './import-profiles'
import { resolveImportTargetCongregationId } from './import-target'
import { transformSheet, type AutoColumnContext } from './row-transformer'

export type RowIssueSeverity = 'error' | 'warning' | 'info'

export interface RowIssue {
  row: number
  message: string
  severity?: RowIssueSeverity
  name?: string
}

export interface FamilyHeadImportResult {
  success?: boolean
  error?: string
  insertedSzemely?: number
  insertedCsalad?: number
  /**
   * Sor-szintű jegyek. A 'severity' mező:
   *   - 'error': a sor kihagyva, a hiba blokkoló (pl. nincs csaladnev/k_nev)
   *   - 'warning': a sor beszúrva, de a felhasználó ellenőrizze (pl. nem mező hiányzott)
   *   - 'info': a sor beszúrva, csak tájékoztató jegy (pl. nem inference)
   */
  rowErrors?: RowIssue[]
  warnings?: string[]
}

const SUPPORTED_EXTS = ['xlsx', 'xls', 'csv', 'xml']

export async function executeFamilyHeadImport(
  formData: FormData,
): Promise<FamilyHeadImportResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const file = formData.get('file') as File | null
  const sheetName = formData.get('sheetName') as string | null
  const profileKey = (formData.get('profileKey') as string | null) || PROFILE_FAMILY_HEADS.key
  const createCsaladRaw = formData.get('createCsalad') as string | null
  // Cél-gyülekezet: alapból az aktív; explicit `targetCongregationId` (admin import-hub)
  // esetén kötelező a rendszergazda + hatókör-ellenőrzés.
  const targetResult = await resolveImportTargetCongregationId(
    formData.get('targetCongregationId') as string | null,
    access,
  )
  if (targetResult.error) return { error: targetResult.error }
  const targetCongregationId = targetResult.congregationId

  // Új: a wizard "Helység-egyeztetés" lépés eredménye
  const resolvedLocalityMapRaw = formData.get('resolvedLocalityMap') as string | null
  let resolvedLocalityMap: Record<string, number> | null = null
  if (resolvedLocalityMapRaw) {
    try {
      resolvedLocalityMap = JSON.parse(resolvedLocalityMapRaw)
    } catch {
      resolvedLocalityMap = null
    }
  }

  // Új: a wizard "Utca-postakód-egyeztetés" lépés eredménye
  const resolvedStreetPostalcodesRaw = formData.get('resolvedStreetPostalcodes') as string | null
  let resolvedStreetPostalcodes: Record<string, string> | null = null
  if (resolvedStreetPostalcodesRaw) {
    try {
      resolvedStreetPostalcodes = JSON.parse(resolvedStreetPostalcodesRaw)
    } catch {
      resolvedStreetPostalcodes = null
    }
  }

  // Profil választás (PROFILE_PERSONS vagy PROFILE_FAMILY_HEADS)
  let chosenProfile: ImportProfile
  if (profileKey === PROFILE_PERSONS.key) {
    chosenProfile = PROFILE_PERSONS
  } else if (profileKey === PROFILE_FAMILY_HEADS.key) {
    chosenProfile = PROFILE_FAMILY_HEADS
  } else {
    return { error: `Ismeretlen import profil: ${profileKey}. Csak 'persons' vagy 'family_heads' támogatott.` }
  }

  // create_csalad flag — alapértelmezésben a family_heads profilnál true, persons-nál false
  const defaultCreateCsalad = chosenProfile.key === PROFILE_FAMILY_HEADS.key
  const createCsalad =
    createCsaladRaw === null ? defaultCreateCsalad : createCsaladRaw === 'true'

  if (!file) return { error: 'Nincs fájl kiválasztva.' }
  if (!targetCongregationId) {
    return { error: 'Nincs cél gyülekezet kiválasztva (sem aktív, sem felülírt).' }
  }

  if (file.size > 10 * 1024 * 1024) {
    return { error: 'A fájl mérete meghaladja a 10 MB-os limitet.' }
  }

  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (!SUPPORTED_EXTS.includes(ext)) {
    return { error: `Nem támogatott fájlformátum (.${ext}). Elfogadott: .xlsx, .xls, .csv, .xml` }
  }

  // ── Parse ──────────────────────────────────────────────────────────────
  let workbook: ParsedWorkbook
  try {
    if (ext === 'csv') {
      const text = await file.text()
      workbook = parseCsvString(text, file.name)
    } else if (ext === 'xml') {
      const text = await file.text()
      workbook = parseXmlSpreadsheet(text, file.name)
    } else {
      const buffer = await file.arrayBuffer()
      workbook = parseWorkbook(buffer, file.name)
    }
  } catch (e) {
    return {
      error: `A fájl olvasása sikertelen: ${e instanceof Error ? e.message : 'ismeretlen hiba'}`,
    }
  }

  // Sheet kiválasztás
  const sheet = sheetName
    ? workbook.sheets.find((s) => s.name === sheetName)
    : workbook.sheets[0]

  if (!sheet) {
    return { error: `Nem található a megadott fül: ${sheetName || '(első)'}` }
  }
  if (sheet.rowCount === 0) {
    return { error: `A "${sheet.name}" fül üres.` }
  }
  if (sheet.warning) {
    return { error: `A "${sheet.name}" fül problémás: ${sheet.warning}` }
  }

  // ── Transzformálás (a választott profil szerint) ─────────────────────
  const ctx: AutoColumnContext = {
    congregationId: targetCongregationId,
    userId: access.user.id,
    currentYear: new Date().getFullYear(),
  }

  const transformResult = transformSheet(
    sheet.rows,
    sheet.headers,
    chosenProfile,
    ctx,
  )

  if (transformResult.errors.length > 0 && transformResult.records.length === 0) {
    // Minden sor hibás (vagy hiányzó kötelező oszlop a sheet-ben)
    return {
      error:
        transformResult.errors[0]?.message ||
        'A sheet egyetlen sora sem dolgozható fel.',
      rowErrors: transformResult.errors.map((e) => ({
        row: e.rowIndex + 1,
        message: e.message,
      })),
    }
  }

  // ── RPC hívás (import_family_head_batch) ─────────────────────────────
  const supabase = await createClient()

  // A virtuális (`_*`) mezőket az RPC csak az _utca_text / _helyseg_text formában
  // várja, a többi `_*` mezőt kiszűrjük. A sintetikus c_szcim már be van állítva
  // a row-transformer-ben.
  const cleanedRows = transformResult.records.map((r) => {
    const cleaned: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(r.record)) {
      if (val === null || val === undefined) continue
      // Az _utca_text és _helyseg_text mezőket TOVÁBBÍTJUK az RPC-hez
      if (key === '_utca_text' || key === '_helyseg_text') {
        cleaned[key] = val
        continue
      }
      // A többi virtuális mezőt (`_sz_ev`, `_sz_ho`, `_sz_nap`) kiszűrjük —
      // a row-transformer már beépítette a sz_datum-ba
      if (key.startsWith('_')) continue
      cleaned[key] = val
    }
    cleaned['create_csalad'] = createCsalad
    return cleaned
  })

  const { data, error } = await supabase.rpc('import_family_head_batch', {
    target_congregation_id: targetCongregationId,
    rows: cleanedRows,
    p_resolved_locality_map: resolvedLocalityMap,
    p_resolved_street_postalcodes: resolvedStreetPostalcodes,
  })

  if (error) {
    return { error: `A szerver-oldali import sikertelen: ${error.message}` }
  }

  // RPC visszaadás formátuma: TABLE(inserted_szemely, inserted_csalad, errors)
  // A Supabase rpc() egy tömböt ad vissza a TABLE eredményeknél
  const firstRow = Array.isArray(data) ? data[0] : data
  const insertedSzemely = (firstRow?.inserted_szemely as number) ?? 0
  const insertedCsalad = (firstRow?.inserted_csalad as number) ?? 0
  const rpcErrors = ((firstRow?.errors as RowIssue[]) ?? [])

  // Egyesítjük a transform-hibákat (mind 'error' severity) és az RPC-jegyeket
  const combinedErrors: RowIssue[] = [
    ...transformResult.errors.map((e) => ({
      row: e.rowIndex + 1,
      message: e.message,
      severity: 'error' as RowIssueSeverity,
    })),
    ...rpcErrors.map((e) => ({
      row: e.row,
      message: e.message,
      severity: (e.severity ?? 'error') as RowIssueSeverity,
      name: e.name,
    })),
  ]

  // Revalidate
  revalidatePath('/tagnyilvantartas')

  // Audit log (best-effort)
  try {
    const { logImportRun } = await import('./import-log')
    await logImportRun({
      supabase,
      congregationId: targetCongregationId,
      userId: access.user.id,
      module: 'members',
      fileName: file.name,
      totalInserted: insertedSzemely + insertedCsalad,
      totalSkipped: combinedErrors.length,
      perSheetLog: [
        {
          sheet: sheet.name,
          profile: chosenProfile.key,
          inserted: insertedSzemely + insertedCsalad,
          skipped: combinedErrors.filter((e) => e.severity === 'error').length,
        },
      ],
      lookupStats: {
        personResolved: 0,
        personUnresolved: 0,
        categoryResolved: 0,
        categoryUnresolved: 0,
        warnings: [],
      },
      errors: combinedErrors.map((e) => ({
        sheet: sheet.name,
        row: e.row,
        message: `[${e.severity ?? 'error'}] ${e.message}${e.name ? ` (${e.name})` : ''}`,
      })),
    })
  } catch (e) {
    console.warn('[executeFamilyHeadImport] audit log sikertelen:', e)
  }

  return {
    success: true,
    insertedSzemely,
    insertedCsalad,
    rowErrors: combinedErrors,
  }
}
