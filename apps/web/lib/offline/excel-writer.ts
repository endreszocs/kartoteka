/**
 * Excel Writer — Dexie-ből szép, olvasható Excel fájl generálás.
 *
 * Features (ExcelJS-alapú):
 *  ✨ Színes header sáv (modul-téma szerint)
 *  ✨ Zebra striping a sorok között (páratlan/páros)
 *  ✨ Freeze first row (görgetéskor a fejléc marad)
 *  ✨ AutoFilter minden oszlopon
 *  ✨ Automatikus dátum/szám/valuta/boolean formázás
 *  ✨ Vékony szürke cellakeretek
 *  🔒 Sheet protection (olvasható, de NEM szerkeszthető)
 *  🔒 Szűrés és rendezés engedélyezett (csak a szerkesztés tiltott)
 *  🎨 Színes tab-fül minden munkalaphoz
 *  📋 Info box a tetejen: export dátum + gyülekezet
 *  🕵️ Rejtett _meta munkalap (audit trail)
 */

import ExcelJS from 'exceljs'

import { getDb } from './db'
import {
  getOrCreateKartotekaDir,
  writeFileAtomic,
} from './fs-handle-store'
import {
  type ExcelFieldDef,
  type ExcelModuleSchema,
  type ExcelSheetDef,
  getAllExcelSchemas,
} from './excel-schema/registry'
import { getExcelWatcher } from './excel-watcher'

// ─────────────────────────────────────────────────────────────────
// Meta oszlopok — a Fázis 4 (Excel import) miatt kellenek
// ─────────────────────────────────────────────────────────────────
// A `_rowId` és `_revision` **kötelezően kell** az Excel-ben, hogy az
// import vissza tudja azonosítani melyik sor melyik DB-rekordnak
// felel meg, és hogy volt-e közben konfliktus.
// Ezeket `hidden: true` oszlopként rakjuk be — a user nem látja, de
// kézi "Show hidden columns" művelettel felfedezheti, ha szükséges.
const HIDDEN_META_FIELDS: ExcelFieldDef[] = [
  { displayName: '_rowId', technical: '_rowId', type: 'string', width: 12 },
  { displayName: '_revision', technical: '_revision', type: 'number', width: 10 },
  { displayName: '_syncStatus', technical: '_syncStatus', type: 'string', width: 12 },
]

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export interface ExportContext {
  congregationId: string
  congregationSlug: string
  congregationName?: string
  exportedBy: string
  rootHandle: FileSystemDirectoryHandle
}

export interface ExportResult {
  module: string
  fileName: string
  totalRows: number
  byTable: Array<{ table: string; rows: number }>
  durationMs: number
}

// ─────────────────────────────────────────────────────────────────
// Cella formázás segédek
// ─────────────────────────────────────────────────────────────────

function parseDateValue(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v === 'string') {
    const match = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const [, y, m, d] = match
      return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    }
    const parsed = new Date(v)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

function cellValueFor(
  record: Record<string, unknown>,
  field: ExcelFieldDef,
): string | number | Date | boolean | null {
  const v = record[field.technical]
  if (v === null || v === undefined || v === '') return null

  switch (field.type) {
    case 'date': {
      const d = parseDateValue(v)
      return d ?? (typeof v === 'string' ? v : null)
    }
    case 'number':
    case 'currency':
      if (typeof v === 'number') return v
      if (typeof v === 'string') {
        const n = parseFloat(v)
        return Number.isFinite(n) ? n : null
      }
      return null
    case 'boolean':
      return !!v
    case 'string':
    default:
      return String(v)
  }
}

function numFmtFor(field: ExcelFieldDef): string | undefined {
  switch (field.type) {
    case 'date':
      return 'yyyy-mm-dd'
    case 'currency':
      return '#,##0.00'
    case 'number':
      return undefined // default
    default:
      return undefined
  }
}

// ─────────────────────────────────────────────────────────────────
// Sheet építés (ExcelJS)
// ─────────────────────────────────────────────────────────────────

interface BuildSheetOpts {
  sheetDef: ExcelSheetDef
  records: Array<Record<string, unknown>>
  themeColor: string // hex az AARRGGBB alapjához (pl "059669")
}

function buildSheet(
  workbook: ExcelJS.Workbook,
  opts: BuildSheetOpts,
): ExcelJS.Worksheet {
  const { sheetDef, records, themeColor } = opts

  const ws = workbook.addWorksheet(sheetDef.sheetName, {
    properties: {
      tabColor: { argb: 'FF' + (sheetDef.tabColor || themeColor) },
    },
    views: [
      // Freeze first row
      { state: 'frozen', ySplit: 1 },
    ],
  })

  // Látható mezők + rejtett meta oszlopok (_rowId, _revision, _syncStatus)
  const allFields: ExcelFieldDef[] = [...sheetDef.fields, ...HIDDEN_META_FIELDS]

  // Oszlop definíciók (kulcs = technikai név, header = display, width, hidden meta)
  ws.columns = allFields.map((f, idx) => ({
    header: f.displayName,
    key: f.technical,
    width: f.width || 14,
    hidden: idx >= sheetDef.fields.length, // meta oszlopok rejtve
  }))

  // Header styling — színes háttér, fehér félkövér font
  const headerRow = ws.getRow(1)
  headerRow.height = 28
  headerRow.eachCell((cell, colNumber) => {
    if (colNumber > allFields.length) return
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF' + themeColor },
    }
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    }
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
      indent: 1,
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'medium', color: { argb: 'FF' + themeColor } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    }
  })

  // Data sorok hozzáadása (látható + meta mezők)
  records.forEach(record => {
    const rowData: Record<string, unknown> = {}
    // Látható mezők
    for (const field of sheetDef.fields) {
      rowData[field.technical] = cellValueFor(record, field)
    }
    // Rejtett meta oszlopok — az Excel importhoz kellenek
    rowData._rowId = String(record.id ?? '')
    rowData._revision = (record.revision as number) ?? 0
    rowData._syncStatus =
      (record._syncStatus as string) ??
      ((record._pendingDelete as boolean) ? 'deleting' : 'clean')
    ws.addRow(rowData)
  })

  // Zebra striping + cell formázás + keret
  const zebraLight = 'FFF9FAFB' // slate-50 alig látható
  const borderColor = 'FFE5E7EB' // slate-200

  for (let i = 2; i <= records.length + 1; i++) {
    const row = ws.getRow(i)
    const isEven = i % 2 === 0
    row.height = 20

    row.eachCell((cell, colNumber) => {
      if (colNumber > allFields.length) return

      const field = allFields[colNumber - 1]

      // Formázás a típus szerint
      const fmt = numFmtFor(field)
      if (fmt) cell.numFmt = fmt

      // Boolean → "Igen" / "Nem"
      if (field.type === 'boolean' && typeof cell.value === 'boolean') {
        cell.value = cell.value ? 'Igen' : 'Nem'
      }

      // Zebra háttér (páros sorokon)
      if (isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: zebraLight },
        }
      }

      // Cella font + igazítás
      cell.font = {
        name: 'Calibri',
        size: 10,
      }
      cell.alignment = {
        vertical: 'middle',
        horizontal:
          field.type === 'number' ||
          field.type === 'currency' ||
          field.type === 'date'
            ? 'right'
            : 'left',
        indent: 1,
        wrapText: false,
      }

      // Finom keret
      cell.border = {
        top: { style: 'hair', color: { argb: borderColor } },
        bottom: { style: 'hair', color: { argb: borderColor } },
        left: { style: 'hair', color: { argb: borderColor } },
        right: { style: 'hair', color: { argb: borderColor } },
      }
    })
  }

  // AutoFilter csak a látható oszlopokra (meta nem)
  if (records.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: records.length + 1, column: sheetDef.fields.length },
    }
  }

  return ws
}

// ─────────────────────────────────────────────────────────────────
// Meta sheet (rejtett, audit)
// ─────────────────────────────────────────────────────────────────

function buildMetaSheet(
  workbook: ExcelJS.Workbook,
  meta: {
    schemaVersion: number
    module: string
    congregationSlug: string
    congregationId: string
    congregationName?: string
    exportedAt: string
    exportedBy: string
    tables: Array<{ table: string; rowCount: number }>
  },
): void {
  const ws = workbook.addWorksheet('_meta', {
    state: 'veryHidden', // jobb mint a 'hidden' — a user nem tudja jobbklikkel felfedni
  })

  ws.columns = [
    { key: 'key', width: 22 },
    { key: 'value', width: 44 },
  ]

  const rows = [
    ['KARTOTEKA Excel Meta', 'NE TÖRÖLD!'],
    ['', ''],
    ['schemaVersion', meta.schemaVersion],
    ['module', meta.module],
    ['congregationSlug', meta.congregationSlug],
    ['congregationId', meta.congregationId],
    ['congregationName', meta.congregationName || '—'],
    ['exportedAt', meta.exportedAt],
    ['exportedBy', meta.exportedBy],
    ['', ''],
    ['— Táblák —', ''],
    ['Tábla', 'Sorok száma'],
    ...meta.tables.map(t => [t.table, t.rowCount]),
  ]

  rows.forEach(row => ws.addRow(row))
}

// ─────────────────────────────────────────────────────────────────
// Sheet protection — olvasható, de nem szerkeszthető
// ─────────────────────────────────────────────────────────────────

async function protectSheet(
  ws: ExcelJS.Worksheet,
): Promise<void> {
  // ExcelJS.protect jelszó nélkül is működik (a user a "Véleményezés → Munkalap
  // zárolásának feloldása"-val ki tudja kapcsolni ha akarja).
  // Engedélyezzük: sortMode (szűrés), selectLockedCells (másolás)
  await ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: true, // a user szűrhet
    autoFilter: true, // és az autofilterrel interakcióhat
    pivotTables: false,
  })
}

// ─────────────────────────────────────────────────────────────────
// Fő export — modulonként
// ─────────────────────────────────────────────────────────────────

export async function exportModule(
  schema: ExcelModuleSchema,
  ctx: ExportContext,
): Promise<ExportResult> {
  const startedAt = Date.now()
  const db = getDb()

  // Mappa előkészítés
  const congDir = await getOrCreateKartotekaDir(
    ctx.rootHandle,
    ctx.congregationSlug,
  )

  // ExcelJS workbook
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'KARTOTEKA'
  workbook.lastModifiedBy = ctx.exportedBy
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.properties.date1904 = false

  const byTable: Array<{ table: string; rows: number }> = []
  let totalRows = 0

  for (const sheetDef of schema.sheets) {
    // Adat lekérdezés Dexie-ből
    const records = (await db
      .table(sheetDef.dexieTable)
      .filter(r => {
        const congregationId = (r as { congregation_id?: string }).congregation_id
        if (congregationId !== undefined && congregationId !== null) {
          return congregationId === ctx.congregationId
        }
        return true
      })
      .toArray()) as Array<Record<string, unknown>>

    // Törölt/pending-delete sorok kihagyása
    const activeRecords = records.filter(
      r =>
        !(r as { _pendingDelete?: boolean })._pendingDelete &&
        !(r as { deleted?: boolean }).deleted,
    )

    // Sheet építés + protection
    const ws = buildSheet(workbook, {
      sheetDef,
      records: activeRecords,
      themeColor: schema.themeColor,
    })

    await protectSheet(ws)

    byTable.push({ table: sheetDef.dexieTable, rows: activeRecords.length })
    totalRows += activeRecords.length
  }

  // Meta sheet (veryHidden — nem látható a Excel UI-ban)
  buildMetaSheet(workbook, {
    schemaVersion: schema.schemaVersion,
    module: schema.module,
    congregationSlug: ctx.congregationSlug,
    congregationId: ctx.congregationId,
    congregationName: ctx.congregationName,
    exportedAt: new Date().toISOString(),
    exportedBy: ctx.exportedBy,
    tables: byTable.map(t => ({ table: t.table, rowCount: t.rows })),
  })

  // Szerializálás → ArrayBuffer
  const buffer = await workbook.xlsx.writeBuffer()

  // Atomic swap (a régi verzió .bak.1-3-ba kerül)
  await writeFileAtomic(congDir, schema.fileName, buffer as ArrayBuffer)

  // Jelezzük a watchernek, hogy most mi írtuk át — ne triggerelje user-módosításként
  try {
    getExcelWatcher().markOwnWrite(schema.module)
  } catch {
    // Ha a watcher nincs inicializálva, nem baj
  }

  return {
    module: schema.module,
    fileName: schema.fileName,
    totalRows,
    byTable,
    durationMs: Date.now() - startedAt,
  }
}

// ─────────────────────────────────────────────────────────────────
// Minden modul exportja
// ─────────────────────────────────────────────────────────────────

export async function exportAllModules(ctx: ExportContext): Promise<{
  results: ExportResult[]
  totalDurationMs: number
  errors: Array<{ module: string; error: string }>
}> {
  const startedAt = Date.now()
  const results: ExportResult[] = []
  const errors: Array<{ module: string; error: string }> = []

  for (const schema of getAllExcelSchemas()) {
    try {
      const result = await exportModule(schema, ctx)
      results.push(result)
    } catch (e) {
      errors.push({
        module: schema.module,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return {
    results,
    totalDurationMs: Date.now() - startedAt,
    errors,
  }
}
