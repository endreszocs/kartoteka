'use server'

/**
 * Banki Excel import server action-ök — VÉKONY WRAPPER a @kartoteka/core fölé
 * (2026-06-12, Endre #4 bank-import).
 *
 * A teljes import-logika (duplikáció-védelem, valuta+árfolyam, bevétel /
 * kiadás / belső-mozgás ágak, aktív párosítás) átköltözött a
 * `packages/core/src/finance/bank-import/import-transactions.ts` use-case-be,
 * hogy a desktop (Tauri) PONTOSAN ugyanazt futtassa. Itt csak:
 *   - auth + gyülekezet-feloldás (getEffectiveAccessContext),
 *   - revalidatePath('/penzugy') a sikeres import után.
 *
 * A visszatérési alakok VÁLTOZATLANOK (a hívó wizard nem érzékel változást);
 * az `importedRows` mező additív bővítés (a desktop Excel-írásához).
 */

import { revalidatePath } from 'next/cache'

import {
  getLatestBankTransactionDateUseCase,
  importBankTransactionsUseCase,
  type BankImportItem,
  type BankImportResult,
} from '@kartoteka/core'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

// Típus re-exportok — a meglévő import-helyek (pl. bcr-import-wizard-dialog)
// változatlanul működnek. (`export type` fordításkor törlődik, így a
// 'use server' szabályt — csak async function export — nem sérti.)
export type {
  BankImportItem,
  BankImportItemAction,
  BankImportResult,
  BankImportedRow,
} from '@kartoteka/core'

/**
 * A legutolsó banki tranzakció dátuma egy adott bankszámlán.
 * A wizard ezt használja default szűrőként: csak az ennél későbbi
 * tranzakciókat ajánlja fel alapértelmezetten.
 */
export async function getLatestBankTransactionDate(bankszamlaId: number): Promise<{
  date?: string | null
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  return getLatestBankTransactionDateUseCase(
    { congregationId: access.effectiveCongregationId, bankszamlaId },
    { supabase: access.supabase, runtime: 'web', userId: access.user.id },
  )
}

export async function importBcrTransactions(
  items: BankImportItem[],
): Promise<BankImportResult & { error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user)
    return { totalItems: 0, imported: 0, skipped: 0, duplicates: 0, errors: [], importedRows: [], error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId)
    return { totalItems: 0, imported: 0, skipped: 0, duplicates: 0, errors: [], importedRows: [], error: 'Nincs aktív gyülekezet.' }

  const result = await importBankTransactionsUseCase(
    { congregationId: access.effectiveCongregationId, items },
    { supabase: access.supabase, runtime: 'web', userId: access.user.id },
  )

  revalidatePath('/penzugy')
  return result
}
