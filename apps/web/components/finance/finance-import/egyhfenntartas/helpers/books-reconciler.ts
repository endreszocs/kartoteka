/**
 * Könyvelés-egyeztető (reconciler) — az importfájl egyházfenntartás-sorait a
 * MÁR KÖNYVELT (DB-beli `befizetes`, 101.01) tételekkel veti össze, kétirányú
 * hibakereséssel.
 *
 * 2026-06-09 — #2 igény: „összeegyeztet a könyvelésben szereplő tételekkel és keres
 * hibát (olyan tétel, aminek a bevezetése kimaradt, vagy a könyvelésben szerepel, de
 * az importálandó fájlból hiányzik)".
 *
 * Az igazság-forrás a DB (a felhasználó döntése). Eredmény-kategóriák:
 *   🟢 match            — a fájl-sor a könyvelésben is megvan (összeg+név stimmel)
 *   🔵 missing-from-books — a fájlban van, a könyvelésből KIMARADT → importálható
 *   🟠 only-in-books    — a könyvelésben van, a fájlból hiányzik → figyelmeztetés (NEM töröl)
 *   🟡 discrepancy      — kulcs (iratszám/nyugta) egyezik, de összeg vagy név eltér → review
 */

import { nameSimilarity } from '@/lib/import/jaro-winkler'

/** A fájl egy egyházfenntartás-sora (a wizard finalRow-jából). */
export interface ReconcileFileRow {
  clientKey: string
  forrasa: string
  osszeg: number
  datum: string
  /** 5 jegyű hivatalos iratszám (pl. "115329") */
  iratszam: string
  /** 1-329 sorszám */
  nyugta: string
}

/** Egy már könyvelt befizetés (a DB-ből). */
export interface ReconcileBookRow {
  id: number
  forrasa: string | null
  osszeg: number
  datum: string | null
  iratszam: string | null
  nyugta: string | null
}

export type ReconcileKind = 'match' | 'missing-from-books' | 'only-in-books' | 'discrepancy'

export interface ReconciledRow {
  kind: ReconcileKind
  fileRow?: ReconcileFileRow
  bookRow?: ReconcileBookRow
  /** Eltérés-magyarázat a 🟡 discrepancy esetén */
  reason?: string
}

export interface ReconcileResult {
  rows: ReconciledRow[]
  stats: {
    matchCount: number
    missingFromBooksCount: number
    onlyInBooksCount: number
    discrepancyCount: number
    fileTotal: number
    booksTotal: number
  }
}

/** Üres / "0" iratszám érvénytelen kulcsként. */
function normKey(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  if (!s || s === '0') return null
  return s
}

/**
 * Az importfájl sorait egyezteti a könyvelt befizetésekkel.
 *
 * Párosítási kulcs (csökkenő erősség): hivatalos `iratszam` → `nyugta`. Az így párba
 * állított soroknál összeget (±0.01) és nevet (Jaro–Winkler ≥0.88) is ellenőrzünk.
 */
export function reconcileWithBooks(
  fileRows: ReconcileFileRow[],
  bookRows: ReconcileBookRow[],
): ReconcileResult {
  const rows: ReconciledRow[] = []

  // Index a könyvelt sorokra (iratszám + nyugta szerint)
  const bookByIratszam = new Map<string, ReconcileBookRow[]>()
  const bookByNyugta = new Map<string, ReconcileBookRow[]>()
  for (const b of bookRows) {
    const ir = normKey(b.iratszam)
    if (ir) {
      const arr = bookByIratszam.get(ir) ?? []
      arr.push(b)
      bookByIratszam.set(ir, arr)
    }
    const ny = normKey(b.nyugta)
    if (ny) {
      const arr = bookByNyugta.get(ny) ?? []
      arr.push(b)
      bookByNyugta.set(ny, arr)
    }
  }

  const consumed = new Set<ReconcileBookRow>()
  let matchCount = 0
  let missingFromBooksCount = 0
  let discrepancyCount = 0
  let fileTotal = 0
  let booksTotal = 0

  for (const f of fileRows) {
    fileTotal += f.osszeg

    // Jelöltek: iratszám-egyezés elsőbbség, majd nyugta
    const fileIratszam = normKey(f.iratszam)
    const fileNyugta = normKey(f.nyugta)
    const candidates: ReconcileBookRow[] = []
    if (fileIratszam) candidates.push(...(bookByIratszam.get(fileIratszam) ?? []))
    if (fileNyugta) candidates.push(...(bookByNyugta.get(fileNyugta) ?? []))

    // A legjobb még fel nem használt jelölt (név-hasonlóság szerint)
    let best: ReconcileBookRow | null = null
    let bestSim = -1
    for (const c of candidates) {
      if (consumed.has(c)) continue
      const sim = nameSimilarity(f.forrasa, c.forrasa ?? '')
      if (sim > bestSim) {
        bestSim = sim
        best = c
      }
    }

    if (!best) {
      rows.push({ kind: 'missing-from-books', fileRow: f })
      missingFromBooksCount++
      continue
    }

    consumed.add(best)
    const amountOk = Math.abs(f.osszeg - best.osszeg) < 0.01
    const nameOk = bestSim >= 0.88

    if (amountOk && nameOk) {
      rows.push({ kind: 'match', fileRow: f, bookRow: best })
      matchCount++
    } else {
      const diffs: string[] = []
      if (!amountOk) diffs.push(`összeg eltér: fájl ${f.osszeg}, könyvelés ${best.osszeg}`)
      if (!nameOk)
        diffs.push(
          `név eltér (${Math.round(bestSim * 100)}%): fájl "${f.forrasa}", könyvelés "${best.forrasa ?? ''}"`,
        )
      rows.push({ kind: 'discrepancy', fileRow: f, bookRow: best, reason: diffs.join('; ') })
      discrepancyCount++
    }
  }

  // A fel nem használt könyvelt sorok: csak a könyvelésben van (a fájlból hiányzik)
  let onlyInBooksCount = 0
  for (const b of bookRows) {
    booksTotal += b.osszeg
    if (consumed.has(b)) continue
    rows.push({ kind: 'only-in-books', bookRow: b })
    onlyInBooksCount++
  }

  return {
    rows,
    stats: {
      matchCount,
      missingFromBooksCount,
      onlyInBooksCount,
      discrepancyCount,
      fileTotal,
      booksTotal,
    },
  }
}
