/**
 * Row transformer — egy Excel sor → DB rekord konverzió a profil columnMap alapján.
 *
 * Funkciók:
 *  1. Header matching: az Excel fejléceket a profil oszlopokhoz társítja (fuzzy)
 *  2. Típuskonverzió: dátum, szám, bool normalizálás a coerce* helperekkel
 *  3. Validáció: kötelező mezők ellenőrzése, hiányzó mezők jelzése
 *  4. AutoColumns kitöltése (congregation_id, user_id, now, stb.)
 */

import type {
  ImportProfile,
  ColumnMapping,
  AutoColumnSource,
} from './import-profiles'
import { matchHeader } from './import-profiles'
import { coerceToIsoDate, coerceToNumber, coerceToString } from './excel-parser'

// ---------------------------------------------------------------------------
// Típusok
// ---------------------------------------------------------------------------

export interface TransformResult {
  /** A sikeresen transzformált DB rekord (null cellák benne vannak) */
  record: Record<string, string | number | boolean | null>
  /** Figyelmeztetések (nem blokkoló) */
  warnings: string[]
}

export interface RowTransformError {
  /** A sor indexe (0-alapú, fejléc nélkül) */
  rowIndex: number
  /** A hiba leírása */
  message: string
}

export interface HeaderMatchResult {
  /** Excel fejléc → ColumnMapping párosítás */
  matched: Map<string, ColumnMapping>
  /** Nem felismert Excel fejlécek */
  unmatched: string[]
  /** Hiányzó kötelező profiloszlopok (nincs megfelelő Excel fejléc) */
  missingRequired: string[]
}

export interface BatchTransformResult {
  /** Sikeres rekordok */
  records: TransformResult[]
  /** Hibás sorok (kötelező mező hiányzik, stb.) */
  errors: RowTransformError[]
  /** Fejléc párosítás összefoglaló */
  headerMatch: HeaderMatchResult
}

// ---------------------------------------------------------------------------
// Header matching
// ---------------------------------------------------------------------------

/**
 * Excel fejlécek → profil oszlopok párosítása.
 * Az eredmény tartalmazza a matched, unmatched és missingRequired listákat.
 */
export function matchHeaders(
  excelHeaders: string[],
  profile: ImportProfile,
): HeaderMatchResult {
  const matched = new Map<string, ColumnMapping>()
  const unmatched: string[] = []

  for (const header of excelHeaders) {
    const mapping = matchHeader(header, profile)
    if (mapping) {
      matched.set(header, mapping)
    } else {
      unmatched.push(header)
    }
  }

  // Hiányzó kötelező oszlopok
  const matchedDbCols = new Set([...matched.values()].map((m) => m.dbColumn))
  const missingRequired = profile.columnMap
    .filter((col) => col.required && !matchedDbCols.has(col.dbColumn))
    .map((col) => col.excelHeader)

  return { matched, unmatched, missingRequired }
}

// ---------------------------------------------------------------------------
// Cella konverzió
// ---------------------------------------------------------------------------

/**
 * Egy cella értékét a megadott típusra konvertálja.
 */
function convertCell(
  value: string | number | null,
  type: ColumnMapping['type'],
): string | number | boolean | null {
  if (value === null || value === undefined) return null

  switch (type) {
    case 'date':
      return coerceToIsoDate(value)

    case 'number':
      return coerceToNumber(value)

    case 'boolean': {
      if (typeof value === 'number') return value !== 0
      if (typeof value === 'string') {
        const lower = value.toLowerCase().trim()
        if (['igen', 'yes', 'true', '1', 'x', 'i', 'f', 'férfi', 'ferfi'].includes(lower)) return true
        if (['nem', 'no', 'false', '0', '', 'n', 'nő', 'no'].includes(lower)) return false
        // Ha nem ismerjük fel → null
        return null
      }
      return null
    }

    case 'string':
    default:
      return coerceToString(value)
  }
}

// ---------------------------------------------------------------------------
// AutoColumn kitöltés
// ---------------------------------------------------------------------------

export interface AutoColumnContext {
  congregationId: string
  userId: string
  currentYear?: number
}

function resolveAutoColumn(
  source: AutoColumnSource | string,
  ctx: AutoColumnContext,
): string | number | boolean | null {
  switch (source) {
    case 'congregation_id':
      return ctx.congregationId
    case 'user_id':
      return ctx.userId
    case 'now':
      return new Date().toISOString()
    case 'current_year':
      return ctx.currentYear ?? new Date().getFullYear()
    case 'true':
      return true
    case 'false':
      return false
    default:
      // Literális string értékek (pl. 'szolgalat', 'katekezis', 'diakoniai')
      return source
  }
}

// ---------------------------------------------------------------------------
// Egy sor transzformálása
// ---------------------------------------------------------------------------

/**
 * Egyetlen Excel sort DB rekorddá alakít a profil és a header matching alapján.
 */
export function transformRow(
  row: Record<string, string | number | null>,
  headerMatch: HeaderMatchResult,
  profile: ImportProfile,
  ctx: AutoColumnContext,
): TransformResult | RowTransformError {
  const record: Record<string, string | number | boolean | null> = {}
  const warnings: string[] = []

  // 1. Mappelt oszlopok konvertálása
  for (const [excelHeader, mapping] of headerMatch.matched) {
    const rawValue = row[excelHeader] ?? null
    const converted = convertCell(rawValue, mapping.type)
    record[mapping.dbColumn] = converted
  }

  // 2. Kötelező mezők ellenőrzése
  for (const col of profile.columnMap) {
    if (!col.required) continue
    const val = record[col.dbColumn]
    if (val === null || val === undefined || val === '') {
      return {
        rowIndex: -1, // a hívó fél tölti ki
        message: `Kötelező mező hiányzik: "${col.excelHeader}" (→ ${col.dbColumn})`,
      }
    }
  }

  // 3. AutoColumns kitöltése
  for (const auto of profile.autoColumns) {
    record[auto.dbColumn] = resolveAutoColumn(auto.source, ctx)
  }

  // 4. Figyelmeztetések nem-kötelező de üres mezőkre
  for (const col of profile.columnMap) {
    if (col.required) continue
    const val = record[col.dbColumn]
    if (val === null && col.hint) {
      // Nem blokkoló, csak jelezzük
    }
  }

  return { record, warnings }
}

// ---------------------------------------------------------------------------
// Batch transzformálás
// ---------------------------------------------------------------------------

/**
 * Egy teljes sheet sorait transzformálja egy profilhoz.
 *
 * @param rows — Az excel-parser ParsedSheet.rows tömbje
 * @param headers — A ParsedSheet.headers tömbje
 * @param profile — Az ImportProfile
 * @param ctx — AutoColumn kontextus (congregation, user, year)
 */
export function transformSheet(
  rows: Array<Record<string, string | number | null>>,
  headers: string[],
  profile: ImportProfile,
  ctx: AutoColumnContext,
): BatchTransformResult {
  const headerMatch = matchHeaders(headers, profile)

  // Ha kötelező oszlop hiányzik, az egész sheet hibás
  if (headerMatch.missingRequired.length > 0) {
    return {
      records: [],
      errors: [{
        rowIndex: -1,
        message: `Hiányzó kötelező oszlopok: ${headerMatch.missingRequired.join(', ')}`,
      }],
      headerMatch,
    }
  }

  const records: TransformResult[] = []
  const errors: RowTransformError[] = []

  for (let i = 0; i < rows.length; i++) {
    const result = transformRow(rows[i], headerMatch, profile, ctx)

    if ('message' in result) {
      // Hiba — a sor indexet kitöltjük
      errors.push({ rowIndex: i, message: result.message })
    } else {
      records.push(result)
    }
  }

  return { records, errors, headerMatch }
}

// ---------------------------------------------------------------------------
// Preview generálás (UI előnézet)
// ---------------------------------------------------------------------------

export interface SheetPreview {
  sheetName: string
  /** Felismert profil (null ha nincs megfelelő) */
  suggestedProfile: ImportProfile | null
  /** Fejléc párosítás */
  headerMatch: HeaderMatchResult | null
  /** Mintasorok (max 5 transzformált sor) */
  sampleRecords: TransformResult[]
  /** Sorok száma (fejléc nélkül) */
  totalRows: number
  /** Hibás sorok száma a mintában */
  sampleErrors: number
}
