/**
 * Excel Reader — KARTOTEKA export által generált .xlsx fájlok parseolása
 * vissza Dexie-struktúrájú rekordokra.
 *
 * Input: egy File/Blob amit a FileSystem API-ból kiolvastunk
 * Output: per-sheet rekordok a schema szerint
 *
 * Használja a rejtett `_rowId`, `_revision`, `_syncStatus` oszlopokat,
 * hogy az importnál tudjuk:
 *   - Van-e ID → update (ha 0 vagy nincs → insert)
 *   - Revision → konfliktus-detektáláshoz
 */

import ExcelJS from 'exceljs'

import { toLocalIsoDate } from '@/lib/import/date-utils'

import {
  type ExcelFieldDef,
  type ExcelModuleSchema,
  type ExcelSheetDef,
} from './excel-schema/registry'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface ParsedExcelRow {
  /** Az eredeti sor-szám az Excel-ben (1-based, a fejléc utáni első adat = 2) */
  excelRowIndex: number
  /** A sor tartalma technikai oszlopnevekkel */
  values: Record<string, string | number | boolean | null>
  /** _rowId a rejtett meta oszlopból */
  rowId: string | null
  /** _revision a rejtett meta oszlopból */
  revision: number
  /** _syncStatus a rejtett meta oszlopból */
  syncStatus: string | null
}

export interface ParsedSheetData {
  sheetName: string
  dexieTable: string
  rows: ParsedExcelRow[]
  warnings: string[]
}

export interface ParsedWorkbookData {
  module: string
  schemaVersion: number
  sheets: ParsedSheetData[]
  meta: {
    congregationSlug?: string
    congregationId?: string
    exportedAt?: string
    exportedBy?: string
  }
  warnings: string[]
}

// ─────────────────────────────────────────────────────────────────
// File → ExcelJS Workbook
// ─────────────────────────────────────────────────────────────────

async function loadWorkbook(file: File | Blob): Promise<ExcelJS.Workbook> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

// ─────────────────────────────────────────────────────────────────
// Cell value → TypeScript value (schema szerint)
// ─────────────────────────────────────────────────────────────────

function parseCellValue(
  rawValue: ExcelJS.CellValue,
  field: ExcelFieldDef,
): string | number | boolean | null {
  if (rawValue === null || rawValue === undefined || rawValue === '') return null

  // ExcelJS rich-text object handling
  let value: unknown = rawValue
  if (typeof rawValue === 'object' && rawValue !== null) {
    if ('richText' in rawValue && Array.isArray(rawValue.richText)) {
      value = rawValue.richText
        .map((rt: { text?: string }) => rt.text || '')
        .join('')
    } else if ('text' in rawValue) {
      value = (rawValue as { text: unknown }).text
    } else if ('result' in rawValue) {
      value = (rawValue as { result: unknown }).result
    }
  }

  switch (field.type) {
    case 'boolean': {
      if (typeof value === 'boolean') return value
      if (typeof value === 'string') {
        const lower = value.toLowerCase().trim()
        if (lower === 'igen' || lower === 'true' || lower === 'yes' || lower === '1') return true
        if (lower === 'nem' || lower === 'false' || lower === 'no' || lower === '0') return false
      }
      if (typeof value === 'number') return value !== 0
      return null
    }

    case 'number':
    case 'currency': {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null
      if (typeof value === 'string') {
        const normalized = value.trim().replace(/\s+/g, '').replace(',', '.')
        const n = parseFloat(normalized)
        return Number.isFinite(n) ? n : null
      }
      return null
    }

    case 'date': {
      // P0-22 (audit 2026-08-28): a kanonikus toLocalIsoDate-re delegálunk.
      // A korábbi saját út a szöveges cellát ('2025.01.07') a naiv
      // `new Date(str).toISOString()` ágon Bukarestben −1 napra (év-határon
      // −1 ÉVRE) csúsztatta; a kanonikus helper regex-úton (időzóna nélkül)
      // olvassa a magyar/fordított/ISO alakot, a Date-cellát +12 órás
      // kerekítéssel, a serialt UTC-matekkal kezeli.
      return toLocalIsoDate(value)
    }

    case 'string':
    default:
      if (typeof value === 'string') return value.trim() || null
      if (typeof value === 'number') return String(value)
      return null
  }
}

// ─────────────────────────────────────────────────────────────────
// Egy sheet parseolása
// ─────────────────────────────────────────────────────────────────

function parseSheet(
  ws: ExcelJS.Worksheet,
  sheetDef: ExcelSheetDef,
): ParsedSheetData {
  const warnings: string[] = []
  const rows: ParsedExcelRow[] = []

  // Header (1. sor) olvasása — feltételezzük a display-header alapján a mező-mapping-et,
  // de biztonságból mi is összehasonlítjuk a pozíció alapján.
  const headerRow = ws.getRow(1)
  const headerValues: string[] = []
  headerRow.eachCell({ includeEmpty: true }, cell => {
    headerValues.push(String(cell.value ?? '').trim())
  })

  // Indexek a meta oszlopokhoz (rejtve vannak de olvashatók)
  // A séma alapján az első N oszlop a látható mezőknek felel meg, utánuk jönnek a meta oszlopok
  const visibleFieldCount = sheetDef.fields.length
  const rowIdIdx = visibleFieldCount + 1 // 1-based
  const revisionIdx = visibleFieldCount + 2
  const syncStatusIdx = visibleFieldCount + 3

  // Verify meta headers
  if (headerValues[rowIdIdx - 1] !== '_rowId') {
    warnings.push(
      `A(z) "${sheetDef.sheetName}" munkalapon nem találtam a _rowId meta oszlopot a várt helyen (${rowIdIdx}. oszlop). Az importhoz kézi ellenőrzés kell.`,
    )
  }

  // Sorok olvasása (2. sortól az utolsóig)
  for (let rowIdx = 2; rowIdx <= ws.rowCount; rowIdx++) {
    const row = ws.getRow(rowIdx)
    if (!row.hasValues) continue

    const values: Record<string, string | number | boolean | null> = {}

    // Látható mezők
    for (let i = 0; i < sheetDef.fields.length; i++) {
      const field = sheetDef.fields[i]
      const cell = row.getCell(i + 1)
      values[field.technical] = parseCellValue(cell.value, field)
    }

    // Meta oszlopok
    const rowIdCell = row.getCell(rowIdIdx).value
    const revisionCell = row.getCell(revisionIdx).value
    const syncStatusCell = row.getCell(syncStatusIdx).value

    const rowId = rowIdCell ? String(rowIdCell).trim() : null
    const revision =
      typeof revisionCell === 'number'
        ? revisionCell
        : typeof revisionCell === 'string'
          ? parseInt(revisionCell, 10) || 0
          : 0
    const syncStatus = syncStatusCell ? String(syncStatusCell).trim() : null

    rows.push({
      excelRowIndex: rowIdx,
      values,
      rowId: rowId && rowId !== '' ? rowId : null,
      revision,
      syncStatus,
    })
  }

  return {
    sheetName: sheetDef.sheetName,
    dexieTable: sheetDef.dexieTable,
    rows,
    warnings,
  }
}

// ─────────────────────────────────────────────────────────────────
// Meta sheet parseolás (audit információk)
// ─────────────────────────────────────────────────────────────────

function parseMetaSheet(wb: ExcelJS.Workbook): ParsedWorkbookData['meta'] {
  const meta: ParsedWorkbookData['meta'] = {}

  const metaWs = wb.getWorksheet('_meta')
  if (!metaWs) return meta

  // A meta sheet key-value párokat tart
  metaWs.eachRow({ includeEmpty: false }, row => {
    const keyCell = row.getCell(1).value
    const valueCell = row.getCell(2).value
    if (!keyCell) return

    const key = String(keyCell).trim()
    const value = valueCell ? String(valueCell).trim() : undefined

    if (key === 'congregationSlug') meta.congregationSlug = value
    else if (key === 'congregationId') meta.congregationId = value
    else if (key === 'exportedAt') meta.exportedAt = value
    else if (key === 'exportedBy') meta.exportedBy = value
  })

  return meta
}

// ─────────────────────────────────────────────────────────────────
// Fő belépési pont
// ─────────────────────────────────────────────────────────────────

export async function parseExcelModule(
  file: File | Blob,
  schema: ExcelModuleSchema,
): Promise<ParsedWorkbookData> {
  const wb = await loadWorkbook(file)
  const warnings: string[] = []

  // Schema-version ellenőrzés
  const metaWs = wb.getWorksheet('_meta')
  let schemaVersionInFile = schema.schemaVersion
  if (metaWs) {
    metaWs.eachRow({ includeEmpty: false }, row => {
      const key = String(row.getCell(1).value ?? '').trim()
      if (key === 'schemaVersion') {
        const v = row.getCell(2).value
        if (typeof v === 'number') schemaVersionInFile = v
        else if (typeof v === 'string') schemaVersionInFile = parseInt(v, 10) || schema.schemaVersion
      }
    })
  }

  if (schemaVersionInFile !== schema.schemaVersion) {
    warnings.push(
      `A fájl séma-verziója (${schemaVersionInFile}) eltér az app jelenlegi séma-verziójától (${schema.schemaVersion}). Az import működhet, de egyes mezők nem olvashatók.`,
    )
  }

  // Sheet-enkénti parseolás
  const sheets: ParsedSheetData[] = []
  for (const sheetDef of schema.sheets) {
    const ws = wb.getWorksheet(sheetDef.sheetName)
    if (!ws) {
      warnings.push(`Hiányzó munkalap: "${sheetDef.sheetName}" — kihagyva.`)
      continue
    }
    const parsed = parseSheet(ws, sheetDef)
    sheets.push(parsed)
    warnings.push(...parsed.warnings)
  }

  return {
    module: schema.module,
    schemaVersion: schemaVersionInFile,
    sheets,
    meta: parseMetaSheet(wb),
    warnings,
  }
}
