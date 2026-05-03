/**
 * Kassza fül speciális fejléc-detektálása.
 *
 * A `parseWorkbook` automatikus fejléc-detektálása túl liberális — a Kassza
 * fül első 4 során tájékoztató szövegek vannak ("Napi bevétel: 0", "Egyenleg:
 * X RON", "A másolás, kivágás…"), és a parser ezeket fejlécnek veszi.
 *
 * A valódi fejléc az 5. sorban van: `Dátum | Iratszám | Irattip. | Név |
 * Bev. - Összeg | Bevétel - Költ.vet. név | Kiad. - Összeg | Kiadás - költ.vet.
 * név | Megjegyzés | Magyarázat | Költségvetési szám`.
 *
 * Ez a helper kifejezetten a Kassza fülre keres "Dátum"-mal kezdődő sort,
 * és onnan újraépíti a sheet headers + rows tartalmát.
 *
 * 2026-05-03 (hibajavítás — felhasználói visszajelzés alapján).
 */

import * as XLSX from 'xlsx'

import type { ParsedSheet, ParsedWorkbook } from '@/lib/import/excel-parser'

const KASSZA_HEADER_KEYWORDS = [
  'dátum',
  'datum',
  'iratszám',
  'iratszam',
  'bev. - összeg',
  'bevétel',
  'kiad. - összeg',
  'kiadás',
]

/**
 * Igaz, ha a sor egy Kassza fejléc-sor (legalább 3 a kulcs-kifejezésekből
 * megtalálható benne).
 */
function isKasszaHeaderRow(row: unknown[]): boolean {
  let matches = 0
  for (const cell of row) {
    if (typeof cell !== 'string') continue
    const lower = cell.toLowerCase().trim()
    for (const kw of KASSZA_HEADER_KEYWORDS) {
      if (lower.includes(kw)) {
        matches++
        break
      }
    }
    if (matches >= 3) return true
  }
  return false
}

/**
 * Cella érték normalizálás (a `excel-parser.ts:normalizeCell` mintájára,
 * de itt locally kell, mert az nem export).
 */
function normalizeCell(value: unknown): string | number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  return String(value)
}

/**
 * Duplikált fejléc-nevek deduplikálása.
 */
function dedupeHeaders(headers: string[]): string[] {
  const counts: Record<string, number> = {}
  return headers.map((h) => {
    const baseCount = counts[h] || 0
    counts[h] = baseCount + 1
    return baseCount === 0 ? h : `${h}_${baseCount + 1}`
  })
}

/**
 * Újraparse-olja a Kassza fület a buffer-ből úgy, hogy az igazi fejléc-sort
 * találja meg ("Dátum"-mal kezdődő sor).
 *
 * @param buffer Az Excel-fájl ArrayBuffer-je
 * @param sheetName A fül neve (pl. "Kassza")
 * @returns A javított `ParsedSheet`, vagy null ha nem talál fejlécet
 */
export function reparseKasszaSheet(
  buffer: ArrayBuffer,
  sheetName: string,
): ParsedSheet | null {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
      raw: false,
    })
  } catch {
    return null
  }

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return null

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  })

  // Keressük a Kassza fejléc-sort az első 15 sorban
  let headerIndex = -1
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const row = aoa[i]
    if (!row || !Array.isArray(row)) continue
    if (isKasszaHeaderRow(row)) {
      headerIndex = i
      break
    }
  }

  if (headerIndex === -1) return null

  const rawHeaders = aoa[headerIndex] as unknown[]
  const headers = dedupeHeaders(
    rawHeaders.map((h, idx) => {
      const normalized = normalizeCell(h)
      if (typeof normalized === 'string' && normalized.length > 0) return normalized
      return `oszlop_${idx + 1}`
    }),
  )

  const rows: Array<Record<string, string | number | null>> = []
  for (let i = headerIndex + 1; i < aoa.length; i++) {
    const rowArr = aoa[i]
    if (!rowArr || !Array.isArray(rowArr)) continue

    const hasContent = rowArr.some((c) => c !== null && c !== undefined && c !== '')
    if (!hasContent) continue

    const rowObj: Record<string, string | number | null> = {}
    headers.forEach((header, idx) => {
      rowObj[header] = normalizeCell(rowArr[idx])
    })
    rows.push(rowObj)
  }

  return {
    name: sheetName,
    headers,
    rows,
    rowCount: rows.length,
  }
}

/**
 * A workbook Kassza-fülét lecseréli a javított verziójára (in-place).
 * Ha a buffer alapján találunk valódi Kassza fejlécet, felülírja.
 */
export function applyKasszaFix(
  workbook: ParsedWorkbook,
  buffer: ArrayBuffer,
): ParsedWorkbook {
  const kasszaIdx = workbook.sheets.findIndex(
    (s) => s.name.trim().toLowerCase() === 'kassza',
  )
  if (kasszaIdx === -1) return workbook

  const fixed = reparseKasszaSheet(buffer, workbook.sheets[kasszaIdx].name)
  if (fixed) {
    const newSheets = [...workbook.sheets]
    newSheets[kasszaIdx] = fixed
    return { ...workbook, sheets: newSheets }
  }
  return workbook
}
