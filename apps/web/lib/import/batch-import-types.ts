/**
 * Batch import típusok — külön fájlban a 'use server' korlátozás miatt.
 */

export interface ParsedSheetPreview {
  sheetName: string
  headers: string[]
  rowCount: number
  suggestedProfileKey: string | null
  sampleRows: Array<Record<string, string | number | null>>
  warning?: string
}

export interface ParseResult {
  success?: boolean
  error?: string
  fileName?: string
  isCsv?: boolean
  sheets?: ParsedSheetPreview[]
  /**
   * 2026-08-26: a feltöltött fájl a HIVATALOS Leltar 3_43 munkafüzet — a
   * generikus út nem dolgozza fel, a kliens a dedikált importálóhoz irányít.
   */
  leltar343?: boolean
}

export interface ImportSheetConfig {
  sheetName: string
  profileKey: string
}

export interface BatchImportResult {
  success?: boolean
  error?: string
  insertedCount?: number
  skippedCount?: number
  errors?: Array<{ sheet: string; row: number; message: string }>
  lookupStats?: {
    personResolved: number
    personUnresolved: number
    categoryResolved: number
    categoryUnresolved: number
    warnings: string[]
  }
}
