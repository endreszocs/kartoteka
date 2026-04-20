import type { BefitetesRow, KiadasRow } from '@/lib/constants/finance'

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
  const neIdx = words.findIndex(w => /né$/.test(w))
  if (neIdx === -1) return null

  const husbandFamily = words[0]
  const afterNe = words.slice(neIdx + 1)

  if (afterNe.length === 0) {
    return { husbandFamily, wifeFirst: '', maidenFull: '', searchTerms: [husbandFamily], hint: `(${husbandFamily} felesége)` }
  } else if (afterNe.length === 1) {
    const wifeFirst = afterNe[0]
    return { husbandFamily, wifeFirst, maidenFull: '', searchTerms: [`${husbandFamily} ${wifeFirst}`, wifeFirst], hint: `→ ${husbandFamily} ${wifeFirst}` }
  } else {
    const maidenFull = afterNe.join(' ')
    const maidenFirst = afterNe[afterNe.length - 1]
    return { husbandFamily, wifeFirst: maidenFirst, maidenFull, searchTerms: [maidenFull, `${husbandFamily} ${maidenFirst}`, maidenFirst], hint: `→ lánykori: ${maidenFull}` }
  }
}

// ── Név normalizálás (diakritika eltávolítás) ────────────────

export function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// ── Név prefix eltávolítás ───────────────────────────────────

export function stripNamePrefix(name: string): string {
  return name.replace(/^(ifj\.|id\.|dr\.|özv\.)\s*/gi, '').trim()
}

// ── Forrás szétbontás (audit) ────────────────────────────────

export function splitForrasaNameStreet(forrasa: string | null): { namePart: string; streetPart: string } {
  if (!forrasa) return { namePart: '', streetPart: '' }
  const sepIdx = forrasa.indexOf(' - ')
  if (sepIdx === -1) return { namePart: forrasa.trim(), streetPart: '' }
  return { namePart: forrasa.slice(0, sepIdx).trim(), streetPart: forrasa.slice(sepIdx + 3).trim() }
}

// ── Egyenleg számítás ────────────────────────────────────────

export function calculateBalances(
  income: BefitetesRow[],
  expense: KiadasRow[],
  carryoverCash: number,
  carryoverBank: number
): { cashBalance: number; bankBalance: number; totalIncome: number; totalExpense: number } {
  let cashBal = carryoverCash
  let bankBal = carryoverBank
  let totalIn = 0
  let totalEx = 0

  income.forEach(r => {
    const amt = Number(r.osszeg) || 0
    totalIn += amt
    if (r.irattipus === 'Készpénz') cashBal += amt
    else bankBal += amt
  })

  expense.forEach(r => {
    const amt = Number(r.osszeg) || 0
    totalEx += amt
    if (r.irattipus === 'Készpénz') cashBal -= amt
    else bankBal -= amt
  })

  return { cashBalance: cashBal, bankBalance: bankBal, totalIncome: totalIn, totalExpense: totalEx }
}
