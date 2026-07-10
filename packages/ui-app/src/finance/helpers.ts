/**
 * Pénzügyi modul — közös tiszta-függvények (Sprint Q Fázis 1, 2026-04-25, v0.6.0).
 *
 * Ezek a függvények **nem hivatkoznak DB-re vagy szerver-action-re** —
 * tisztán a `types.ts` típusaiból dolgoznak. Web és desktop egyaránt
 * importálja innen.
 */

import type {
  BefitetesRow,
  DebtCalcMode,
  KiadasRow,
  RentalContractRow,
} from './types'

// ── Pénznem és formázás ──────────────────────────────────────

export function formatCurrency(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '0,00'
  const parts = Number(num).toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return parts[0] + ',' + parts[1]
}

// ── Leltár kategória felismerés ──────────────────────────────

const INVENTORY_KEYWORDS = [
  'beruházás',
  'felszerelés',
  'leltár',
  'alapeszköz',
  'eszköz',
  'gép',
  'bútor',
  'vasarlas',
  'vásárlás',
  'ertekesites',
  'értékesítés',
  'eladas',
  'eladás',
]

export function isInventoryCategory(categoryName: string): boolean {
  const lower = categoryName.toLowerCase()
  return INVENTORY_KEYWORDS.some((kw) => lower.includes(kw))
}

// ── Tartozás-számítási mód normalizálás ──────────────────────

export function normalizeDebtCalcMode(value: unknown): DebtCalcMode {
  return value === 'aktualis' ? 'aktualis' : 'akkori'
}

// ── Tranzakció dokumentumszám ────────────────────────────────

export function getTransactionDocumentNumber(row: {
  iratszam?: string | null
  bizonylatszam?: string | null
  nyugta?: string | null
  nyugtaszam?: string | null
}): string | null {
  return row.iratszam || row.nyugta || row.bizonylatszam || row.nyugtaszam || null
}

export function getExpensePartnerName(row: {
  kedvezmenyzett?: string | null
  atvevo?: string | null
}): string | null {
  return row.kedvezmenyzett || row.atvevo || null
}

// ── Hierarchikus rendezés ────────────────────────────────────

export function sortCellsHierarchically(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va !== vb) return va - vb
  }
  return 0
}

// ── Magyar asszonynév elemzés ────────────────────────────────

export interface ParsedWomensName {
  husbandFamily: string
  wifeFirst: string
  maidenFull: string
  searchTerms: string[]
  hint: string
}

export function parseHungarianWomensName(namePart: string): ParsedWomensName | null {
  if (!namePart) return null
  const clean = namePart.replace(/^Özv\.\s*/i, '').trim()
  const words = clean.split(/\s+/)
  const neIdx = words.findIndex((w) => /né$/.test(w))
  if (neIdx === -1) return null

  const husbandFamily = words[0]
  const afterNe = words.slice(neIdx + 1)

  if (afterNe.length === 0) {
    return {
      husbandFamily,
      wifeFirst: '',
      maidenFull: '',
      searchTerms: [husbandFamily],
      hint: `(${husbandFamily} felesége)`,
    }
  } else if (afterNe.length === 1) {
    const wifeFirst = afterNe[0]
    return {
      husbandFamily,
      wifeFirst,
      maidenFull: '',
      searchTerms: [`${husbandFamily} ${wifeFirst}`, wifeFirst],
      hint: `→ ${husbandFamily} ${wifeFirst}`,
    }
  } else {
    const maidenFull = afterNe.join(' ')
    const maidenFirst = afterNe[afterNe.length - 1]
    return {
      husbandFamily,
      wifeFirst: maidenFirst,
      maidenFull,
      searchTerms: [maidenFull, `${husbandFamily} ${maidenFirst}`, maidenFirst],
      hint: `→ lánykori: ${maidenFull}`,
    }
  }
}

// ── Név normalizálás (diakritika eltávolítás) ────────────────

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// ── Név prefix eltávolítás ───────────────────────────────────

export function stripNamePrefix(name: string): string {
  return name.replace(/^(ifj\.|id\.|dr\.|özv\.)\s*/gi, '').trim()
}

// ── Forrás szétbontás (audit) ────────────────────────────────

export function splitForrasaNameStreet(forrasa: string | null): {
  namePart: string
  streetPart: string
} {
  if (!forrasa) return { namePart: '', streetPart: '' }
  const sepIdx = forrasa.indexOf(' - ')
  if (sepIdx === -1) return { namePart: forrasa.trim(), streetPart: '' }
  return {
    namePart: forrasa.slice(0, sepIdx).trim(),
    streetPart: forrasa.slice(sepIdx + 3).trim(),
  }
}

// ── Egyenleg számítás ────────────────────────────────────────

export interface FinanceBalances {
  cashBalance: number
  bankBalance: number
  totalIncome: number
  totalExpense: number
}

// ── Bérleti éves díj számítás ────────────────────────────────

/**
 * Éves bérleti díj kiszámítása.
 * - Havi ciklus: `osszeg * 12`
 * - Éves ciklus: `osszeg`
 */
export function calculateEvesDij(
  contract: Pick<RentalContractRow, 'osszeg' | 'fizetesi_ciklus'>,
): number {
  const osszeg = Number(contract.osszeg) || 0
  return contract.fizetesi_ciklus === 'havi' ? osszeg * 12 : osszeg
}

export function calculateBalances(
  income: BefitetesRow[],
  expense: KiadasRow[],
  carryoverCash: number,
  carryoverBank: number,
  /** Belső-mozgás cél-azonosítók (befizetescel/kiadascel id-k, amelyek 3xx/4xx kódra mutatnak).
   *  Ezeket a tételeket a BEVÉTEL/KIADÁS összegből kizárjuk akkor is, ha nincs belso_mozgas_xkey-ük
   *  (egyes importált belső sorok kód szerint belső mozgások, de nincs xkey-párjuk). */
  opts?: { internalIncomeCelIds?: Set<number>; internalExpenseCelIds?: Set<number> },
): FinanceBalances {
  let cashBal = carryoverCash
  let bankBal = carryoverBank
  let totalIn = 0
  let totalEx = 0

  // Kassza vs bank a `bankszamla_id` szerint (NULL = kassza) — NEM az irattípus alapján,
  // mert az importált tételek irattípusa „Chit."/„Extr" (nem „Készpénz"/„Banki").
  // A kassza/bank EGYENLEGBE a belső mozgás is beleszámít (a letét csökkenti a kasszát,
  // növeli a bankot). A BEVÉTEL/KIADÁS összegből viszont KIZÁRJUK a belső mozgást — vagy a
  // `belso_mozgas_xkey`, vagy a belső CÉL-KÓD (3xx/4xx) alapján —, hiszen az nem valós
  // bevétel/kiadás, csak átvezetés; így az összegek a számadással egyeznek.
  // 2026-07-10 (S3 audit KRITIKUS #1): a STORNÓZOTT (érvénytelenített) tétel
  // SEM az egyenlegbe, SEM a totálokba nem számít — a stornó a hivatalos
  // gyakorlatban a tételt teljesen érvényteleníti. Eddig a hero/dashboard
  // egyenleg tartalmazta, a Kassza/Bank fül viszont nem → a két szám eltért,
  // és érvénytelenített nyugtával torzítható volt az egyenleg.
  income.forEach((r) => {
    if ((r as { stornozott?: boolean }).stornozott) return
    const amt = Number(r.osszeg) || 0
    const internal =
      !!r.belso_mozgas_xkey ||
      (r.id_befizetescel != null && !!opts?.internalIncomeCelIds?.has(r.id_befizetescel))
    if (!internal) totalIn += amt
    if (!r.bankszamla_id) cashBal += amt
    else bankBal += amt
  })

  expense.forEach((r) => {
    if ((r as { stornozott?: boolean }).stornozott) return
    const amt = Number(r.osszeg) || 0
    const internal =
      !!r.belso_mozgas_xkey ||
      (r.id_kiadascel != null && !!opts?.internalExpenseCelIds?.has(r.id_kiadascel))
    if (!internal) totalEx += amt
    if (!r.bankszamla_id) cashBal -= amt
    else bankBal -= amt
  })

  return {
    cashBalance: cashBal,
    bankBalance: bankBal,
    totalIncome: totalIn,
    totalExpense: totalEx,
  }
}
