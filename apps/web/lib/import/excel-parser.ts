/**
 * Szerver-oldali Excel / CSV / XML parser a rendszergazdai import funkciókhoz.
 *
 * Támogatott formátumok:
 *  - .xlsx / .xls (Microsoft Excel — modern és régi)
 *  - .csv (vessző-/pontosvessző-elválasztott)
 *  - .xml (Microsoft Excel SpreadsheetML 2003 — Excel "XML Spreadsheet" export)
 *
 * Főbb képességek:
 *  - Többfüles (multi-sheet) Excel fájlok — minden sheet külön felismerve
 *  - Intelligens fejléc detekció (az első "értelmes" sor)
 *  - Üres cellák normalizálása
 *  - Excel-i dátum szériaszámok → ISO dátum string
 *  - Automatikus trim és szám-konverzió
 */

import * as XLSX from 'xlsx'

export interface ParsedSheet {
  /** A sheet eredeti neve (pl. "Bevételek", "Tagok", "Sheet1") */
  name: string
  /** Az első értelmes sor oszlopnevekkel (fejléc) */
  headers: string[]
  /** A fejléc utáni sorok, objektumként header → érték mappinggal */
  rows: Array<Record<string, string | number | null>>
  /** Hány sort tartalmaz a sheet (fejléc nélkül) */
  rowCount: number
  /** Figyelmeztetés, ha a sheet üres vagy nem kezelhető */
  warning?: string
}

export interface ParsedWorkbook {
  /** A fájl neve */
  fileName: string
  /** Minden detektált sheet */
  sheets: ParsedSheet[]
  /** Hány fül van összesen */
  sheetCount: number
  /** Ha csak CSV, ez a neve */
  isCsv: boolean
}

/**
 * Duplikált fejléc nevek deduplikálása `_2`, `_3`, ... suffix-szel.
 * Pl. ['Vegyes', 'Családnév', 'Férfi', 'Családnév', 'Nő', 'Hely', 'Vegyes']
 *   → ['Vegyes', 'Családnév', 'Férfi', 'Családnév_2', 'Nő', 'Hely', 'Vegyes_2']
 *
 * Az anyakönyvi import-XML-ekben (esketesek.xml-ben) a "Családnév" oszlop
 * kétszer is szerepel (férj + nő), és ugyanígy a "Vegyes". Eredetileg a row
 * dictionary-ban a 2. felülírja az 1.-t, így a férj családneve elveszett.
 * Ez a deduplikálás megőrzi mindkettőt.
 */
function dedupeHeaders(headers: string[]): string[] {
  const counts: Record<string, number> = {}
  return headers.map(h => {
    const baseCount = counts[h] || 0
    counts[h] = baseCount + 1
    return baseCount === 0 ? h : `${h}_${baseCount + 1}`
  })
}

/**
 * Cella érték normalizálás: undefined/null → null, string trim, szám szám.
 * Excel dátum-sorszámot (~45000) ISO dátum stringre alakít.
 */
function normalizeCell(value: unknown): string | number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') {
    // Excel date-szám? A tartomány 1 (1900-01-01) és ~60000 (2064) között
    // A SheetJS alapértelmezetten nem dátum-konvertál, hanem szám marad.
    // A cell-level típus ellenőrzés a XLSX.utils.sheet_to_json-ban történik.
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10) // YYYY-MM-DD
  }
  // bool → string
  return String(value)
}

/**
 * Excel dátum-serial szám → ISO dátum (YYYY-MM-DD).
 * Epoch: 1900-01-01 (Excel quirk: 1900-02-29 létezőnek hitt hibával).
 */
export function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null
  // Excel 1900-based epoch (minus 2 for Excel's 1900-02-29 bug)
  const epochMs = Date.UTC(1900, 0, 1) - 2 * 24 * 60 * 60 * 1000
  const ms = epochMs + serial * 24 * 60 * 60 * 1000
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

/**
 * Excel workbook parser — egy ArrayBuffer-ból kiolvassa az összes sheet-et.
 */
export function parseWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
): ParsedWorkbook {
  const workbook = XLSX.read(buffer, {
    type: 'array',
    // cellDates: true → a date cellák Date objektumként jönnek
    cellDates: true,
    // raw: false → formatted string-et is kapunk
    raw: false,
  })

  const sheets: ParsedSheet[] = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    if (!sheet) {
      return { name, headers: [], rows: [], rowCount: 0, warning: 'Üres fül' }
    }

    // Lekérjük a sheet-et 2D tömbként, hogy magunk detektáljuk a fejlécet
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
    })

    if (aoa.length === 0) {
      return { name, headers: [], rows: [], rowCount: 0, warning: 'Üres fül' }
    }

    // Fejléc detekció: az első olyan sor, ahol legalább 2 nem-null cella van
    // és több mint a felének van szöveges tartalma
    let headerIndex = -1
    for (let i = 0; i < Math.min(aoa.length, 10); i += 1) {
      const row = aoa[i]
      if (!row || !Array.isArray(row)) continue
      const nonNullCount = row.filter((c) => c !== null && c !== undefined && c !== '').length
      const stringCount = row.filter((c) => typeof c === 'string' && c.trim().length > 0).length
      if (nonNullCount >= 2 && stringCount >= Math.ceil(nonNullCount / 2)) {
        headerIndex = i
        break
      }
    }

    if (headerIndex === -1) {
      return { name, headers: [], rows: [], rowCount: 0, warning: 'Nem található fejléc' }
    }

    const rawHeaders = aoa[headerIndex] as unknown[]
    const headers = dedupeHeaders(
      rawHeaders.map((h, idx) => {
        const normalized = normalizeCell(h)
        if (typeof normalized === 'string' && normalized.length > 0) return normalized
        return `oszlop_${idx + 1}` // fallback név, ha üres
      }),
    )

    const rows: Array<Record<string, string | number | null>> = []
    for (let i = headerIndex + 1; i < aoa.length; i += 1) {
      const rowArr = aoa[i]
      if (!rowArr || !Array.isArray(rowArr)) continue

      // Üres sorokat kihagyjuk
      const hasContent = rowArr.some((c) => c !== null && c !== undefined && c !== '')
      if (!hasContent) continue

      const rowObj: Record<string, string | number | null> = {}
      headers.forEach((header, idx) => {
        rowObj[header] = normalizeCell(rowArr[idx])
      })
      rows.push(rowObj)
    }

    return {
      name,
      headers,
      rows,
      rowCount: rows.length,
    }
  })

  return {
    fileName,
    sheets,
    sheetCount: sheets.length,
    isCsv: fileName.toLowerCase().endsWith('.csv'),
  }
}

/**
 * Microsoft Excel SpreadsheetML 2003 parser — egy XML string-ből.
 *
 * Az "Excel XML Spreadsheet (.xml)" formátum a régebbi Excel verziókban
 * létrejövő szöveges export. A SheetJS automatikusan felismeri, ha
 * `XLSX.read(content, { type: 'string' })`-szel hívjuk.
 *
 * A workbook struktúra ugyanaz, mint az XLSX-nél — multi-sheet, fejléc-detekció
 * a `parseWorkbook`-kal megegyező logikával.
 */
export function parseXmlSpreadsheet(content: string, fileName: string): ParsedWorkbook {
  const workbook = XLSX.read(content, {
    type: 'string',
    cellDates: true,
    raw: false,
  })

  const sheets: ParsedSheet[] = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    if (!sheet) {
      return { name, headers: [], rows: [], rowCount: 0, warning: 'Üres fül' }
    }

    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
    })

    if (aoa.length === 0) {
      return { name, headers: [], rows: [], rowCount: 0, warning: 'Üres fül' }
    }

    // Fejléc-detekció: ugyanaz a logika, mint a parseWorkbook-ban
    let headerIndex = -1
    for (let i = 0; i < Math.min(aoa.length, 10); i += 1) {
      const row = aoa[i]
      if (!row || !Array.isArray(row)) continue
      const nonNullCount = row.filter((c) => c !== null && c !== undefined && c !== '').length
      const stringCount = row.filter((c) => typeof c === 'string' && c.trim().length > 0).length
      if (nonNullCount >= 2 && stringCount >= Math.ceil(nonNullCount / 2)) {
        headerIndex = i
        break
      }
    }

    if (headerIndex === -1) {
      return { name, headers: [], rows: [], rowCount: 0, warning: 'Nem található fejléc' }
    }

    const rawHeaders = aoa[headerIndex] as unknown[]
    const headers = dedupeHeaders(
      rawHeaders.map((h, idx) => {
        const normalized = normalizeCell(h)
        if (typeof normalized === 'string' && normalized.length > 0) return normalized
        return `oszlop_${idx + 1}`
      }),
    )

    const rows: Array<Record<string, string | number | null>> = []
    for (let i = headerIndex + 1; i < aoa.length; i += 1) {
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

    return { name, headers, rows, rowCount: rows.length }
  })

  return {
    fileName,
    sheets,
    sheetCount: sheets.length,
    isCsv: false,
  }
}

/**
 * CSV parser — egy string-ből.
 * Auto-detektálja az elválasztót (vessző, pontosvessző, tab).
 */
export function parseCsvString(content: string, fileName: string): ParsedWorkbook {
  // XLSX.read támogatja a CSV stringet is
  const workbook = XLSX.read(content, { type: 'string', raw: false })
  const firstSheetName = workbook.SheetNames[0] || 'Sheet1'
  const sheet = workbook.Sheets[firstSheetName]

  if (!sheet) {
    return {
      fileName,
      sheets: [{ name: firstSheetName, headers: [], rows: [], rowCount: 0, warning: 'Üres CSV' }],
      sheetCount: 1,
      isCsv: true,
    }
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  })

  // Ugyanaz a fejléc-detekció, mint az Excel-nél
  let headerIndex = -1
  for (let i = 0; i < Math.min(aoa.length, 10); i += 1) {
    const row = aoa[i]
    if (!row || !Array.isArray(row)) continue
    const nonNullCount = row.filter((c) => c !== null && c !== undefined && c !== '').length
    if (nonNullCount >= 2) {
      headerIndex = i
      break
    }
  }

  if (headerIndex === -1) {
    return {
      fileName,
      sheets: [{ name: firstSheetName, headers: [], rows: [], rowCount: 0, warning: 'Nem található fejléc' }],
      sheetCount: 1,
      isCsv: true,
    }
  }

  const rawHeaders = aoa[headerIndex] as unknown[]
  const headers = dedupeHeaders(
    rawHeaders.map((h, idx) => {
      const normalized = normalizeCell(h)
      if (typeof normalized === 'string' && normalized.length > 0) return normalized
      return `oszlop_${idx + 1}`
    }),
  )

  const rows: Array<Record<string, string | number | null>> = []
  for (let i = headerIndex + 1; i < aoa.length; i += 1) {
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
    fileName,
    sheets: [{ name: firstSheetName, headers, rows, rowCount: rows.length }],
    sheetCount: 1,
    isCsv: true,
  }
}

/**
 * Cella érték → dátum string (ISO). Kezeli:
 *  - ISO string: "2026-04-15"
 *  - Magyar formátum: "2026.04.15", "2026.04.15."
 *  - Dátum-serial szám (Excel): 45678
 *  - Date objektum (ha cellDates: true)
 */
export function coerceToIsoDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return excelSerialToIsoDate(value)
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  // ISO formátum: 2026-04-15
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Magyar: 2026.04.15 / 2026.04.15. / 2026/04/15
  const huMatch = trimmed.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/)
  if (huMatch) {
    const [, y, m, d] = huMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Magyar fordított: 15.04.2026 / 15/04/2026
  const huRevMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (huRevMatch) {
    const [, d, m, y] = huRevMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Date constructor próbálkozás
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return null
}

/**
 * Cella érték → szám. Kezeli:
 *  - Szám: 123.45
 *  - String: "123.45", "123,45", "1 234,56"
 *  - Null / üres: null
 */
export function coerceToNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  // Szóközök (ezresek) eltávolítása, majd magyar vessző → pont
  const normalized = trimmed.replace(/\s+/g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Cella érték → string. Kezeli:
 *  - String: trim
 *  - Szám: toString
 *  - Null / üres: null
 */
export function coerceToString(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}
