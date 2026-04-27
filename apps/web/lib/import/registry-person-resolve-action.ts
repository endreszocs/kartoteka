'use server'

/**
 * Anyakönyvi import wizard — person-link lépés szerver-segéd.
 *
 * 2026-04-28 ÁTÍRÁS: most a TELJES fájlt parse-olja server-oldalon
 * (nem csak a sample-t). A korábbi verzió csak az 5-soros sampleRows-ról
 * adott statisztikát, ami félrevezető volt 81-soros XML-en.
 *
 * Lépések:
 *   1. Fájl parse (excel-parser → ParsedWorkbook → sheet.rows)
 *   2. transformSheet (mapping + típuskonverzió)
 *   3. resolveLookups (quad-lookup → id_szemely / id_ferfi / id_no)
 *   4. Statisztika: hány sor talált, hány nem, példák
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createClient } from '@/lib/supabase/server'

import { parseWorkbook, parseCsvString, parseXmlSpreadsheet } from './excel-parser'
import type { ParsedWorkbook } from './excel-parser'
import { REGISTRY_PROFILES } from './import-profiles'
import { resolveLookups } from './lookup-resolver'
import { transformSheet, type AutoColumnContext } from './row-transformer'

export interface RegistryPersonResolveResult {
  success?: boolean
  error?: string
  /** Hány sor sikerült feloldani (legalább egy ID-t kapott) */
  resolvedCount?: number
  /** Hány sor nem talált egyetlen tagot sem */
  unresolvedCount?: number
  /** Hány sor két tag-ID-t igényel (esketés) — és mindkettő sikerült */
  dualResolvedCount?: number
  /** Hány esketés-sornál egyik vagy másik fél nem található */
  dualPartialCount?: number
  /** A teljes sheet sorszáma */
  totalRows?: number
  /** Példa nem-talált sorok (max 20) */
  unresolvedExamples?: Array<{ rowIndex: number; description: string }>
}

const SUPPORTED_EXTS = ['xlsx', 'xls', 'csv', 'xml']

export async function resolveRegistryPersonsAction(
  formData: FormData,
): Promise<RegistryPersonResolveResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const file = formData.get('file') as File | null
  const sheetName = formData.get('sheetName') as string | null
  const profileKey = formData.get('profileKey') as string | null
  const targetCongregationId =
    (formData.get('targetCongregationId') as string | null) ||
    access.effectiveCongregationId

  if (!file) return { error: 'Nincs fájl kiválasztva.' }
  if (!profileKey) return { error: 'Hiányzó profil-kulcs.' }
  if (!targetCongregationId) return { error: 'Nincs cél gyülekezet.' }

  const profile = REGISTRY_PROFILES.find(p => p.key === profileKey)
  if (!profile) return { error: `Érvénytelen profil-kulcs: ${profileKey}` }

  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (!SUPPORTED_EXTS.includes(ext)) {
    return { error: `Nem támogatott fájlformátum (.${ext}).` }
  }

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
    return { error: `A fájl olvasása sikertelen: ${e instanceof Error ? e.message : 'ismeretlen'}` }
  }

  const sheet = sheetName
    ? workbook.sheets.find(s => s.name === sheetName)
    : workbook.sheets.find(s => !s.warning && s.rowCount > 0) || workbook.sheets[0]
  if (!sheet) return { error: `Nem található a megadott fül: ${sheetName || '(első)'}` }
  if (sheet.rowCount === 0) return { error: `A "${sheet.name}" fül üres.` }

  // 2. transformSheet
  const ctx: AutoColumnContext = {
    congregationId: targetCongregationId,
    userId: access.user.id,
    currentYear: new Date().getFullYear(),
  }
  const transformResult = transformSheet(sheet.rows, sheet.headers, profile, ctx)
  if (transformResult.records.length === 0) {
    return {
      success: true,
      resolvedCount: 0,
      unresolvedCount: 0,
      dualResolvedCount: 0,
      dualPartialCount: 0,
      totalRows: 0,
      unresolvedExamples: [],
    }
  }

  // 3. resolveLookups
  const records = transformResult.records.map(r => ({ ...r.record })) as Array<Record<string, string | number | boolean | null>>
  const supabase = await createClient()
  await resolveLookups(supabase, targetCongregationId, records)

  // 4. Statisztika gyűjtés
  const isMarriage = profileKey === 'marriage'
  let resolvedCount = 0
  let unresolvedCount = 0
  let dualResolvedCount = 0
  let dualPartialCount = 0
  const unresolvedExamples: Array<{ rowIndex: number; description: string }> = []

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (isMarriage) {
      const hasFerfi = r.id_ferfi != null && r.id_ferfi !== ''
      const hasNo = r.id_no != null && r.id_no !== ''
      if (hasFerfi && hasNo) {
        dualResolvedCount += 1
      } else if (hasFerfi || hasNo) {
        dualPartialCount += 1
        if (unresolvedExamples.length < 20) {
          const missing = !hasFerfi
            ? `Vőlegény nem található: ${r._ferfi_csaladnev || '?'} ${r._ferfi_k_nev || '?'}`
            : `Menyasszony nem található: ${r._no_csaladnev || '?'} ${r._no_k_nev || '?'}`
          unresolvedExamples.push({ rowIndex: i + 1, description: missing })
        }
      } else {
        unresolvedCount += 1
        if (unresolvedExamples.length < 20) {
          unresolvedExamples.push({
            rowIndex: i + 1,
            description: `Egyik fél sem található: ${r._ferfi_csaladnev || '?'} ${r._ferfi_k_nev || '?'} × ${r._no_csaladnev || '?'} ${r._no_k_nev || '?'}`,
          })
        }
      }
    } else {
      const hasSzemely = r.id_szemely != null && r.id_szemely !== ''
      if (hasSzemely) {
        resolvedCount += 1
      } else {
        unresolvedCount += 1
        if (unresolvedExamples.length < 20) {
          unresolvedExamples.push({
            rowIndex: i + 1,
            description: `${r._csaladnev || '?'} ${r._k_nev || '?'}${r._sz_datum ? `, sz: ${r._sz_datum}` : ''}`,
          })
        }
      }
    }
  }

  return {
    success: true,
    resolvedCount,
    unresolvedCount,
    dualResolvedCount,
    dualPartialCount,
    totalRows: records.length,
    unresolvedExamples,
  }
}
