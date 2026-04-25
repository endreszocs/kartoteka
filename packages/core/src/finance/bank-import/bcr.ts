/**
 * BCR (Banca Comercială Română) bank-export parser — A-M7.10a (2026-04-25).
 *
 * A web-oldali `apps/web/lib/finance/bank-import/bcr-parser.ts` portja a core-ba.
 * Az xlsx-handling a core-on belül történik (egyetlen `xlsx` dependency a
 * package.json-ban). A `parseBcrExcel(buffer)` ArrayBuffer / Uint8Array
 * inputot fogad — mind a browser File API (`file.arrayBuffer()`), mind a Tauri
 * `readFile` (Uint8Array) kompatibilis.
 *
 * Formátum-rugalmasság: a BCR export több formátumban jöhet (régebbi/újabb
 * verziók); fuzzy column-matching a tipikus román/angol oszlopnevekre.
 *
 * Lásd a webapp implementáció részletes logikai dokumentációját — az ott
 * leírt heuristikák (Excel Date torzítás, M/D/YY ambiguity, Suma iesire/intrare
 * előjel-jelzés) pontosan ugyanúgy maradnak.
 */

import * as XLSX from 'xlsx'

import type { BankParseResult, BankTransaction } from '@kartoteka/validations'

// ─────────────────────────────────────────────────────────────
// Oszlop-felismerés
// ─────────────────────────────────────────────────────────────

const COLUMN_PATTERNS: Record<string, RegExp[]> = {
  date: [
    /^data\s*tranz/i,
    /^data\s*in?reg/i, // Data inregistrarii — BCR fő export
    /^transaction\s*date/i,
    /^data\s*opera/i,
    /^data$/i,
    /^date$/i,
  ],
  valueDate: [/^data\s*valut/i, /^value\s*date/i],
  description: [
    /^descrierea/i,
    /^descriere/i,
    /^descri/i,
    /^description/i,
    /^detalii\s*tranz/i,
    /^explicatii/i,
    /^memoriu/i,
  ],
  reference: [
    /^referinta/i, // Referinta tranzactiei — BCR
    /^reference/i,
    /^nr\.\s*document/i,
    /^nr\.\s*ref/i,
  ],
  debit: [
    /^suma\s*iesire/i, // Suma iesire — BCR (PRIORITÁS)
    /^valoare\s*debit/i,
    /^suma\s*debit/i,
    /^debit/i,
    /^iesire/i,
    /^plata/i,
  ],
  credit: [
    /^suma\s*intrare/i, // Suma intrare — BCR (PRIORITÁS)
    /^valoare\s*credit/i,
    /^suma\s*credit/i,
    /^credit/i,
    /^intrare/i,
    /^incasare/i,
  ],
  amount: [/^valoare$/i, /^amount/i, /^osszeg/i, /^suma$/i],
  balance: [/^sold/i, /^balance/i, /^egyenleg/i],
  counterparty: [
    /^nume\s*partener/i, // Nume partener — BCR
    /^beneficiar/i,
    /^platitor/i,
    /^ordonator/i,
    /^contraparte/i,
    /^nume/i,
  ],
}

function matchColumn(header: string): string | null {
  const h = header.trim()
  for (const [key, patterns] of Object.entries(COLUMN_PATTERNS)) {
    if (patterns.some((p) => p.test(h))) return key
  }
  return null
}

// ─────────────────────────────────────────────────────────────
// Érték-parsolás
// ─────────────────────────────────────────────────────────────

function expandYear(yy: string): string {
  if (yy.length === 4) return yy
  const n = Number(yy)
  if (!Number.isFinite(n)) return yy
  return n < 30 ? String(2000 + n) : String(1900 + n)
}

function parseDateValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    const d = value
    const localY = d.getFullYear()
    const localM = d.getMonth() + 1
    const localD = d.getDate()
    const utcY = d.getUTCFullYear()
    const utcM = d.getUTCMonth() + 1
    const utcD = d.getUTCDate()
    const useUtc = d.getUTCHours() < 12
    const [y, m, day] = useUtc ? [utcY, utcM, utcD] : [localY, localM, localD]
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  if (typeof value === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(epoch.getTime() + value * 86_400_000)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  if (typeof value !== 'string') return null
  const s = value.trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const euMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
  if (euMatch) {
    const [, a, b, y] = euMatch
    const year = expandYear(y)
    const aN = Number(a)
    const bN = Number(b)
    if (aN > 12 && bN <= 12) {
      // EU: a = nap, b = hónap
      return `${year}-${String(bN).padStart(2, '0')}-${String(aN).padStart(2, '0')}`
    }
    if (bN > 12 && aN <= 12) {
      // US: a = hónap, b = nap
      return `${year}-${String(aN).padStart(2, '0')}-${String(bN).padStart(2, '0')}`
    }
    // Mindkettő <= 12 → BCR US-formátumot használ ("1/6/26" = jan 6, 2026)
    return `${year}-${String(aN).padStart(2, '0')}-${String(bN).padStart(2, '0')}`
  }
  return null
}

function parseAmountValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return null
  if (typeof value !== 'string') return null
  let s = value.trim()
  if (!s) return null
  let negative = false
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1).trim()
  } else if (s.startsWith('(') && s.endsWith(')')) {
    negative = true
    s = s.slice(1, -1).trim()
  }
  let normalized: string
  if (s.includes(',') && s.includes('.')) {
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    if (lastComma > lastDot) {
      // RO: 1.234,56
      normalized = s.replace(/\./g, '').replace(',', '.')
    } else {
      // US: 1,234.56
      normalized = s.replace(/,/g, '')
    }
  } else if (s.includes(',')) {
    normalized = s.replace(',', '.')
  } else {
    normalized = s
  }
  const n = Number.parseFloat(normalized)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

// ─────────────────────────────────────────────────────────────
// Fő parse függvény
// ─────────────────────────────────────────────────────────────

/**
 * BCR bank-export Excel fájl értelmezése.
 *
 * Inputként ArrayBuffer vagy Uint8Array — mindkét böngésző-File és
 * Tauri-readFile vissza-output-jával működik.
 *
 * Az `xlsx` library belső zip-warning-ok ("Bad uncompressed size:") elnyelve
 * — a BCR ZIP-formátum specifikus, az adat helyes.
 */
export function parseBcrExcel(buffer: ArrayBuffer | Uint8Array): BankParseResult {
  const result: BankParseResult = {
    transactions: [],
    detectedHeaders: {},
    error: null,
  }

  try {
    // BCR-specifikus zlib warning kiszűrése (a Next.js console-error suppression
    // mintája szerint, ami a webapp-ban jól működött).
    const originalConsoleError = console.error
    console.error = (...args: unknown[]) => {
      const first = args[0]
      if (typeof first === 'string' && first.startsWith('Bad uncompressed size:')) {
        return
      }
      originalConsoleError(...args)
    }
    let workbook: ReturnType<typeof XLSX.read>
    try {
      workbook = XLSX.read(buffer, { cellDates: true })
    } finally {
      console.error = originalConsoleError
    }
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      result.error = 'Az Excel fájl üres (nincs benne munkalap).'
      return result
    }
    const sheet = workbook.Sheets[firstSheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    })

    if (rows.length === 0) {
      result.error = 'Az Excel első munkalapja üres.'
      return result
    }

    // Fejléc-keresés: az első sor, amiben 3+ ismert oszlop van
    let headerRowIdx = -1
    const headerMap: Record<string, number> = {}
    for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
      const row = rows[i]
      if (!Array.isArray(row)) continue
      const temp: Record<string, number> = {}
      for (let col = 0; col < row.length; col += 1) {
        const raw = row[col]
        if (raw === null || raw === undefined) continue
        const cell = String(raw).trim()
        if (!cell) continue
        const key = matchColumn(cell)
        if (key && !(key in temp)) {
          temp[key] = col
          result.detectedHeaders[key] = cell
        }
      }
      if (Object.keys(temp).length >= 3) {
        headerRowIdx = i
        Object.assign(headerMap, temp)
        break
      }
    }

    if (headerRowIdx < 0) {
      result.error =
        'Nem találtunk fejléc sort a fájlban. A BCR Excel exportnak tartalmaznia kell: dátum, leírás, és összeg (vagy debit/credit) oszlopokat.'
      return result
    }

    if (headerMap.date === undefined) {
      result.error =
        'Nincs dátum oszlop. A BCR fájlban legyen „Data tranzacției" vagy hasonló oszlop.'
      return result
    }

    const hasAmount = headerMap.amount !== undefined
    const hasDebitCredit = headerMap.debit !== undefined || headerMap.credit !== undefined
    if (!hasAmount && !hasDebitCredit) {
      result.error =
        'Nincs összeg oszlop. A BCR fájlban legyen „Debit" + „Credit" vagy „Suma" oszlop.'
      return result
    }

    for (let i = headerRowIdx + 1; i < rows.length; i += 1) {
      const row = rows[i]
      if (!Array.isArray(row)) continue
      const dateCell = row[headerMap.date]
      const date = parseDateValue(dateCell)
      if (!date) continue

      const description =
        headerMap.description !== undefined
          ? String(row[headerMap.description] ?? '').trim()
          : ''

      let amount: number | null = null
      if (hasAmount) {
        amount = parseAmountValue(row[headerMap.amount])
      } else {
        const debit =
          headerMap.debit !== undefined ? parseAmountValue(row[headerMap.debit]) : null
        const credit =
          headerMap.credit !== undefined ? parseAmountValue(row[headerMap.credit]) : null
        if (credit !== null && credit !== 0) amount = Math.abs(credit)
        else if (debit !== null && debit !== 0) amount = -Math.abs(debit)
      }

      if (amount === null || amount === 0) continue

      const finalDescription = description || `Tranzakció ${date}`
      const balance =
        headerMap.balance !== undefined
          ? parseAmountValue(row[headerMap.balance]) ?? null
          : null
      const reference =
        headerMap.reference !== undefined
          ? String(row[headerMap.reference] ?? '').trim() || null
          : null
      const counterparty =
        headerMap.counterparty !== undefined
          ? String(row[headerMap.counterparty] ?? '').trim() || null
          : null

      const tx: BankTransaction = {
        rowIndex: i + 1,
        date,
        description: finalDescription,
        reference,
        amount,
        balance,
        counterparty,
      }
      result.transactions.push(tx)
    }

    if (result.transactions.length === 0) {
      result.error =
        'Nem találtunk tranzakciót a fájlban. Ellenőrizd, hogy a fejléc-sor alatt vannak-e dátum + összeg adatok.'
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e)
  }

  return result
}
