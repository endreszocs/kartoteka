'use server'

/**
 * Kiadás (expense) server action-ök.
 *
 * A-M7.4a (2026-04-24) — A befizetés-actions.ts mintájára: thin wrapper-ek
 * a @kartoteka/core kiadás-use-case-ei köré.
 *
 * A ~2400 soros `penzugy/actions.ts` fájl `saveExpense*` és `deleteTransaction`
 * függvényei változatlanok maradnak (backward-compat). Az új flow erre
 * a fájlra fog épülni.
 */

import {
  checkExpenseReceiptDuplicateUseCase,
  getNextReceiptNumberForExpenseUseCase,
  listExpenseUseCase,
  listKiadasCelekUseCase,
  saveExpenseUseCase,
  softDeleteExpenseUseCase,
  stornoExpenseUseCase,
  type CheckExpenseReceiptDuplicateResult,
  type ListExpenseResult,
  type ListKiadasCelekResult,
  type NextExpenseReceiptNumberResult,
  type SaveExpenseResultOrError,
  type SoftDeleteExpenseResult,
  type StornoExpenseResult,
} from '@kartoteka/core'
import {
  type ListExpenseInput,
  type SaveExpenseInput,
  type StornoExpenseInput,
} from '@kartoteka/validations'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

export type ListExpenseWebInput = Omit<ListExpenseInput, 'congregationId'>
export type SaveExpenseWebInput = Omit<SaveExpenseInput, 'congregationId'>

// ─────────────────────────────────────────────────────────────
// 1. Lista (A-M7.4a)
// ─────────────────────────────────────────────────────────────

export async function listExpenseAction(
  input: ListExpenseWebInput,
): Promise<ListExpenseResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return listExpenseUseCase(
    {
      congregationId: access.effectiveCongregationId,
      year: input.year,
      atvevoId: input.atvevoId,
      kiadasceId: input.kiadasceId,
      includeDeleted: input.includeDeleted,
      includeStornozott: input.includeStornozott,
      orderBy: input.orderBy,
      limit: input.limit,
    },
    { supabase: access.supabase, runtime: 'web' },
  )
}

// ─────────────────────────────────────────────────────────────
// 2. Kategória-lista (kiadascel)
// ─────────────────────────────────────────────────────────────

export async function listKiadasCelekAction(
  onlyActive = true,
): Promise<ListKiadasCelekResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }

  return listKiadasCelekUseCase(
    { onlyActive },
    { supabase: access.supabase, runtime: 'web' },
  )
}

// ─────────────────────────────────────────────────────────────
// 3. Új kiadás rögzítése (A-M7.4b)
// ─────────────────────────────────────────────────────────────

export async function saveExpenseAction(
  input: SaveExpenseWebInput,
): Promise<SaveExpenseResultOrError> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return saveExpenseUseCase(
    {
      ...input,
      congregationId: access.effectiveCongregationId,
    },
    {
      supabase: access.supabase,
      runtime: 'web',
      userId: access.user.id,
    },
  )
}

// ─────────────────────────────────────────────────────────────
// 4. Következő iratszám
// ─────────────────────────────────────────────────────────────

export async function getNextExpenseReceiptNumberAction(
  year: number,
): Promise<NextExpenseReceiptNumberResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return getNextReceiptNumberForExpenseUseCase(
    { congregationId: access.effectiveCongregationId, year },
    { supabase: access.supabase, runtime: 'web' },
  )
}

// ─────────────────────────────────────────────────────────────
// 5. Iratszám-duplikátum ellenőrzés
// ─────────────────────────────────────────────────────────────

export async function checkExpenseReceiptDuplicateAction(
  iratszam: string,
  excludeId?: number,
): Promise<CheckExpenseReceiptDuplicateResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return checkExpenseReceiptDuplicateUseCase(
    {
      congregationId: access.effectiveCongregationId,
      iratszam,
      excludeId,
    },
    { supabase: access.supabase, runtime: 'web' },
  )
}

// ─────────────────────────────────────────────────────────────
// 6. Soft-delete (A-M7.4c)
// ─────────────────────────────────────────────────────────────

export async function softDeleteExpenseAction(
  kiadasId: number,
): Promise<SoftDeleteExpenseResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return softDeleteExpenseUseCase(
    {
      congregationId: access.effectiveCongregationId,
      kiadasId,
    },
    { supabase: access.supabase, runtime: 'web' },
  )
}

// ─────────────────────────────────────────────────────────────
// 7. Sztornó (A-M7.4c)
// ─────────────────────────────────────────────────────────────

export type StornoExpenseWebInput = Omit<StornoExpenseInput, 'congregationId'>

export async function stornoExpenseAction(
  input: StornoExpenseWebInput,
): Promise<StornoExpenseResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return stornoExpenseUseCase(
    {
      ...input,
      congregationId: access.effectiveCongregationId,
    },
    {
      supabase: access.supabase,
      runtime: 'web',
      userId: access.user.id,
    },
  )
}
