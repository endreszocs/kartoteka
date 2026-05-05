/**
 * xlsx (Adatok_YYYY.xlsx) Kassza-sheet Egyházfenntartás-szűrő.
 *
 * 2026-05-06 — egyházfenntartás-import wizardhoz.
 *
 * A bejövő xlsx több sheettel jön: Monetar, Kassza, Kasszakonyv, A, B, C, D, E, F,
 * Hibak, Szamadas, Koltsegvetes. A `Kassza` (RON-kassza) sheet a fő bevétel-kiadás
 * nyilvántartás.
 *
 * A Kassza-sheet oszlop-szerkezete (header a sor 5-ben, 0-indexelt):
 *   - col 2  → Dátum
 *   - col 4  → Iratszám (1-329, sorszám)
 *   - col 5  → Irattíp. (pl. "Chit." = chitanta)
 *   - col 6  → Név (TELJES formátum: "Beder Árpád - Főút 85")
 *   - col 7  → Bev. Összeg
 *   - col 8  → Bev. - Költ.vet. név (pl. "Egyházfenntartói járulék")
 *   - col 9  → Kiad. Összeg
 *   - col 10 → Kiad. - költ.vet. név
 *   - col 11 → Megjegyzés
 *   - col 12 → Magyarázat (román)
 *   - col 13 → Költségvetési szám (pl. "101.01" — POINT formátum)
 *
 * Csak az Egyházfenntartói járulék sorokat szűrjük ki (col 8 == "Egyházfenntartói járulék").
 */

import * as XLSX from 'xlsx'

export interface XlsxEgyhfRow {
  /** Sor a fájlban (1-indexelt, debugging-hoz) */
  rowIndex: number
  /** Eredeti, parsolatlan név-string (pl. "Beder Árpád - Főút 85") */
  rawName: string
  /** Iratszám (kassza-sorszám, pl. 25) — kulcs az xml.Nyugta-val való párosításhoz */
  iratszam: number | null
  /** Irattípus (pl. "Chit." → "chitanta") */
  irattipus: string | null
  /** ISO-dátum (YYYY-MM-DD) */
  datum: string
  /** Bevétel összege (RON) */
  osszeg: number
  /** Költségvetési kód (xlsx-ben "101.01") */
  ksz: string | null
  /** Megjegyzés mező (általában üres a Kassza-sheet-ben) */
  megjegyzes: string | null
}

export interface XlsxEgyhfParseResult {
  /** Az "Egyházfenntartói járulék" cél kategóriájú bevétel-sorok */
  rows: XlsxEgyhfRow[]
  /** Auto-detektált év (az első sor dátumából) — manual override lehetséges */
  detectedYear: number | null
  /** Sheet neve, amit használtunk */
  sheetName: string
  /** Total Egyházfenntartás-soron (validáció a UI-ban) */
  totalAmount: number
  /** Hibák / figyelmeztetések */
  warnings: string[]
}

const EGYHF_KATEGORIA_KEYWORD = 'egyházfenntart'

/**
 * Megnyitja az xlsx-fájlt és kiszűri az Egyházfenntartói járulék sorokat
 * a Kassza-sheetből.
 */
export async function parseXlsxEgyhf(
  fileBuffer: ArrayBuffer | Uint8Array,
): Promise<XlsxEgyhfParseResult> {
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true })

  // 1) Kassza-sheet megkeresése (case-insensitive)
  const kasszaName = workbook.SheetNames.find(
    s => s.toLowerCase() === 'kassza',
  )
  if (!kasszaName) {
    throw new Error(
      'A fájlban nincs "Kassza" nevű munkalap — ez kötelező az egyházfenntartás-importhoz.',
    )
  }

  const sheet = workbook.Sheets[kasszaName]
  // sheet → 2D array (header: false → minden sor as raw array)
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  })

  if (rawRows.length < 6) {
    throw new Error('A Kassza-sheet túl rövid (kevesebb mint 6 sor) — biztos hogy a megfelelő fájlt töltötted fel?')
  }

  const warnings: string[] = []
  const result: XlsxEgyhfRow[] = []
  let totalAmount = 0
  let detectedYear: number | null = null

  // Header sor: 5. (0-indexed: 4). Adat sorok: 6+ (0-indexed: 5+)
  for (let i = 5; i < rawRows.length; i++) {
    const row = rawRows[i]
    if (!Array.isArray(row)) continue

    // Bev. - Költ.vet. név (col 8) — ez a kategória
    const kategoria = row[8]
    if (typeof kategoria !== 'string') continue
    if (!kategoria.toLowerCase().includes(EGYHF_KATEGORIA_KEYWORD)) continue

    // Bev. összeg (col 7) — kell hogy ki legyen töltve
    const osszegRaw = row[7]
    const osszeg = parseAmount(osszegRaw)
    if (osszeg === null || osszeg <= 0) {
      warnings.push(
        `Sor ${i + 1}: "${kategoria}" kategória, de az összeg üres vagy 0 — kihagyva.`,
      )
      continue
    }

    // Dátum (col 2)
    const datumRaw = row[2]
    const datum = parseDateToISO(datumRaw)
    if (!datum) {
      warnings.push(
        `Sor ${i + 1}: érvénytelen dátum — kihagyva.`,
      )
      continue
    }

    // Auto-detect év az első érvényes sor dátumából
    if (detectedYear === null) {
      detectedYear = parseInt(datum.slice(0, 4), 10) || null
    }

    // Iratszám (col 4)
    const iratszamRaw = row[4]
    const iratszam = parseInteger(iratszamRaw)

    // Irattípus (col 5)
    const irattipusRaw = row[5]
    const irattipus =
      typeof irattipusRaw === 'string'
        ? normalizeIrattipus(irattipusRaw)
        : null

    // Név (col 6) — kötelező
    const nameRaw = row[6]
    if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
      warnings.push(
        `Sor ${i + 1}: hiányzó név — kihagyva.`,
      )
      continue
    }

    // Költségvetési szám (col 13)
    const kszRaw = row[13]
    const ksz = typeof kszRaw === 'string' ? kszRaw.trim() : kszRaw != null ? String(kszRaw) : null

    // Megjegyzés (col 11)
    const megj = typeof row[11] === 'string' ? (row[11] as string).trim() || null : null

    result.push({
      rowIndex: i + 1,
      rawName: nameRaw.trim(),
      iratszam,
      irattipus,
      datum,
      osszeg,
      ksz,
      megjegyzes: megj,
    })
    totalAmount += osszeg
  }

  if (result.length === 0) {
    warnings.push(
      'A Kassza-sheetben nem találtunk Egyházfenntartói járulék sorokat — biztos hogy a megfelelő fájlt töltötted fel?',
    )
  }

  return {
    rows: result,
    detectedYear,
    sheetName: kasszaName,
    totalAmount,
    warnings,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
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
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    // ISO format detect (2025-01-08T00:00:00 vagy 2025-01-08)
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
    // YYYY/MM/DD
    const slashMatch = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})/)
    if (slashMatch) return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`
    // DD.MM.YYYY
    const huMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
    if (huMatch) return `${huMatch[3]}-${huMatch[2]}-${huMatch[1]}`
  }
  if (typeof value === 'number') {
    // Excel serial date (days since 1900-01-01)
    const d = XLSX.SSF.parse_date_code(value)
    if (d) {
      const yyyy = String(d.y).padStart(4, '0')
      const mm = String(d.m).padStart(2, '0')
      const dd = String(d.d).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    }
  }
  return null
}

function normalizeIrattipus(value: string): string {
  const lower = value.toLowerCase().trim()
  if (lower.startsWith('chit')) return 'chitanta'
  if (lower.startsWith('nyugta')) return 'nyugta'
  if (lower.startsWith('fact')) return 'factura'
  return lower
}
