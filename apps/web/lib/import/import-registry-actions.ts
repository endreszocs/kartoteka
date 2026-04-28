'use server'

/**
 * Anyakönyvi import server action.
 *
 * 2026-04-28 ÁTÍRÁS: most a TELJES fájlt parse-olja server-oldalon, NEM
 * csak a sample-t. A korábbi verzió a wizard sampleRows-át kapta (5 sor),
 * ezért 81-soros XML-ből csak 5 importálódott.
 *
 * Lépések:
 *   1. Fájl parse (excel-parser → ParsedWorkbook → sheet.rows)
 *   2. transformSheet (mapping + típuskonverzió + autoColumns)
 *   3. resolveLookups (quad-lookup → id_szemely / id_ferfi / id_no)
 *   4. Helység-text → ID (a kliens-oldali resolvedLocalityMap alapján)
 *   5. Special-fields config (konfirmáció create_baptism_first, marriage vegyes)
 *   6. import_registry_batch RPC hívása az ID-vel ellátott rows-szal
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

import { parseWorkbook, parseCsvString, parseXmlSpreadsheet } from './excel-parser'
import type { ParsedWorkbook } from './excel-parser'
import { REGISTRY_PROFILES, type ImportProfile } from './import-profiles'
import { resolveLookups } from './lookup-resolver'
import { transformSheet, type AutoColumnContext } from './row-transformer'
import type { RowIssue, RowIssueSeverity } from './family-head-import-actions'

export type RegistryProfileKey =
  | 'baptism'
  | 'confirmation'
  | 'marriage'
  | 'burial'
  | 'movement_bekoltozott'
  | 'movement_elkoltozott'
  | 'movement_attert'
  | 'movement_kitert'

export interface RegistryImportResult {
  success?: boolean
  error?: string
  insertedCount?: number
  skippedCount?: number
  totalRows?: number
  rowErrors?: RowIssue[]
}

const VALID_PROFILES: RegistryProfileKey[] = [
  'baptism', 'confirmation', 'marriage', 'burial',
  'movement_bekoltozott', 'movement_elkoltozott',
  'movement_attert', 'movement_kitert',
]

const SUPPORTED_EXTS = ['xlsx', 'xls', 'csv', 'xml']

interface SpecialFieldsConfig {
  autoCreateBaptismForConfirmation?: boolean
  marriageVegyesGlobal?: boolean
}

/**
 * A kliens-oldali transformedRow → SQL RPC-vel feldolgozható row mapping.
 * - DB mezők (nem `_` prefix) átkerülnek
 * - Helység-text → ID (a profile szerinti fkOszlop-ra)
 * - Special-fields: konfirmáció create_baptism_first JSONB, marriage vegyes
 */
function buildRpcRow(
  rec: Record<string, unknown>,
  profileKey: RegistryProfileKey,
  localityIdMap: Record<string, number>,
  specialConfig: SpecialFieldsConfig,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (k.startsWith('_')) continue
    if (v == null) continue
    out[k] = v
  }

  const helysegLookup = (textKey: string, fkKey: string) => {
    const text = rec[textKey]
    if (typeof text === 'string' && text.trim()) {
      const norm = text.toLowerCase().trim().replace(/\s+/g, ' ')
      const id = localityIdMap[norm]
      if (id) out[fkKey] = id
    }
  }

  if (profileKey === 'baptism' || profileKey === 'confirmation' || profileKey === 'marriage') {
    helysegLookup('_helyseg_text', 'helyid')
  } else if (profileKey === 'burial') {
    helysegLookup('_hhelyseg_text', 'hhelyid')
    helysegLookup('_thelyseg_text', 'thelyid')
  } else if (profileKey === 'movement_bekoltozott' || profileKey === 'movement_attert') {
    helysegLookup('_helyseg_text', 'honnanid')
  } else if (profileKey === 'movement_elkoltozott' || profileKey === 'movement_kitert') {
    helysegLookup('_helyseg_text', 'hovaid')
  }

  // Esketés vegyes-flag globális
  if (profileKey === 'marriage' && specialConfig.marriageVegyesGlobal && out.vegyes == null) {
    out.vegyes = true
  }

  // Konfirmáció create_baptism_first JSONB
  if (
    profileKey === 'confirmation'
    && specialConfig.autoCreateBaptismForConfirmation
    && rec.keresztelesideje
  ) {
    out.create_baptism_first = JSON.stringify({
      datum: rec.keresztelesideje,
      helyid: out.helyid ?? null,
      lelkeszneve: out.lelkeszneve ?? null,
    })
  }

  return out
}

/**
 * Fő belépési pont — TELJES fájl-parse + RPC hívás.
 *
 * @param formData FormData mezők:
 *   - file: a feltöltött Excel/CSV/XML
 *   - sheetName: melyik sheet (opcionális, default: első nem-üres)
 *   - profileKey: RegistryProfileKey
 *   - resolvedLocalityMap: JSON map (kliens-oldali helység-resolveolás eredménye)
 *   - specialFieldsConfig: JSON ({ autoCreateBaptismForConfirmation, marriageVegyesGlobal })
 *   - defaultMunkanaploba: 'true' | 'false' (default 'false')
 *   - targetCongregationId: opcionális admin override
 */
export async function executeRegistryImport(
  formData: FormData,
): Promise<RegistryImportResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const file = formData.get('file') as File | null
  const sheetName = formData.get('sheetName') as string | null
  const profileKeyRaw = formData.get('profileKey') as string | null
  const localityMapRaw = formData.get('resolvedLocalityMap') as string | null
  const specialConfigRaw = formData.get('specialFieldsConfig') as string | null
  const defaultMunkanaplobaRaw = formData.get('defaultMunkanaploba') as string | null
  const targetCongregationId =
    (formData.get('targetCongregationId') as string | null) ||
    access.effectiveCongregationId

  // Validáció
  if (!profileKeyRaw || !VALID_PROFILES.includes(profileKeyRaw as RegistryProfileKey)) {
    return { error: `Érvénytelen profil-kulcs: ${profileKeyRaw || '(üres)'}` }
  }
  const profileKey = profileKeyRaw as RegistryProfileKey
  if (!targetCongregationId) return { error: 'Nincs cél gyülekezet kiválasztva.' }
  if (!file) return { error: 'Nincs fájl kiválasztva.' }
  if (file.size > 10 * 1024 * 1024) {
    return { error: 'A fájl mérete meghaladja a 10 MB-os limitet.' }
  }
  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (!SUPPORTED_EXTS.includes(ext)) {
    return { error: `Nem támogatott fájlformátum (.${ext}).` }
  }

  // Profil object
  const profile: ImportProfile | undefined = REGISTRY_PROFILES.find(p => p.key === profileKey)
  if (!profile) return { error: `Profile not found: ${profileKey}` }

  // 1. Parse
  let workbook: ParsedWorkbook
  try {
    if (ext === 'csv') {
      workbook = parseCsvString(await file.text(), file.name)
    } else if (ext === 'xml') {
      workbook = parseXmlSpreadsheet(await file.text(), file.name)
    } else {
      workbook = parseWorkbook(await file.arrayBuffer(), file.name)
    }
  } catch (e) {
    return {
      error: `A fájl olvasása sikertelen: ${e instanceof Error ? e.message : 'ismeretlen'}`,
    }
  }

  const sheet = sheetName
    ? workbook.sheets.find(s => s.name === sheetName)
    : workbook.sheets.find(s => !s.warning && s.rowCount > 0) || workbook.sheets[0]
  if (!sheet) return { error: `Nem található a megadott fül: ${sheetName || '(első)'}` }
  if (sheet.rowCount === 0) return { error: `A "${sheet.name}" fül üres.` }
  if (sheet.warning) return { error: `A "${sheet.name}" fül problémás: ${sheet.warning}` }

  // 2. transformSheet (mapping + típuskonverzió)
  const ctx: AutoColumnContext = {
    congregationId: targetCongregationId,
    userId: access.user.id,
    currentYear: new Date().getFullYear(),
  }
  const transformResult = transformSheet(sheet.rows, sheet.headers, profile, ctx)
  if (transformResult.errors.length > 0 && transformResult.records.length === 0) {
    return {
      error: transformResult.errors[0]?.message || 'A sheet egyetlen sora sem dolgozható fel.',
      rowErrors: transformResult.errors.map(e => ({
        row: e.rowIndex + 1,
        message: e.message,
        severity: 'error' as RowIssueSeverity,
      })),
    }
  }

  // 3. resolveLookups (quad-lookup → id_szemely / id_ferfi / id_no)
  const supabase = await createClient()
  const records = transformResult.records.map(r => ({ ...r.record }))
  await resolveLookups(supabase, targetCongregationId, records)

  // 3b. SELF-HEALING (marriage profil) — UPDATE szcs_nev a megtalált
  //     feleségeken, ha a tagnyilv. szcs_nev mezője üres és a XML adott
  //     lánykori családnevet. Így a tagnyilvántartás fokozatosan kiegészül.
  //     Plus: a következő esketés-importnál már a maiden-fallback működik.
  if (profileKey === 'marriage') {
    const updates: Array<{ id: number; szcs_nev: string }> = []
    for (const r of records) {
      const idNo = r.id_no
      const lankoriNev = r._no_csaladnev
      if (
        idNo != null && idNo !== ''
        && typeof lankoriNev === 'string' && lankoriNev.trim()
      ) {
        // Ha még nincs ebben a listában (egyik feleség többször is szerepelhet)
        const idNum = Number(idNo)
        if (Number.isFinite(idNum) && !updates.find(u => u.id === idNum)) {
          updates.push({ id: idNum, szcs_nev: lankoriNev.trim() })
        }
      }
    }
    if (updates.length > 0) {
      // Csak az ÜRES szcs_nev-űeket frissítjük — az alapján egy szelektív
      // SELECT + UPDATE párost csinálunk (nem írjuk felül a már beállítottakat).
      const ids = updates.map(u => u.id)
      const { data: existing } = await supabase
        .from('szemely')
        .select('id, szcs_nev')
        .in('id', ids)
      const updatableIds = new Set(
        (existing || []).filter(e => !e.szcs_nev || e.szcs_nev.trim() === '').map(e => e.id),
      )
      for (const u of updates) {
        if (updatableIds.has(u.id)) {
          await supabase
            .from('szemely')
            .update({ szcs_nev: u.szcs_nev })
            .eq('id', u.id)
        }
      }
    }
  }

  // 4. Kliens-oldali state parse
  let localityIdMap: Record<string, number> = {}
  if (localityMapRaw) {
    try {
      localityIdMap = JSON.parse(localityMapRaw)
    } catch {
      // Ha rossz a JSON, üres map (nem fatal)
    }
  }
  let specialConfig: SpecialFieldsConfig = {}
  if (specialConfigRaw) {
    try {
      specialConfig = JSON.parse(specialConfigRaw)
    } catch {
      // ignore
    }
  }

  // 5. RPC-row építés (helység-resolve + special-fields)
  const rpcRows = records.map(r => buildRpcRow(r as Record<string, unknown>, profileKey, localityIdMap, specialConfig))

  // 6. RPC hívás batch-ekben (200 sor / hívás biztonságosan)
  const BATCH_SIZE = 200
  const defaultMunkanaploba = defaultMunkanaplobaRaw === 'true'
  let totalInserted = 0
  let totalSkipped = 0
  const allErrors: RowIssue[] = []

  for (let i = 0; i < rpcRows.length; i += BATCH_SIZE) {
    const batch = rpcRows.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase.rpc('import_registry_batch', {
      p_target_congregation_id: targetCongregationId,
      p_profile_key: profileKey,
      p_rows: batch,
      p_default_munkanaploba: defaultMunkanaploba,
    })

    if (error) {
      return {
        success: false,
        error: `Az import sikertelen a ${i / BATCH_SIZE + 1}. batch-en: ${error.message}`,
        insertedCount: totalInserted,
        skippedCount: totalSkipped,
        totalRows: rpcRows.length,
        rowErrors: allErrors,
      }
    }

    const firstRow = Array.isArray(data) ? data[0] : data
    totalInserted += (firstRow?.inserted_count as number) ?? 0
    totalSkipped += (firstRow?.skipped_count as number) ?? 0
    const batchErrors = ((firstRow?.errors as RowIssue[]) ?? []).map(e => ({
      row: (e.row || 0) + i, // batch-offset hozzáadása
      message: e.message,
      severity: (e.severity ?? 'error') as RowIssueSeverity,
      name: e.name,
    }))
    allErrors.push(...batchErrors)
  }

  // Cache-invalidálás
  revalidatePath('/anyakonyv')
  revalidatePath('/tagnyilvantartas')

  return {
    success: true,
    insertedCount: totalInserted,
    skippedCount: totalSkipped,
    totalRows: rpcRows.length,
    rowErrors: allErrors,
  }
}
