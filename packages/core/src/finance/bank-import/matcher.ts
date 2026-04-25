/**
 * matchBankTransactionsUseCase — A-M7.10b (2026-04-25).
 *
 * Banki tranzakciók (BankTransaction[]) párosítása a meglévő befizetés és
 * kiadás tételekkel. A use-case egy időtartományra (a tranzakciók dátum-min
 * és -max ± buffer-nap) lekérdezi a `befizetes` + `kiadas` táblát, majd
 * minden BankTransaction-re megpróbál egy biztos egyezést találni.
 *
 * Heuristikák (egymás után, prioritás-sorrendben):
 *
 *   1. **Pontos egyezés** (confidence 1.0): azonos dátum + azonos összeg
 *      (RON, két tizedes pontosság).
 *
 *   2. **Toleráns dátum-egyezés** (confidence 0.7): pontos összeg, de a
 *      dátum eltérhet ±2 nappal (a banki feldolgozás gyakran 1-2 nap
 *      késéssel könyveli a tranzakciót).
 *
 *   3. **Iratszám / referencia egyezés** (confidence 0.9): ha a banki sor
 *      `reference` mezője tartalmazza valamelyik meglévő tétel iratszámát.
 *      Pl. átutalási közleményben „IRATSZAM: 887".
 *
 * Ha több jelölt találódik (egy tranzakció több létező tételhez illik), a
 * státusz `'multiple'` — a user kézzel dönt majd (A-M7.10c-ben).
 *
 * Ha egy sem (a buffer-tartományon belül se), a státusz `'unmatched'` — az
 * automata import (A-M7.10c) ezt új tételként javasolja.
 *
 * **Online-only most**: a szerver-RPC szükséges, mert a Bank-import
 * jellegéből adódóan online-mód alatt fut (nem egy gyors offline-feladat).
 * Az offline-fallback technikailag lehetséges, de a use-case más session-be
 * defer-elve (a `befizetes_local` és `kiadas_local` cache nem tartalmaz
 * minden mezőt).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  BankMatchResult,
  BankMatchRow,
  BankTransaction,
  MatchCandidate,
  MatchStatus,
} from '@kartoteka/validations'

import { listIncomeUseCase } from '../befizetes/list'
import { listExpenseUseCase } from '../kiadas/list'

export interface MatchBankTransactionsInput {
  congregationId: string
  transactions: BankTransaction[]
  /** ±N nap a banki dátumtól. Default: 2. */
  dateBufferDays?: number
}

export interface MatchBankTransactionsCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type MatchBankTransactionsResultOrError =
  | { success: true; data: BankMatchResult }
  | { success: false; error: string }

const DEFAULT_BUFFER_DAYS = 2
const AMOUNT_EPSILON = 0.01

function approxEqualAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < AMOUNT_EPSILON
}

function dateDiffDays(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime()
  const b = new Date(isoB).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity
  return Math.abs((a - b) / 86_400_000)
}

/**
 * Megnézi, hogy a `reference` (banki közlemény) tartalmaz-e szám-szekvenciát,
 * ami a meglévő iratszám-mal egyezik (pl. közleményben „nyugta 887").
 */
function referenceContainsIratszam(reference: string | null | undefined, iratszam: string): boolean {
  if (!reference || !iratszam) return false
  const trimmed = iratszam.trim()
  if (trimmed.length < 2) return false // 1-jegyű szám túl gyakori → sok false-positive
  // Whole-word match: betűk/szám-határok közötti szekvencia
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(?:^|\\D)${escaped}(?:\\D|$)`)
  return regex.test(reference)
}

export async function matchBankTransactionsUseCase(
  input: MatchBankTransactionsInput,
  ctx: MatchBankTransactionsCtx,
): Promise<MatchBankTransactionsResultOrError> {
  if (!input.congregationId) {
    return { success: false, error: 'Hiányzó congregation_id.' }
  }
  if (!Array.isArray(input.transactions) || input.transactions.length === 0) {
    return {
      success: true,
      data: { rows: [], summary: { matched: 0, multiple: 0, unmatched: 0, duplicate: 0 } },
    }
  }

  const buffer = Math.max(0, Math.floor(input.dateBufferDays ?? DEFAULT_BUFFER_DAYS))

  // 1) Időtartomány meghatározása a tranzakciók min/max dátumából + buffer
  const dates = input.transactions.map((t) => t.date).sort()
  const minDate = dates[0]
  const maxDate = dates[dates.length - 1]
  const minMs = new Date(minDate).getTime() - buffer * 86_400_000
  const maxMs = new Date(maxDate).getTime() + buffer * 86_400_000
  const minIso = new Date(minMs).toISOString().slice(0, 10)
  const maxIso = new Date(maxMs).toISOString().slice(0, 10)
  const minYear = new Date(minMs).getFullYear()
  const maxYear = new Date(maxMs).getFullYear()

  // 2) Befizetések + kiadások lekérdezése a tartományra (mindkét évre, ha átfedés)
  const incomePromises = []
  const expensePromises = []
  for (let y = minYear; y <= maxYear; y += 1) {
    incomePromises.push(
      listIncomeUseCase(
        {
          congregationId: input.congregationId,
          year: y,
          yearField: 'datum',
          orderBy: 'datum-desc',
          limit: 2000,
          includeDeleted: false,
          includeStornozott: false,
        },
        { supabase: ctx.supabase, runtime: ctx.runtime },
      ),
    )
    expensePromises.push(
      listExpenseUseCase(
        {
          congregationId: input.congregationId,
          year: y,
          orderBy: 'datum-desc',
          limit: 2000,
          includeDeleted: false,
          includeStornozott: false,
        },
        { supabase: ctx.supabase, runtime: ctx.runtime },
      ),
    )
  }

  const [incomeResults, expenseResults] = await Promise.all([
    Promise.all(incomePromises),
    Promise.all(expensePromises),
  ])

  // Hibaaggregáció
  for (const r of incomeResults) {
    if (!r.success) {
      return { success: false, error: `Befizetés-lista hiba: ${r.error}` }
    }
  }
  for (const r of expenseResults) {
    if (!r.success) {
      return { success: false, error: `Kiadás-lista hiba: ${r.error}` }
    }
  }

  // Csak az időtartományba eső sorok (a use-case éves szűrése bő, finomítjuk)
  const incomeRows = incomeResults
    .flatMap((r) => (r.success ? r.rows : []))
    .filter((row) => row.datum >= minIso && row.datum <= maxIso)

  const expenseRows = expenseResults
    .flatMap((r) => (r.success ? r.rows : []))
    .filter((row) => {
      const datum10 = row.datum.slice(0, 10)
      return datum10 >= minIso && datum10 <= maxIso
    })

  // 3) Minden tranzakcióra párosítás
  const rows: BankMatchRow[] = []
  const summary = { matched: 0, multiple: 0, unmatched: 0, duplicate: 0 }

  for (const tx of input.transactions) {
    const isIncome = tx.amount > 0
    const absAmount = Math.abs(tx.amount)
    const candidates: MatchCandidate[] = []

    const pool = isIncome ? incomeRows : expenseRows

    // 3a) Pontos egyezés (datum + osszeg)
    for (const row of pool) {
      const rowDate = row.datum.slice(0, 10)
      if (rowDate !== tx.date) continue
      if (!approxEqualAmount(row.osszeg ?? 0, absAmount)) continue
      candidates.push({
        tipus: isIncome ? 'befizetes' : 'kiadas',
        id: Number(row.id),
        iratszam: String(row.iratszam ?? ''),
        datum: rowDate,
        osszeg: Number(row.osszeg ?? 0),
        irattipus: String(row.irattipus ?? ''),
        confidence: 1.0,
        reason: 'Pontos dátum + összeg egyezés',
      })
    }

    // 3b) Iratszám / referencia egyezés (ha még nincs match)
    if (candidates.length === 0 && tx.reference) {
      for (const row of pool) {
        if (!approxEqualAmount(row.osszeg ?? 0, absAmount)) continue
        if (!referenceContainsIratszam(tx.reference, String(row.iratszam ?? ''))) continue
        candidates.push({
          tipus: isIncome ? 'befizetes' : 'kiadas',
          id: Number(row.id),
          iratszam: String(row.iratszam ?? ''),
          datum: row.datum.slice(0, 10),
          osszeg: Number(row.osszeg ?? 0),
          irattipus: String(row.irattipus ?? ''),
          confidence: 0.9,
          reason: 'Iratszám-egyezés a banki közleményben + összeg',
        })
      }
    }

    // 3c) Toleráns dátum-egyezés (ha még nincs match)
    if (candidates.length === 0) {
      for (const row of pool) {
        const rowDate = row.datum.slice(0, 10)
        if (!approxEqualAmount(row.osszeg ?? 0, absAmount)) continue
        const diff = dateDiffDays(tx.date, rowDate)
        if (diff <= 0 || diff > buffer) continue
        candidates.push({
          tipus: isIncome ? 'befizetes' : 'kiadas',
          id: Number(row.id),
          iratszam: String(row.iratszam ?? ''),
          datum: rowDate,
          osszeg: Number(row.osszeg ?? 0),
          irattipus: String(row.irattipus ?? ''),
          confidence: 0.7,
          reason: `Pontos összeg, dátum ${diff.toFixed(0)} napos eltéréssel`,
        })
      }
    }

    // 4) Status meghatározása
    let status: MatchStatus
    let unmatchedReason: string | null = null
    if (candidates.length === 1) {
      status = 'matched'
      summary.matched += 1
    } else if (candidates.length > 1) {
      status = 'multiple'
      summary.multiple += 1
    } else {
      status = 'unmatched'
      summary.unmatched += 1
      unmatchedReason = isIncome
        ? `Nincs befizetés ${absAmount.toLocaleString('hu')} RON értékben a ${tx.date} ± ${buffer} nap időszakban.`
        : `Nincs kiadás ${absAmount.toLocaleString('hu')} RON értékben a ${tx.date} ± ${buffer} nap időszakban.`
    }

    rows.push({
      rowIndex: tx.rowIndex,
      transaction: tx,
      status,
      candidates,
      unmatchedReason,
    })
  }

  return {
    success: true,
    data: { rows, summary },
  }
}
