/**
 * Excel Import Diff — a parsolt Excel sorait összehasonlítja a Dexie
 * jelenlegi állapotával, és kategorizálja a változásokat.
 *
 * 4 diff-típus:
 *  - 'added': új sor (Excel-ben van, Dexie-ben nincs → _rowId üres)
 *  - 'updated': módosított sor (Excel + Dexie mindkét oldalon, de eltérés)
 *  - 'unchanged': nincs változás (csendes, nem kerül review-ba)
 *  - 'deleted': Dexie-ben van, Excel-ben nincs → user törölte
 *
 * Edge case-ek:
 *  - Törölt `_rowId` oszlop → új sornak vesszük
 *  - Konfliktus: a revision különbözik a Dexie-belivel (közben szerver-oldali
 *    módosítás volt) → flaggeljük 'conflict' -ként
 */

import { getDb } from './db'
import type { ParsedExcelRow, ParsedWorkbookData } from './excel-reader'
import type { ExcelSheetDef } from './excel-schema/registry'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

export type DiffKind = 'added' | 'updated' | 'unchanged' | 'deleted'

export interface FieldDiff {
  field: string // technical név
  oldValue: unknown
  newValue: unknown
}

export interface RowDiff {
  kind: DiffKind
  dexieTable: string
  /** Dexie rekord ID-ja (vagy új sor esetén null) */
  rowId: string | number | null
  /** Excel oldali sor (ha van) */
  excelRow?: ParsedExcelRow
  /** Dexie oldali rekord (ha van) */
  dexieRecord?: Record<string, unknown>
  /** Mezőnkénti változások (csak updated esetén értelmes) */
  fieldDiffs: FieldDiff[]
  /** Konfliktus jelző: a revision különbözik a Dexie-belivel */
  hasConflict: boolean
  /** Ember-olvasható label ehhez a sorhoz (pl. "Kiss János") */
  displayLabel: string
}

export interface SheetDiff {
  sheetName: string
  dexieTable: string
  added: RowDiff[]
  updated: RowDiff[]
  deleted: RowDiff[]
  unchangedCount: number
  conflictCount: number
  warnings: string[]
}

export interface ModuleDiff {
  module: string
  sheets: SheetDiff[]
  totalChanges: number
  totalConflicts: number
  warnings: string[]
}

// ─────────────────────────────────────────────────────────────────
// Display label — ember-olvasható azonosító egy rekordhoz
// ─────────────────────────────────────────────────────────────────

function buildDisplayLabel(
  record: Record<string, unknown>,
  sheetDef: ExcelSheetDef,
): string {
  const dexieTable = sheetDef.dexieTable

  // Tábla-specifikus label kombinációk
  switch (dexieTable) {
    case 'szemely': {
      const cs = record.csaladnev ?? ''
      const k = record.k_nev ?? ''
      if (cs || k) return `${cs} ${k}`.trim()
      return `Személy #${record.id ?? '?'}`
    }
    case 'csalad':
      return `Család #${record.id ?? '?'} (${record.c_szam ?? '—'})`
    case 'presbiter':
      return `Presbiter #${record.id ?? '?'} (${record.tisztseg ?? '—'})`
    case 'gyerek':
      return `${record.nev ?? 'Gyermek'} #${record.id ?? '?'}`
    case 'befizetes':
      return `${record.datum ?? '?'} — ${record.osszeg ?? 0} RON`
    case 'kiadas':
      return `${record.datum ?? '?'} — ${record.osszeg ?? 0} RON (${record.leiras ?? ''})`
    case 'bankszamlak':
      return String(record.bank_neve ?? `Bankszámla #${record.id}`)
    case 'keresztseg':
      return `Keresztelő #${record.id ?? '?'} (${record.datum ?? '—'})`
    case 'konfirmalas':
      return `Konfirmálás #${record.id ?? '?'} (${record.datum ?? '—'})`
    case 'hazassag':
      return `Házasság #${record.id ?? '?'} (${record.datum ?? '—'})`
    case 'temetes':
      return `Temetés #${record.id ?? '?'} (${record.tdatum ?? record.hdatum ?? '—'})`
    case 'munkanaplo':
      return `${record.idopont ?? '?'} — ${record.cim ?? record.jellege ?? ''}`
    case 'iktato':
      return `${record.year ?? '?'}/${record.sequence_number ?? '?'} — ${record.subject ?? ''}`
    case 'iktato_sablonok':
      return String(record.nev ?? `Sablon`)
    case 'leltar_tetelek':
      return String(record.megnevezes ?? `Tétel #${record.id}`)
    case 'sirhelytemeto':
      return String(record.nev ?? `Temető #${record.id}`)
    case 'sirhely':
      return `Sírhely #${record.id ?? '?'} (${record.parcella ?? '—'}/${record.sor ?? '—'}/${record.szam ?? '—'})`
    case 'sirhelyberles':
      return `${record.berlo ?? 'Bérlő'} (${record.megvaltas ?? '?'} — ${record.lejarata ?? '?'})`
    case 'sirhelyelhunyt':
      return `${record.nev ?? 'Elhunyt'} (${record.hdatum ?? '?'})`
    case 'presbiteri_jegyzokonyvek':
      return `${record.ev ?? '?'}/${record.ules_sorszam ?? '?'} — ${record.datum ?? ''}`
    case 'jegyzokonyv_resztvevok':
      return `${record.nev ?? '—'} (${record.szerep ?? record.statusz ?? '—'})`
    case 'jegyzokonyv_napirendi_pontok':
      return `#${record.sorszam ?? '?'}: ${record.cim ?? ''}`
    case 'jegyzokonyv_hatarozatok':
      return `Határozat ${record.ev ?? '?'}/${record.sorszam ?? '?'}`
    default:
      return `Rekord #${record.id ?? record._rowId ?? '?'}`
  }
}

// ─────────────────────────────────────────────────────────────────
// Mező-szintű összehasonlítás
// ─────────────────────────────────────────────────────────────────

function normalizeForCompare(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') {
    // Dátum normalizálás: "2024-01-15T00:00:00.000Z" → "2024-01-15"
    const isoMatch = v.match(/^(\d{4}-\d{2}-\d{2})/)
    if (isoMatch) return isoMatch[1]
    return v.trim()
  }
  return String(v)
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b)
}

function computeFieldDiffs(
  excel: Record<string, unknown>,
  dexie: Record<string, unknown>,
  sheetDef: ExcelSheetDef,
): FieldDiff[] {
  const diffs: FieldDiff[] = []
  for (const field of sheetDef.fields) {
    // 2026-09-05: a CSAK OLVASHATÓ oszlopok (pl. az egyházi azonosító) nem
    // kerülhetnek vissza. A `szemely.cnp` a szülő-kapcsolatok idegen kulcsa,
    // ON UPDATE CASCADE-del — egy Excelben átírt cella némán átkulcsolná a
    // gyermekek szülő-hivatkozását, a gyülekezet-határon is átnyúlva.
    if (field.csakOlvashato) continue
    const excelVal = excel[field.technical]
    const dexieVal = dexie[field.technical]
    if (!valuesEqual(excelVal, dexieVal)) {
      diffs.push({
        field: field.technical,
        oldValue: dexieVal,
        newValue: excelVal,
      })
    }
  }
  return diffs
}

// ─────────────────────────────────────────────────────────────────
// Sheet-szintű diff
// ─────────────────────────────────────────────────────────────────

async function computeSheetDiff(
  parsedSheet: ParsedWorkbookData['sheets'][number],
  sheetDef: ExcelSheetDef,
  congregationId: string,
): Promise<SheetDiff> {
  const db = getDb()
  const dexieTable = db.table(sheetDef.dexieTable)

  // Dexie snapshot ehhez a táblához, ebben a scope-ban
  const dexieRecords = (await dexieTable
    .filter(r => {
      const cid = (r as { congregation_id?: string }).congregation_id
      if (cid !== undefined && cid !== null) return cid === congregationId
      return true
    })
    .toArray()) as Array<Record<string, unknown>>

  // Törölt/pending-delete rekordokat kihagyjuk a diff-ből
  const activeDexieRecords = dexieRecords.filter(
    r =>
      !(r as { _pendingDelete?: boolean })._pendingDelete &&
      !(r as { deleted?: boolean }).deleted,
  )

  // Map Dexie records by ID (string-konverzió, hogy az Excel _rowId is egyezzen)
  const dexieById = new Map<string, Record<string, unknown>>()
  for (const r of activeDexieRecords) {
    dexieById.set(String(r.id), r)
  }

  // Összegyűjtjük az Excel-ben szereplő _rowId-kat, hogy később megtaláljuk a "deleted"-eket
  const excelRowIds = new Set<string>()

  const added: RowDiff[] = []
  const updated: RowDiff[] = []
  const deleted: RowDiff[] = []
  let unchangedCount = 0
  let conflictCount = 0
  const warnings: string[] = []

  // ─────────────────────────────────────────────────────────────
  // BIZTONSÁGI CHECK: a user szándékosan vagy véletlenül törölte-e a _rowId oszlopot?
  // ─────────────────────────────────────────────────────────────
  // Ha a sheetben sok sor van (pl. 50+), és MINDEN sor _rowId-ja üres,
  // a user valószínűleg a meta oszlopot törölte. Ekkor minden sort új-ként
  // kezelnénk → bulk duplikáció a Supabase-ben. STOP: abort-olunk és
  // warning-ot adunk, NEM csinálunk diff-et.
  const totalExcelRows = parsedSheet.rows.length
  const rowsWithoutRowId = parsedSheet.rows.filter(r => !r.rowId).length
  // Ha a Dexie-ben is vannak rekordok (tehát "nem üres" tábla), és az Excel-
  // sorok nagy része (>70%) rowId nélkül van, az meta-oszlop-törlést jelöl
  if (
    totalExcelRows >= 3 &&
    dexieById.size >= 3 &&
    rowsWithoutRowId / totalExcelRows > 0.7
  ) {
    warnings.push(
      `Biztonsági leállítás: a ${parsedSheet.sheetName} lap sorainak ` +
        `${Math.round((rowsWithoutRowId / totalExcelRows) * 100)}%-án ` +
        `hiányzik a _rowId (${rowsWithoutRowId}/${totalExcelRows}). ` +
        `Valószínűleg a rejtett meta-oszlopot (_rowId) törölted vagy áthelyezted. ` +
        `Állítsd vissza a Ctrl+Z-vel, vagy írd vissza a _rowId oszlopot, ` +
        `különben duplikált rekordokat hoznánk létre a szerveren.`,
    )
    return {
      sheetName: sheetDef.sheetName,
      dexieTable: sheetDef.dexieTable,
      added: [],
      updated: [],
      deleted: [],
      unchangedCount: 0,
      conflictCount: 0,
      warnings,
    }
  }

  // Excel sorokon végigmegyünk
  for (const excelRow of parsedSheet.rows) {
    const rowId = excelRow.rowId
    if (rowId) excelRowIds.add(rowId)

    // Label a sorhoz (display)
    const excelLabel = buildDisplayLabel(excelRow.values, sheetDef)

    if (!rowId) {
      // Új sor (_rowId üres vagy nincs)
      added.push({
        kind: 'added',
        dexieTable: sheetDef.dexieTable,
        rowId: null,
        excelRow,
        fieldDiffs: [],
        hasConflict: false,
        displayLabel: excelLabel,
      })
      continue
    }

    // Létező sor — összehasonlítjuk a Dexie állapottal
    const dexieRecord = dexieById.get(rowId)
    if (!dexieRecord) {
      // Az Excel-ben van _rowId, de a Dexie-ben nincs — akkor a user valószínűleg
      // még a szerver-pull előtt importálja, VAGY közben a szerveren törölték.
      // A biztonságért ezt nem-módosítjuk — warning + csendes kihagyás.
      warnings.push(
        `Sor ${excelRow.excelRowIndex}: a _rowId="${rowId}" nem található a helyi cache-ben. Lehet, hogy közben törölték. Kihagyva.`,
      )
      continue
    }

    // Konfliktus detektálás: ha az Excel revision ≠ Dexie revision, közben változott
    const currentDexieRevision = (dexieRecord.revision as number) || 0
    const hasConflict =
      excelRow.revision !== 0 && excelRow.revision !== currentDexieRevision

    const fieldDiffs = computeFieldDiffs(excelRow.values, dexieRecord, sheetDef)

    if (fieldDiffs.length === 0 && !hasConflict) {
      unchangedCount += 1
      continue
    }

    const diff: RowDiff = {
      kind: fieldDiffs.length > 0 ? 'updated' : 'unchanged',
      dexieTable: sheetDef.dexieTable,
      rowId,
      excelRow,
      dexieRecord,
      fieldDiffs,
      hasConflict,
      displayLabel: buildDisplayLabel(dexieRecord, sheetDef) || excelLabel,
    }

    if (fieldDiffs.length > 0) updated.push(diff)
    if (hasConflict) conflictCount += 1
  }

  // Deleted rows: a Dexie-ben volt, de az Excel-ben NINCS
  for (const [rowId, dexieRecord] of dexieById.entries()) {
    if (excelRowIds.has(rowId)) continue
    // Ha a Dexie-ben `_syncStatus === 'pending'` vagy 'deleting', kihagyjuk (még nem kell törölni)
    const status = dexieRecord._syncStatus as string | undefined
    if (status === 'pending' || status === 'deleting') continue

    deleted.push({
      kind: 'deleted',
      dexieTable: sheetDef.dexieTable,
      rowId,
      dexieRecord,
      fieldDiffs: [],
      hasConflict: false,
      displayLabel: buildDisplayLabel(dexieRecord, sheetDef),
    })
  }

  return {
    sheetName: sheetDef.sheetName,
    dexieTable: sheetDef.dexieTable,
    added,
    updated,
    deleted,
    unchangedCount,
    conflictCount,
    warnings,
  }
}

// ─────────────────────────────────────────────────────────────────
// Fő belépési pont
// ─────────────────────────────────────────────────────────────────

export async function computeModuleDiff(
  parsedWorkbook: ParsedWorkbookData,
  schema: { sheets: ExcelSheetDef[]; module: string },
  congregationId: string,
): Promise<ModuleDiff> {
  const sheets: SheetDiff[] = []
  let totalChanges = 0
  let totalConflicts = 0

  for (const sheetDef of schema.sheets) {
    const parsedSheet = parsedWorkbook.sheets.find(
      s => s.dexieTable === sheetDef.dexieTable,
    )
    if (!parsedSheet) continue

    const diff = await computeSheetDiff(parsedSheet, sheetDef, congregationId)
    sheets.push(diff)
    totalChanges += diff.added.length + diff.updated.length + diff.deleted.length
    totalConflicts += diff.conflictCount
  }

  return {
    module: schema.module,
    sheets,
    totalChanges,
    totalConflicts,
    warnings: [...parsedWorkbook.warnings],
  }
}
