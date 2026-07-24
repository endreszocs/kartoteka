'use server'

/**
 * "Csak családokká szervezés" import server action.
 *
 * A wizard 1. lépésében új import-mód: "Csak családokká szervezés meglévő tagokból".
 * A személyek MÁR a tagnyilvántartásban vannak — ez csak `csalad` + `gyerek` rekordokat
 * hoz létre.
 *
 * RPC hívás: `import_families_from_existing_persons_batch`
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

import { parseWorkbook, parseCsvString, parseXmlSpreadsheet } from './excel-parser'
import type { ParsedWorkbook } from './excel-parser'
import { PROFILE_FAMILIES_FROM_EXISTING_PERSONS } from './import-profiles'
import { resolveImportTargetCongregationId } from './import-target'
import { transformSheet, type AutoColumnContext } from './row-transformer'
import type { RowIssue, RowIssueSeverity } from './family-head-import-actions'

export interface FamiliesFromPersonsImportResult {
  success?: boolean
  error?: string
  insertedCsalad?: number
  insertedGyerek?: number
  notFound?: number
  rowErrors?: RowIssue[]
}

const SUPPORTED_EXTS = ['xlsx', 'xls', 'csv', 'xml']

export async function executeFamiliesFromExistingPersonsImport(
  formData: FormData,
): Promise<FamiliesFromPersonsImportResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const file = formData.get('file') as File | null
  const sheetName = formData.get('sheetName') as string | null
  // Cél-gyülekezet: alapból az aktív; explicit `targetCongregationId` (admin import-hub)
  // esetén kötelező a rendszergazda + hatókör-ellenőrzés.
  const targetResult = await resolveImportTargetCongregationId(
    formData.get('targetCongregationId') as string | null,
    access,
  )
  if (targetResult.error) return { error: targetResult.error }
  const targetCongregationId = targetResult.congregationId

  if (!file) return { error: 'Nincs fájl kiválasztva.' }
  if (!targetCongregationId) {
    return { error: 'Nincs cél gyülekezet kiválasztva.' }
  }

  if (file.size > 10 * 1024 * 1024) {
    return { error: 'A fájl mérete meghaladja a 10 MB-os limitet.' }
  }

  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (!SUPPORTED_EXTS.includes(ext)) {
    return { error: `Nem támogatott fájlformátum (.${ext}).` }
  }

  // Parse
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

  // 2026-07-24 (PR-6 F7.3): a wizard KÉZI oszlop-párosítása — eddig sosem
  // jutott el a szerverig, az import az auto-matchre esett vissza.
  const columnMappingRaw = formData.get('columnMapping') as string | null
  let columnMapping: Record<string, string | null> | undefined
  if (columnMappingRaw) {
    try {
      columnMapping = JSON.parse(columnMappingRaw)
    } catch {
      columnMapping = undefined
    }
  }

  // Transzformálás
  const ctx: AutoColumnContext = {
    congregationId: targetCongregationId,
    userId: access.user.id,
    currentYear: new Date().getFullYear(),
  }

  const transformResult = transformSheet(
    sheet.rows,
    sheet.headers,
    PROFILE_FAMILIES_FROM_EXISTING_PERSONS,
    ctx,
    columnMapping,
  )

  if (transformResult.errors.length > 0 && transformResult.records.length === 0) {
    return {
      error:
        transformResult.errors[0]?.message ||
        'A sheet egyetlen sora sem dolgozható fel.',
      rowErrors: transformResult.errors.map((e) => ({
        row: e.rowIndex + 1,
        message: e.message,
        severity: 'error' as RowIssueSeverity,
      })),
    }
  }

  // Wizard map-ek (helység, postakód)
  const resolvedLocalityMapRaw = formData.get('resolvedLocalityMap') as string | null
  let resolvedLocalityMap: Record<string, number> | null = null
  if (resolvedLocalityMapRaw) {
    try {
      resolvedLocalityMap = JSON.parse(resolvedLocalityMapRaw)
    } catch {
      resolvedLocalityMap = null
    }
  }

  const resolvedStreetPostalcodesRaw = formData.get('resolvedStreetPostalcodes') as string | null
  let resolvedStreetPostalcodes: Record<string, string> | null = null
  if (resolvedStreetPostalcodesRaw) {
    try {
      resolvedStreetPostalcodes = JSON.parse(resolvedStreetPostalcodesRaw)
    } catch {
      resolvedStreetPostalcodes = null
    }
  }

  // Cleaned rows az RPC-hez
  const cleanedRows = transformResult.records.map((r) => {
    const cleaned: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(r.record)) {
      if (val === null || val === undefined) continue
      if (key === '_utca_text' || key === '_helyseg_text') {
        cleaned[key] = val
        continue
      }
      if (key.startsWith('_')) continue
      cleaned[key] = val
    }
    return cleaned
  })

  // RPC hívás
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('import_families_from_existing_persons_batch', {
    target_congregation_id: targetCongregationId,
    rows: cleanedRows,
    p_resolved_locality_map: resolvedLocalityMap,
    p_resolved_street_postalcodes: resolvedStreetPostalcodes,
  })

  if (error) {
    return { error: `A szerver-oldali import sikertelen: ${error.message}` }
  }

  const firstRow = Array.isArray(data) ? data[0] : data
  const insertedCsalad = (firstRow?.inserted_csalad as number) ?? 0
  const insertedGyerek = (firstRow?.inserted_gyerek as number) ?? 0
  const notFound = (firstRow?.not_found as number) ?? 0
  const rpcErrors = ((firstRow?.errors as RowIssue[]) ?? [])

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

  // 2026-07-18 (PR-3 F6.1, P0): a legacy csalad-rekordokat átvezetjük az ÚJ
  // haztartas-modellbe — a Családok fül CSAK abból olvas, enélkül az importált
  // családok láthatatlanok. Hibája nem nyelődik el némán: warning kerül a listába.
  if (insertedCsalad > 0 || insertedGyerek > 0) {
    const { error: syncError } = await supabase.rpc('sync_households_from_csalad', {
      p_congregation_id: targetCongregationId,
    })
    if (syncError) {
      combinedErrors.push({
        row: 0,
        message: `A családok létrejöttek, de a háztartás-átvezetés nem futott le (${syncError.message}) — a Családok fülön még nem látszanak. Futtasd újra az importot, vagy jelezd a rendszergazdának (sync_households_from_csalad).`,
        severity: 'warning' as RowIssueSeverity,
      })
    }
  }

  revalidatePath('/tagnyilvantartas')

  // Audit log (best-effort) — 2026-07-18 (PR-3): eddig CSAK a family-heads út
  // naplózott; a "családokká szervezés" futásai utólag nem voltak rekonstruálhatók.
  try {
    const { logImportRun } = await import('./import-log')
    await logImportRun({
      supabase,
      congregationId: targetCongregationId,
      userId: access.user.id,
      module: 'members',
      fileName: file.name,
      totalInserted: insertedCsalad + insertedGyerek,
      totalSkipped: combinedErrors.length,
      perSheetLog: [
        {
          sheet: sheet.name,
          profile: 'families_from_existing_persons',
          inserted: insertedCsalad + insertedGyerek,
          skipped: combinedErrors.filter((e) => e.severity === 'error').length,
        },
      ],
      lookupStats: {
        personResolved: 0,
        personUnresolved: notFound,
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
    console.warn('[executeFamiliesFromExistingPersonsImport] audit log sikertelen:', e)
  }

  return {
    success: true,
    insertedCsalad,
    insertedGyerek,
    notFound,
    rowErrors: combinedErrors,
  }
}
