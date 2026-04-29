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

  // 3a. MANUÁLIS TAG-PICK alkalmazása (a wizard person-link lépéséről)
  //     A `manualPicks` formátum: { "rowIdx_slot": szemely_id }
  //     - "12_": general (id_szemely) az első nem-talált sorhoz
  //     - "5_ferfi": esketés vőlegény
  //     - "5_no": esketés menyasszony
  const manualPicksRaw = formData.get('manualPicks') as string | null
  if (manualPicksRaw) {
    try {
      const manualPicks: Record<string, number> = JSON.parse(manualPicksRaw)
      for (const [key, szemelyId] of Object.entries(manualPicks)) {
        const [rowIdxStr, slot] = key.split('_')
        const rowIdx = Number(rowIdxStr) - 1 // 1-alapú index → 0-alapú
        if (Number.isFinite(rowIdx) && rowIdx >= 0 && rowIdx < records.length) {
          if (slot === 'ferfi') records[rowIdx].id_ferfi = szemelyId
          else if (slot === 'no') records[rowIdx].id_no = szemelyId
          else records[rowIdx].id_szemely = szemelyId
        }
      }
    } catch {
      // ignore — ha rossz a JSON, marad a quad-lookup eredménye
    }
  }

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

  // 5. RPC-row építés (helység-resolve + special-fields) + PRE-VALIDÁCIÓ
  // ÚJDONSÁG (2026-04-29): a hiányos sorokat MÉG MIELŐTT az RPC-nek küldenénk
  // szűrjük + részletes hibaüzenettel beletesszük az allErrors-ba. Így a
  // lelkész pontosan tudja, hogy a 17. sornál a VŐLEGÉNY hiányzik (nem csak
  // hogy "hiányzik valami").
  const allErrors: RowIssue[] = []
  const rpcRows: Array<{ row: Record<string, unknown>; originalRowIndex: number }> = []

  for (let i = 0; i < records.length; i++) {
    const r = records[i] as Record<string, unknown>
    const rpcRow = buildRpcRow(r, profileKey, localityIdMap, specialConfig)
    const rowIdx = i + 1 // 1-alapú a felhasználó számára
    const missing: string[] = []

    if (profileKey === 'marriage') {
      if (rpcRow.id_ferfi == null || rpcRow.id_ferfi === '') {
        const cs = String(r._ferfi_csaladnev || '?')
        const k = String(r._ferfi_k_nev || '?')
        missing.push(`vőlegény (${cs} ${k}) — válaszd ki a tagot a TOP-5 listából vagy a saját keresővel`)
      }
      if (rpcRow.id_no == null || rpcRow.id_no === '') {
        const cs = String(r._no_csaladnev || '?')
        const k = String(r._no_k_nev || '?')
        missing.push(`menyasszony (${cs} ${k}) — válaszd ki a tagot a TOP-5 listából vagy a saját keresővel`)
      }
      if (rpcRow.datum == null || rpcRow.datum === '') {
        missing.push('esküvő dátuma')
      }
    } else if (profileKey === 'baptism' || profileKey === 'confirmation') {
      if (rpcRow.id_szemely == null || rpcRow.id_szemely === '') {
        const cs = String(r._csaladnev || '?')
        const k = String(r._k_nev || '?')
        missing.push(`${profileKey === 'baptism' ? 'keresztelt' : 'konfirmált'} (${cs} ${k})`)
      }
      if (rpcRow.datum == null || rpcRow.datum === '') {
        missing.push(`${profileKey === 'baptism' ? 'keresztelés' : 'konfirmáció'} dátuma`)
      }
    } else if (profileKey === 'burial') {
      if (rpcRow.id_szemely == null || rpcRow.id_szemely === '') {
        const cs = String(r._csaladnev || '?')
        const k = String(r._k_nev || '?')
        missing.push(`elhunyt (${cs} ${k})`)
      }
      if (rpcRow.hdatum == null || rpcRow.hdatum === '') missing.push('halál dátuma')
      if (rpcRow.tdatum == null || rpcRow.tdatum === '') missing.push('temetés dátuma')
    } else if (profileKey.startsWith('movement_')) {
      if (rpcRow.id_szemely == null || rpcRow.id_szemely === '') {
        const cs = String(r._csaladnev || '?')
        const k = String(r._k_nev || '?')
        missing.push(`tag (${cs} ${k})`)
      }
    }

    if (missing.length > 0) {
      allErrors.push({
        row: rowIdx,
        message: `Hiányzik: ${missing.join('; ')}`,
        severity: 'error' as RowIssueSeverity,
      })
      continue // Ne küldjük tovább az RPC-nek
    }

    rpcRows.push({ row: rpcRow, originalRowIndex: rowIdx })
  }

  // 6. RPC hívás batch-ekben (200 sor / hívás biztonságosan)
  const BATCH_SIZE = 200
  const defaultMunkanaploba = defaultMunkanaplobaRaw === 'true'
  let totalInserted = 0
  let totalSkipped = allErrors.length // a TS-oldali pre-validációs hibák is "skipped"

  for (let i = 0; i < rpcRows.length; i += BATCH_SIZE) {
    const batchSlice = rpcRows.slice(i, i + BATCH_SIZE)
    const batch = batchSlice.map(r => r.row)
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
        totalRows: records.length,
        rowErrors: allErrors,
      }
    }

    const firstRow = Array.isArray(data) ? data[0] : data
    totalInserted += (firstRow?.inserted_count as number) ?? 0
    totalSkipped += (firstRow?.skipped_count as number) ?? 0
    // Az RPC-ből visszajött hiba `row` mezője a batch-en belüli 1-alapú index.
    // Visszafordítjuk az eredeti sor-indexre a batchSlice alapján.
    const batchErrors = ((firstRow?.errors as RowIssue[]) ?? []).map(e => {
      const batchRowIdx = (e.row || 1) - 1 // 0-alapú index a batchSlice-ban
      const originalRow = batchSlice[batchRowIdx]?.originalRowIndex ?? (e.row || 0) + i
      return {
        row: originalRow,
        message: e.message,
        severity: (e.severity ?? 'error') as RowIssueSeverity,
        name: e.name,
      }
    })
    allErrors.push(...batchErrors)
  }

  // Cache-invalidálás
  revalidatePath('/anyakonyv')
  revalidatePath('/tagnyilvantartas')

  return {
    success: true,
    insertedCount: totalInserted,
    skippedCount: totalSkipped,
    totalRows: records.length,
    rowErrors: allErrors,
  }
}
