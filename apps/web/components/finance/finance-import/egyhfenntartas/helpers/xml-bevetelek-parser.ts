/**
 * Microsoft Excel 2003 XML formátumú bevételek-fájl parser.
 *
 * 2026-05-06 — egyházfenntartás-import wizardhoz.
 *
 * A `bevételek YYYY.xml` egy 14 oszlopos lista, amit a felhasználó az
 * éves bevételei mellett vezetett külön. Mezői:
 *   col 0  — Forrása (pl. "Beder Árpád - Főút 85")
 *   col 1  — Célja (pl. "Egyházfenntartói járulék")
 *   col 2  — Összeg (RON)
 *   col 3  — Év (a könyvelési év)
 *   col 4  — Hó
 *   col 5  — Nap
 *   col 6  — Dátum (ISO)
 *   col 7  — Nyugta (1-329 sorszám) ← kulcs az xlsx.Iratszam-mal párosításhoz
 *   col 8  — Iratszám (5 jegyű, hivatalos pl. 115329)
 *   col 9  — Irattípus (pl. "nyugta")
 *   col 10 — KöltsSzám (pl. "101,01" — VESSZŐ formátum, konvertálni kell pontra)
 *   col 11 — Befizetett év (kulcsfontosságú a tartozás-számításhoz)
 *   col 12 — Megjegyzés
 *   col 13 — Létrehozva (rögzítés időpontja)
 *
 * Az `xlsx` library támogatja a Microsoft 2003 XML formátumot is (XMLSpreadsheet).
 * Csak az "Egyházfenntartói járulék" cél kategóriájú sorok kerülnek a result-ba.
 */

import * as XLSX from 'xlsx'
import { toLocalIsoDate } from '@/lib/import/date-utils'

export interface XmlBevetelekRow {
  /** Sor a fájlban (1-indexelt, debugging-hoz; az adat 1-től indul a header-en kívül) */
  rowIndex: number
  /** Eredeti, parsolatlan név-string (pl. "Beder Árpád - Főút 85") */
  rawForrasa: string
  /** Összeg (RON) */
  osszeg: number
  /** ISO-dátum (YYYY-MM-DD) */
  datum: string
  /** Nyugta-szám (1-329 sorszám) — ez egyezik az xlsx.Iratszam-mal */
  nyugta: number | null
  /** 5 jegyű hivatalos iratszám (pl. 115329) */
  iratszam: number | null
  /** Irattípus normalizálva ("nyugta" / "chitanta" / "factura") */
  irattipus: string | null
  /** Költségvetési kód, pont-formátumra konvertálva (pl. "101.01") */
  ksz: string | null
  /** Befizetett év — melyik évre szól a befizetés (lehet eltérő az év mezőtől) */
  fizetettev: number | null
  /** Megjegyzés (pl. "Karácsonyi csomagok") */
  megjegyzes: string | null
  /** Rögzítés időpontja (ISO datetime) */
  letrehozva: string | null
}

export interface XmlBevetelekParseResult {
  rows: XmlBevetelekRow[]
  detectedYear: number | null
  totalAmount: number
  warnings: string[]
}

const EGYHF_KATEGORIA_KEYWORD = 'egyházfenntart'

export async function parseXmlBevetelek(
  fileBuffer: ArrayBuffer | Uint8Array,
): Promise<XmlBevetelekParseResult> {
  // Az XLSX library képes a Microsoft Excel 2003 XML (SpreadsheetML) formátumot olvasni.
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true })

  if (workbook.SheetNames.length === 0) {
    throw new Error('Az XML-fájl üres vagy érvénytelen.')
  }

  // Az első sheet-et használjuk (általában "Sheet1")
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  })

  if (rawRows.length < 2) {
    throw new Error('Az XML-fájlban nincs adat (csak a fejléc).')
  }

  // Header validáció (sor 0)
  const header = rawRows[0]
  if (!Array.isArray(header) || header[0] !== 'Forrása' || header[1] !== 'Célja') {
    throw new Error(
      'Az XML-fájl szerkezete nem felel meg a várt formátumnak. Várt fejléc: Forrása, Célja, Összeg, ...',
    )
  }

  const warnings: string[] = []
  const result: XmlBevetelekRow[] = []
  let totalAmount = 0
  let detectedYear: number | null = null

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i]
    if (!Array.isArray(row)) continue

    // Célja (col 1) — kategória szűrés
    const celja = row[1]
    if (typeof celja !== 'string') continue
    if (!celja.toLowerCase().includes(EGYHF_KATEGORIA_KEYWORD)) continue

    // Forrása (col 0) — kötelező
    const forrasa = row[0]
    if (typeof forrasa !== 'string' || !forrasa.trim()) {
      warnings.push(`XML sor ${i + 1}: hiányzó "Forrása" — kihagyva.`)
      continue
    }

    // Összeg (col 2) — kötelező
    const osszeg = parseAmount(row[2])
    if (osszeg === null || osszeg <= 0) {
      warnings.push(`XML sor ${i + 1}: érvénytelen összeg — kihagyva.`)
      continue
    }

    // Dátum (col 6)
    const datum = parseDateToISO(row[6])
    if (!datum) {
      warnings.push(`XML sor ${i + 1}: érvénytelen dátum — kihagyva.`)
      continue
    }

    if (detectedYear === null) {
      detectedYear = parseInt(datum.slice(0, 4), 10) || null
    }

    const nyugta = parseInteger(row[7])
    const iratszam = parseInteger(row[8])
    const irattipusRaw = row[9]
    const irattipus =
      typeof irattipusRaw === 'string' ? normalizeIrattipus(irattipusRaw) : null

    // Költségvetési kód: vessző → pont konverzió
    const kszRaw = row[10]
    const ksz =
      typeof kszRaw === 'string'
        ? kszRaw.trim().replace(',', '.')
        : kszRaw != null
          ? String(kszRaw).replace(',', '.')
          : null

    const fizetettev = parseInteger(row[11])
    const megj = typeof row[12] === 'string' ? (row[12] as string).trim() || null : null
    const letrehozva = typeof row[13] === 'string' ? (row[13] as string) : null

    result.push({
      rowIndex: i + 1,
      rawForrasa: forrasa.trim(),
      osszeg,
      datum,
      nyugta,
      iratszam,
      irattipus,
      ksz,
      fizetettev,
      megjegyzes: megj,
      letrehozva,
    })
    totalAmount += osszeg
  }

  return {
    rows: result,
    detectedYear,
    totalAmount,
    warnings,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers — itt is, mert a két parser-fájl független (no shared module)
// ──────────────────────────────────────────────────────────────────────

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/\s/g, '').replace(',', '.')
    const num = parseFloat(trimmed)
    return Number.isFinite(num) ? num : null
  }
  return null
}

function parseInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const n = parseInt(trimmed, 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parseDateToISO(value: unknown): string | null {
  // Időzóna-biztos, többformátumú normalizálás a megosztott helperben
  // (Date helyi-komponens, Excel-serial UTC-epoch, ISO/magyar string).
  return toLocalIsoDate(value)
}

function normalizeIrattipus(value: string): string {
  const lower = value.toLowerCase().trim()
  if (lower.startsWith('chit')) return 'chitanta'
  if (lower.startsWith('nyugta')) return 'nyugta'
  if (lower.startsWith('fact')) return 'factura'
  return lower
}
