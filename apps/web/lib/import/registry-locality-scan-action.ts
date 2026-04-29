'use server'

/**
 * Anyakönyvi import — TELJES fájlt parse-oló helység-skenner.
 *
 * Endre észrevétele (2026-04-30): a wizard `uniqueLocalityInputs` állapota
 * eddig csak a sample-soron (5 sor) alapult. Ha az XML 6.+ során új helyszín
 * szerepel (pl. 54 temetésnél valószínűleg több helyszín van), azok NEM
 * kerülnek be a `localityIdMap`-ba → `hhelyid`/`thelyid` NULL marad.
 *
 * Ez a server action a TELJES fájlt parse-olja és visszaadja az ÖSSZES
 * egyedi helység-szöveget a profil helység-jellegű mezőihez (mind a 4
 * lehetséges: `_helyseg_text`, `_hhelyseg_text`, `_thelyseg_text`).
 *
 * A wizard a person-link → locality lépés-átmenet előtt hívja, és az
 * eredménnyel felülírja a sample-alapú listát.
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

import { parseWorkbook, parseCsvString, parseXmlSpreadsheet } from './excel-parser'
import type { ParsedWorkbook } from './excel-parser'
import { REGISTRY_PROFILES } from './import-profiles'

export interface LocalityScanResult {
  success?: boolean
  error?: string
  /** Az összes egyedi helység-szöveg a fájl teljes hosszán (nem csak sample). */
  uniqueValues?: string[]
  /** Részletes lebontás dbColumn szerint (ha a UI külön akarja kezelni). */
  byDbColumn?: Record<string, string[]>
}

const SUPPORTED_EXTS = ['xlsx', 'xls', 'csv', 'xml']
const HELYSEG_DB_COLUMNS = ['_helyseg_text', '_hhelyseg_text', '_thelyseg_text']

export async function scanRegistryLocalitiesAction(
  formData: FormData,
): Promise<LocalityScanResult> {
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

  const profile = REGISTRY_PROFILES.find(p => p.key === profileKey)
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

  // Parse a teljes fájlt
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

  // Helység-jellegű header-ek azonosítása az effektív mapping alapján
  const helysegHeadersByDbCol = new Map<string, string[]>()
  for (const dbCol of HELYSEG_DB_COLUMNS) {
    if (!profile.columnMap.some(c => c.dbColumn === dbCol)) continue
    const headers = sheet.headers.filter(h => mapping[h] === dbCol)
    if (headers.length > 0) helysegHeadersByDbCol.set(dbCol, headers)
  }

  if (helysegHeadersByDbCol.size === 0) {
    return { success: true, uniqueValues: [], byDbColumn: {} }
  }

  // A teljes rows-on végigfutunk, helység-mezőnként gyűjtjük az egyedi értékeket
  const allUnique = new Set<string>()
  const byDbColumn: Record<string, string[]> = {}

  for (const [dbCol, headers] of helysegHeadersByDbCol) {
    const colSet = new Set<string>()
    for (const row of sheet.rows) {
      for (const header of headers) {
        const val = row[header]
        if (typeof val === 'string' && val.trim() !== '') {
          const trimmed = val.trim()
          colSet.add(trimmed)
          allUnique.add(trimmed)
        }
      }
    }
    byDbColumn[dbCol] = Array.from(colSet).sort((a, b) => a.localeCompare(b, 'hu'))
  }

  return {
    success: true,
    uniqueValues: Array.from(allUnique).sort((a, b) => a.localeCompare(b, 'hu')),
    byDbColumn,
  }
}
