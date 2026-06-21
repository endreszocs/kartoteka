'use client'

/**
 * BCR (Banca Comercială Română) Excel import parser.
 *
 * A BCR-ből exportált Excel fájlok több formátumban jöhetnek (régebbi/újabb
 * export verziók). Rugalmasan felismerjük a tipikus oszlopneveket:
 *   - Dátum: `Data tranzacției`, `Transaction date`, `Data`
 *   - Leírás: `Descriere`, `Description`, `Detalii tranzacție`
 *   - Terhelés: `Debit`, `Valoare debit`, `Sumă debit`
 *   - Jóváírás: `Credit`, `Valoare credit`, `Sumă credit`
 *   - Egyenleg: `Sold`, `Balance`
 *
 * A kiszélesedett formátumokhoz fuzzy matchinget használunk.
 */

import { dateToLocalIso } from '@/lib/import/date-utils'

export type BcrTransaction = {
  /** Az Excel sor indexe (1-től). */
  rowIndex: number
  /** Tranzakció dátuma (YYYY-MM-DD). */
  date: string
  /** Leírás — amit a bank küldött. */
  description: string
  /** Referencia (opcionális). */
  reference?: string
  /** Összeg — ELŐJELESEN:
   *   > 0 = jóváírás (bevétel a bankba)
   *   < 0 = terhelés (kiadás a bankból)
   */
  amount: number
  /** Egyenleg a tranzakció után (opcionális). */
  balance?: number
  /** Kedvezményezett / küldő (ha kiolvasható). */
  counterparty?: string
}

export type BcrParseResult = {
  transactions: BcrTransaction[]
  /** A fájlban felismert oszlopfejlécek (debug). */
  detectedHeaders: Record<string, string>
  /** Hibaüzenet, ha a parse sikertelen. */
  error: string | null
}

// ─────────────────────────────────────────────────────────────
// Oszlop-felismerés: mit hol keresünk
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
    /^descrierea/i, // Descrierea tranzactiei — BCR
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
    /^suma\s*iesire/i, // Suma iesire — BCR (PRIORITÁS: a `suma` előtt)
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
  // Általános "amount" fallback — CSAK ha nincs külön debit/credit
  amount: [/^valoare$/i, /^amount/i, /^osszeg/i, /^suma$/i],
  balance: [/^sold/i, /^balance/i, /^egyenleg/i],
  counterparty: [
    /^nume\s*partener/i, // Nume partener — BCR (PRIORITÁS)
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

/**
 * 2 jegyű év kiegészítése 4 jegyűre.
 * < 30 → 20xx (pl. 26 → 2026)
 * >= 30 → 19xx (pl. 99 → 1999)
 * Az Excel default pivot éve is ez, és bankok sosem használnak 1930 előtti dátumot.
 */
function expandYear(yy: string): string {
  if (yy.length === 4) return yy
  const n = Number(yy)
  if (!Number.isFinite(n)) return yy
  return n < 30 ? String(2000 + n) : String(1900 + n)
}

function parseDateValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  // Excel dátum: lehet Date objektum (ha xlsx cellDates: true), vagy string
  if (value instanceof Date) {
    // A SheetJS cellDates Date-je dátum-cellánál pozitív időzónában egy nappal
    // korábbra csúszik (≈23:59:36); a megosztott helper a legközelebbi helyi naphoz
    // kerekít, így minden időzónában (UTC és UTC+2/+3) a helyes napot adja.
    return dateToLocalIso(value)
  }
  if (typeof value === 'number') {
    // Excel serial szám
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(epoch.getTime() + value * 86_400_000)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  if (typeof value !== 'string') return null
  const s = value.trim()
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // DD.MM.YYYY / DD/MM/YYYY / DD.MM.YY / DD/MM/YY (4 vagy 2 jegyű év)
  // BCR export tipikus formátum: "1/6/26" vagy "01.06.2026"
  const euMatch = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/)
  if (euMatch) {
    const [, a, b, y] = euMatch
    const year = expandYear(y)
    // EU formátum: DD.MM.YYYY (a = nap, b = hónap)
    // A BCR export sok esetben M/D/YY (US-szerűen formázott) — ha a > 12, biztosan nap,
    // ha b > 12, biztosan hónap (US). Heurisztika:
    const aN = Number(a)
    const bN = Number(b)
    if (aN > 12 && bN <= 12) {
      // a = nap, b = hónap (EU)
      return `${year}-${String(bN).padStart(2, '0')}-${String(aN).padStart(2, '0')}`
    }
    if (bN > 12 && aN <= 12) {
      // a = hónap, b = nap (US)
      return `${year}-${String(aN).padStart(2, '0')}-${String(bN).padStart(2, '0')}`
    }
    // Mindkettő <= 12 — ambiguity. BCR valódi exportja M/D/YY formában jön
    // (Excel US locale-ban írja ki). Alapértelmezetten US-t preferáljuk, mert
    // a BCR a tényleges fájlban M/D/YY-t használ (pl. „1/6/26" = január 6, 2026).
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
  // Negatív: `-123,45` vagy `(123,45)`
  let negative = false
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1).trim()
  } else if (s.startsWith('(') && s.endsWith(')')) {
    negative = true
    s = s.slice(1, -1).trim()
  }
  // Román formátum: `1.234,56` vagy angol `1,234.56`
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
  const n = parseFloat(normalized)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

// ─────────────────────────────────────────────────────────────
// Fő parse függvény
// ─────────────────────────────────────────────────────────────

export async function parseBcrExcel(file: File): Promise<BcrParseResult> {
  const result: BcrParseResult = {
    transactions: [],
    detectedHeaders: {},
    error: null,
  }

  try {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    // FONTOS: `cellDates: true` + `raw: true` → a cellák natív típusban érkeznek
    // (Date objektumok, számok). A `raw: false` a BCR export "1/6/26" formában
    // jeleníti meg a dátumokat, ami ambiguous (jan 6 vagy jún 1?).
    //
    // A BCR Excel export egy speciálisan alakított ZIP — az xlsx library belső
    // zip olvasója figyelmeztet ("Bad uncompressed size: X != 0") minden ilyen
    // bejegyzésnél. A figyelmeztetés NEM hiba (az adat helyesen jön), de a
    // Next.js dev konzol ezeket error-ként kijelzi. Kiszűrjük őket a parse-olás
    // idejére — de csak a pontos mintát ("Bad uncompressed size:"), hogy más
    // hibaüzenetek átmenjenek.
    const originalConsoleError = console.error
    console.error = (...args: unknown[]) => {
      const first = args[0]
      if (typeof first === 'string' && first.startsWith('Bad uncompressed size:')) {
        return // csendesen elnyeljük
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
    // Sorokat kapunk tömbként: `sheet_to_json(sheet, { header: 1 })`
    // raw:true → Date és number natívan érkezik, nem string formátumként
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    })

    if (rows.length === 0) {
      result.error = 'Az Excel első munkalapja üres.'
      return result
    }

    // Keressük meg a fejléc sort — az első olyan sor, amiben 3+ ismert oszlop van
    let headerRowIdx = -1
    const headerMap: Record<string, number> = {}
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const row = rows[i]
      if (!Array.isArray(row)) continue
      const temp: Record<string, number> = {}
      for (let col = 0; col < row.length; col++) {
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
      const knownCount = Object.keys(temp).length
      if (knownCount >= 3) {
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

    // Dátum oszlop kötelező
    if (headerMap.date === undefined) {
      result.error =
        'Nincs dátum oszlop. A BCR fájlban legyen „Data tranzacției" vagy hasonló oszlop.'
      return result
    }

    // Összeg: vagy `amount` (előjeles), vagy `debit` + `credit` külön
    const hasAmount = headerMap.amount !== undefined
    const hasDebitCredit = headerMap.debit !== undefined || headerMap.credit !== undefined
    if (!hasAmount && !hasDebitCredit) {
      result.error =
        'Nincs összeg oszlop. A BCR fájlban legyen „Debit" + „Credit" vagy „Suma" oszlop.'
      return result
    }

    // Parsolás
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!Array.isArray(row)) continue
      const dateCell = row[headerMap.date]
      const date = parseDateValue(dateCell)
      if (!date) continue // üres sor vagy olyan sor, ami nem tranzakció (pl. összegző)

      // Leírás: ha nincs description oszlop a fejlécben, használjuk az üres stringet
      // — bizonyos BCR exportokban a leírás hiányozhat, de a dátum + összeg elég.
      const description =
        headerMap.description !== undefined
          ? String(row[headerMap.description] ?? '').trim()
          : ''

      let amount: number | null = null
      if (hasAmount) {
        amount = parseAmountValue(row[headerMap.amount!])
      } else {
        const debit = headerMap.debit !== undefined ? parseAmountValue(row[headerMap.debit]) : null
        const credit =
          headerMap.credit !== undefined ? parseAmountValue(row[headerMap.credit]) : null
        // BCR exportban a Suma iesire gyakran NEGATÍV számként jön ("-341.63"),
        // ezért az abszolút érték + előjel logika robusztus kell legyen
        if (credit !== null && credit !== 0) amount = Math.abs(credit) // bevétel pozitív
        else if (debit !== null && debit !== 0) amount = -Math.abs(debit) // kiadás negatív
      }

      if (amount === null || amount === 0) continue

      // Ha nincs leírás, generálunk egyet (a tranzakció azonosításához)
      const finalDescription = description || `Tranzakció ${date}`

      const balance =
        headerMap.balance !== undefined ? parseAmountValue(row[headerMap.balance]) : undefined

      const reference =
        headerMap.reference !== undefined ? String(row[headerMap.reference] ?? '').trim() : undefined

      const counterparty =
        headerMap.counterparty !== undefined
          ? String(row[headerMap.counterparty] ?? '').trim()
          : undefined

      result.transactions.push({
        rowIndex: i + 1,
        date,
        description: finalDescription,
        reference: reference || undefined,
        amount,
        balance: balance ?? undefined,
        counterparty: counterparty || undefined,
      })
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
