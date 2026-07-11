'use server'

/**
 * Közös multi-sheet batch import server action.
 *
 * Két fő akció:
 *   1. parseAndPreview — fájl feltöltés → parse → sheet előnézetek
 *   2. executeBatchImport — kiválasztott sheet+profil párokkal batch insert
 *
 * Minden modul (tagnyilvántartás, pénzügy, anyakönyv, munkanapló, iktató)
 * ugyanezt a két akciót használja — a különbség csak a profil.
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { parseWorkbook, parseCsvString, parseXmlSpreadsheet } from './excel-parser'
import type { ParsedWorkbook } from './excel-parser'
import {
  type ImportProfile,
  type ImportModule,
  getProfileByKey,
  getProfilesByModule,
  suggestProfileForSheet,
} from './import-profiles'
import {
  transformSheet,
  type BatchTransformResult,
  type AutoColumnContext,
} from './row-transformer'
import { createClient } from '@/lib/supabase/server'
import { resolveLookups, type ResolveStats } from './lookup-resolver'
import type {
  ParsedSheetPreview,
  ParseResult,
  ImportSheetConfig,
  BatchImportResult,
} from './batch-import-types'

// ---------------------------------------------------------------------------
// 1. Fájl parse + preview
// ---------------------------------------------------------------------------

/**
 * Fájl feltöltés → parse → sheet előnézetek visszaadása.
 * A kliens FormData-t küld (file + module).
 */
export async function parseAndPreview(
  formData: FormData,
): Promise<ParseResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const file = formData.get('file') as File | null
  const moduleStr = formData.get('module') as string | null

  if (!file) return { error: 'Nincs fájl kiválasztva.' }
  if (!moduleStr) return { error: 'Modul nem megadva.' }

  const importModule = moduleStr as ImportModule

  // Méret ellenőrzés (max 10 MB)
  if (file.size > 10 * 1024 * 1024) {
    return { error: 'A fájl mérete meghaladja a 10 MB-os limitet.' }
  }

  // Formátum ellenőrzés
  const ext = file.name.toLowerCase().split('.').pop()
  if (!['xlsx', 'xls', 'csv', 'xml'].includes(ext || '')) {
    return { error: 'Nem támogatott fájlformátum. Elfogadott: .xlsx, .xls, .csv, .xml' }
  }

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
  } catch {
    return { error: 'A fájl olvasása sikertelen. Ellenőrizd a formátumot.' }
  }

  // Profil javaslatok
  const moduleProfiles = getProfilesByModule(importModule)

  const sheets: ParsedSheetPreview[] = workbook.sheets.map((sheet) => {
    if (sheet.warning || sheet.headers.length === 0) {
      return {
        sheetName: sheet.name,
        headers: sheet.headers,
        rowCount: sheet.rowCount,
        suggestedProfileKey: null,
        sampleRows: [],
        warning: sheet.warning || 'Üres sheet',
      }
    }

    const suggested = suggestProfileForSheet(sheet.name, moduleProfiles)

    return {
      sheetName: sheet.name,
      headers: sheet.headers,
      rowCount: sheet.rowCount,
      suggestedProfileKey: suggested?.key ?? null,
      sampleRows: sheet.rows.slice(0, 5),
    }
  })

  return {
    success: true,
    fileName: workbook.fileName,
    isCsv: workbook.isCsv,
    sheets,
  }
}

// ---------------------------------------------------------------------------
// 2. Batch import végrehajtás
// ---------------------------------------------------------------------------

/**
 * A kiválasztott sheet+profil párokkal batch insert.
 * A kliens elküldi a fájlt újra + a sheet↔profil konfigurációt.
 */
export async function executeBatchImport(
  formData: FormData,
): Promise<BatchImportResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const file = formData.get('file') as File | null
  const configJson = formData.get('config') as string | null
  const moduleStr = formData.get('module') as string | null

  if (!file || !configJson || !moduleStr) {
    return { error: 'Hiányzó paraméterek (fájl, konfiguráció, modul).' }
  }

  let sheetConfigs: ImportSheetConfig[]
  try {
    sheetConfigs = JSON.parse(configJson) as ImportSheetConfig[]
  } catch {
    return { error: 'Érvénytelen konfiguráció.' }
  }

  if (sheetConfigs.length === 0) {
    return { error: 'Legalább egy sheet-et ki kell választani.' }
  }

  // Parse
  const ext = file.name.toLowerCase().split('.').pop()
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
  } catch {
    return { error: 'A fájl olvasása sikertelen.' }
  }

  const supabase = await createClient()
  const ctx: AutoColumnContext = {
    congregationId: access.effectiveCongregationId,
    userId: access.user.id,
    currentYear: new Date().getFullYear(),
  }

  let totalInserted = 0
  let totalSkipped = 0
  const allErrors: Array<{ sheet: string; row: number; message: string }> = []
  const allLookupStats: ResolveStats = {
    personResolved: 0,
    personUnresolved: 0,
    categoryResolved: 0,
    categoryUnresolved: 0,
    warnings: [],
  }
  const perSheetLog: Array<{ sheet: string; profile: string; inserted: number; skipped: number }> = []

  // Sheet-enként feldolgozás
  for (const config of sheetConfigs) {
    const sheet = workbook.sheets.find((s) => s.name === config.sheetName)
    if (!sheet || sheet.rowCount === 0) continue

    const profile = getProfileByKey(config.profileKey)
    if (!profile) {
      allErrors.push({
        sheet: config.sheetName,
        row: 0,
        message: `Ismeretlen profil: ${config.profileKey}`,
      })
      continue
    }

    // Transzformálás
    const result: BatchTransformResult = transformSheet(
      sheet.rows,
      sheet.headers,
      profile,
      ctx,
    )

    // Hibás sorok
    for (const err of result.errors) {
      if (allErrors.length < 50) {
        allErrors.push({
          sheet: config.sheetName,
          row: err.rowIndex + 1,
          message: err.message,
        })
      }
      totalSkipped += 1
    }

    // Lookup resolver — virtuális `_` oszlopok → valódi FK ID-k
    let sheetInserted = 0
    let sheetSkipped = 0
    if (result.records.length > 0) {
      const rawRecords = result.records.map((r) => r.record)
      const { records: resolvedRecords, stats: resolveStats } = await resolveLookups(
        supabase,
        access.effectiveCongregationId,
        rawRecords,
      )

      // Lookup statisztikák aggregálása
      allLookupStats.personResolved += resolveStats.personResolved
      allLookupStats.personUnresolved += resolveStats.personUnresolved
      allLookupStats.categoryResolved += resolveStats.categoryResolved
      allLookupStats.categoryUnresolved += resolveStats.categoryUnresolved
      for (const w of resolveStats.warnings) {
        if (allLookupStats.warnings.length < 50) {
          allLookupStats.warnings.push(`[${config.sheetName}] ${w}`)
        }
      }

      const insertResult = await batchInsertRecords(
        supabase,
        profile,
        resolvedRecords,
        config.sheetName,
        allErrors,
      )
      totalInserted += insertResult.inserted
      totalSkipped += insertResult.skipped
      sheetInserted = insertResult.inserted
      sheetSkipped = insertResult.skipped

      // 2026-07-11 P2 (iktató pointer-szinkron): az import direkt INSERT-tel ír,
      // ezért a next_iktato_sequence sorszám-pointere lemaradna — a következő
      // kézi iktatás ütköző sorszámot kapna. Az RPC minden érintett évre a
      // tényleges maximumra húzza a pointert; hibája nem buktatja az importot.
      if (profile.targetTable === 'iktato' && insertResult.inserted > 0) {
        const affectedYears = new Set<number>()
        for (const rec of resolvedRecords) {
          const y = Number(rec['year'])
          if (Number.isFinite(y) && y >= 1800 && y <= 2200) affectedYears.add(y)
        }
        // Az évek függetlenek — párhuzamosan szinkronizálhatók (sok-éves
        // archívum-importnál a soros változat éveként egy kört várna).
        await Promise.allSettled(
          [...affectedYears].map(async (y) => {
            const { error: syncError } = await supabase.rpc('sync_iktato_sequence_pointer', {
              p_congregation_id: access.effectiveCongregationId,
              p_year: y,
            })
            if (syncError) {
              console.warn(
                `[executeBatchImport] Iktató sorszám-pointer szinkron sikertelen (${y}. év): ${syncError.message}`,
              )
            }
          }),
        )
      }
    }

    perSheetLog.push({
      sheet: config.sheetName,
      profile: profile.key,
      inserted: sheetInserted,
      skipped: sheetSkipped + result.errors.length,
    })
  }

  // Revalidáljuk a megfelelő útvonalat
  revalidateModule(moduleStr as ImportModule)

  // Import log rögzítése (a táblához csatolt insert csak próbálkozás, hibát
  // nem logolunk tovább, hogy a fő flow ne akadjon el)
  try {
    const { logImportRun } = await import('./import-log')
    await logImportRun({
      supabase,
      congregationId: access.effectiveCongregationId,
      userId: access.user.id,
      module: moduleStr as ImportModule,
      fileName: file.name,
      totalInserted,
      totalSkipped,
      perSheetLog,
      lookupStats: allLookupStats,
      errors: allErrors,
    })
  } catch (e) {
    console.warn('[executeBatchImport] Import log rögzítése sikertelen:', e)
  }

  return {
    success: true,
    insertedCount: totalInserted,
    skippedCount: totalSkipped,
    errors: allErrors.length > 0 ? allErrors : undefined,
    lookupStats: allLookupStats,
  }
}

// ---------------------------------------------------------------------------
// Belső: batch INSERT
// ---------------------------------------------------------------------------

async function batchInsertRecords(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: ImportProfile,
  records: Array<Record<string, string | number | boolean | null>>,
  sheetName: string,
  errors: Array<{ sheet: string; row: number; message: string }>,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0
  let skipped = 0

  // Kiszűrjük a _ prefixű (virtuális) oszlopokat — ezek lookup mezők,
  // amiket nem írunk közvetlenül a DB-be
  const cleanedRecords = records.map((rec) => {
    const cleaned: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(rec)) {
      if (!key.startsWith('_')) {
        cleaned[key] = val
      }
    }
    return cleaned
  })

  // Batch insert 100-asával
  const BATCH_SIZE = 100
  for (let i = 0; i < cleanedRecords.length; i += BATCH_SIZE) {
    const batch = cleanedRecords.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
      .from(profile.targetTable)
      .insert(batch)

    if (error) {
      // Ha a batch hibás, próbálkozunk egyenként
      for (let j = 0; j < batch.length; j++) {
        const { error: rowError } = await supabase
          .from(profile.targetTable)
          .insert([batch[j]])

        if (rowError) {
          skipped += 1
          if (errors.length < 50) {
            errors.push({
              sheet: sheetName,
              row: i + j + 1,
              message: rowError.message,
            })
          }
        } else {
          inserted += 1
        }
      }
    } else {
      inserted += batch.length
    }
  }

  return { inserted, skipped }
}

// ---------------------------------------------------------------------------
// Revalidáció modulonként
// ---------------------------------------------------------------------------

function revalidateModule(module: ImportModule) {
  switch (module) {
    case 'members':
      revalidatePath('/tagnyilvantartas')
      break
    case 'finance':
      revalidatePath('/penzugy')
      break
    case 'registry':
      revalidatePath('/anyakonyv')
      break
    case 'worklog':
      revalidatePath('/munkanaplo')
      break
    case 'filing':
      revalidatePath('/iktato')
      break
    case 'inventory':
      revalidatePath('/leltar')
      break
  }
}
