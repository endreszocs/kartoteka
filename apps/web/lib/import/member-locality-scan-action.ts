'use server'

/**
 * Tagnyilvántartás-import — TELJES fájlt parse-oló helység-skenner.
 *
 * 2026-07-17 (PR-1, település-P0 társ-ok): a wizard `uniqueLocalityInputs`
 * listája eddig csak a sampleRows-ból (első 5 sor) épült, így az 5. sor után
 * először előforduló település SOSEM került a helység-egyeztető lépésbe →
 * a resolvedLocalityMap-ből kimaradt → szemely.c_helysegid NULL.
 *
 * Ez a server action a TELJES fájlt parse-olja és visszaadja az ÖSSZES egyedi
 * helység-szöveget a `_helyseg_text`-re map-elt oszlop(ok)ból. A minta az
 * anyakönyvi registry-locality-scan-action.ts (2026-04-30) — itt a MEMBER_PROFILES
 * profiljaira.
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

import { parseWorkbook, parseCsvString, parseXmlSpreadsheet } from './excel-parser'
import type { ParsedWorkbook } from './excel-parser'
import { MEMBER_PROFILES } from './import-profiles'

export interface MemberLocalityScanResult {
  success?: boolean
  error?: string
  /** Az összes egyedi helység-szöveg a fájl teljes hosszán (nem csak sample). */
  uniqueValues?: string[]
}

const SUPPORTED_EXTS = ['xlsx', 'xls', 'csv', 'xml']

export async function scanMemberLocalitiesAction(
  formData: FormData,
): Promise<MemberLocalityScanResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const file = formData.get('file') as File | null
  const sheetName = formData.get('sheetName') as string | null
  const profileKey = formData.get('profileKey') as string | null
  /** A wizard által kalkulált effektív mapping JSON: { excelHeader: dbColumn|null } */
  const mappingRaw = formData.get('mapping') as string | null

  if (!file) return { error: 'Nincs fájl kiválasztva.' }
  if (!profileKey) return { error: 'Hiányzó profil-kulcs.' }
  if (!mappingRaw) return { error: 'Hiányzó oszlop-mapping.' }

  const profile = MEMBER_PROFILES.find(p => p.key === profileKey)
  if (!profile) return { error: `Érvénytelen profil-kulcs: ${profileKey}` }

  let mapping: Record<string, string | null>
  try {
    mapping = JSON.parse(mappingRaw)
  } catch {
    return { error: 'Hibás mapping JSON.' }
  }

  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (!SUPPORTED_EXTS.includes(ext)) {
    return { error: `Nem támogatott fájlformátum (.${ext}).` }
  }

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

  const helysegHeaders = sheet.headers.filter(h => mapping[h] === '_helyseg_text')
  if (helysegHeaders.length === 0) {
    return { success: true, uniqueValues: [] }
  }

  const unique = new Set<string>()
  for (const row of sheet.rows) {
    for (const header of helysegHeaders) {
      const val = row[header]
      if (typeof val === 'string' && val.trim() !== '') {
        unique.add(val.trim())
      }
    }
  }

  return {
    success: true,
    uniqueValues: Array.from(unique).sort((a, b) => a.localeCompare(b, 'hu')),
  }
}
