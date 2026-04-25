'use server'

/**
 * Befizetés (income / pénzbeszedés) server action-ök.
 *
 * A-M7.3a (2026-04-24) óta — thin wrapper-ek a @kartoteka/core use-case-ek
 * köré. A zod-validálást + Supabase-hívást a core végzi; a web adapter
 * csak a `effective-access` (congregationId, user) injektálását teszi.
 *
 * A-M7.3b (2026-04-24) — 5 új use-case wrapper: save, nextReceiptNumber,
 * checkReceiptDuplicate, searchMembers, getFamilyIdForPerson.
 *
 * A jelenlegi ~2400 soros `apps/web/app/(dashboard)/penzugy/actions.ts`
 * fájlbeli befizetés-műveletek fokozatosan erre a thin-wrapper fájlra
 * vándorolnak. Az A-M7.3 kör lezárultával a `actions.ts`-ből a befizetés-
 * kód kiemelhető.
 */

import {
  checkReceiptDuplicateUseCase,
  getFamilyIdForPersonUseCase,
  getNextReceiptNumberUseCase,
  listIncomeUseCase,
  saveIncomeUseCase,
  searchMembersForFinanceUseCase,
  softDeleteIncomeUseCase,
  stornoIncomeUseCase,
  type CheckReceiptDuplicateResult,
  type FamilyIdForPersonResult,
  type ListIncomeResult,
  type NextReceiptNumberResult,
  type SaveIncomeResultOrError,
  type SearchMembersResult,
  type SoftDeleteIncomeResult,
  type StornoIncomeResult,
} from '@kartoteka/core'
import {
  type ListIncomeInput,
  type SaveIncomeInput,
  type StornoIncomeInput,
} from '@kartoteka/validations'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/**
 * A kliens-szintű input shape — az `@kartoteka/validations.ListIncomeInput`
 * `congregationId`-ját a server-oldali effective-access-ből tölti, hogy
 * a kliens ne küldhessen másik gyülekezet ID-ját.
 */
export type ListIncomeWebInput = Omit<ListIncomeInput, 'congregationId'>
export type SaveIncomeWebInput = Omit<SaveIncomeInput, 'congregationId'>

// ─────────────────────────────────────────────────────────────
// 1. Lista (A-M7.3a)
// ─────────────────────────────────────────────────────────────

export async function listIncomeAction(
  input: ListIncomeWebInput,
): Promise<ListIncomeResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) {
    return { success: false, error: 'Nincs bejelentkezve.' }
  }
  if (!access.effectiveCongregationId) {
    return { success: false, error: 'Nincs aktív gyülekezet.' }
  }

  return listIncomeUseCase(
    {
      congregationId: access.effectiveCongregationId,
      year: input.year,
      yearField: input.yearField,
      szemelyId: input.szemelyId,
      csaladId: input.csaladId,
      befizetescelId: input.befizetescelId,
      includeDeleted: input.includeDeleted,
      includeStornozott: input.includeStornozott,
      orderBy: input.orderBy,
      limit: input.limit,
    },
    {
      supabase: access.supabase,
      runtime: 'web',
    },
  )
}

// ─────────────────────────────────────────────────────────────
// 2. Új befizetés rögzítése (A-M7.3b)
// ─────────────────────────────────────────────────────────────

export async function saveIncomeAction(
  input: SaveIncomeWebInput,
): Promise<SaveIncomeResultOrError> {
  const access = await getEffectiveAccessContext()
  if (!access.user) {
    return { success: false, error: 'Nincs bejelentkezve.' }
  }
  if (!access.effectiveCongregationId) {
    return { success: false, error: 'Nincs aktív gyülekezet.' }
  }

  return saveIncomeUseCase(
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
// 3. Következő iratszám (Készpénz, adott év)
// ─────────────────────────────────────────────────────────────

export async function getNextReceiptNumberAction(
  year: number,
): Promise<NextReceiptNumberResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return getNextReceiptNumberUseCase(
    { congregationId: access.effectiveCongregationId, year },
    { supabase: access.supabase, runtime: 'web' },
  )
}

// ─────────────────────────────────────────────────────────────
// 4. Iratszám-duplikátum ellenőrzés
// ─────────────────────────────────────────────────────────────

export async function checkReceiptDuplicateAction(
  iratszam: string,
  excludeId?: number,
): Promise<CheckReceiptDuplicateResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return checkReceiptDuplicateUseCase(
    {
      congregationId: access.effectiveCongregationId,
      iratszam,
      excludeId,
    },
    { supabase: access.supabase, runtime: 'web' },
  )
}

// ─────────────────────────────────────────────────────────────
// 5. Tag-kereső
// ─────────────────────────────────────────────────────────────

export async function searchMembersForFinanceAction(
  query: string,
  limit?: number,
): Promise<SearchMembersResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return searchMembersForFinanceUseCase(
    {
      congregationId: access.effectiveCongregationId,
      query,
      limit,
    },
    { supabase: access.supabase, runtime: 'web' },
  )
}

// ─────────────────────────────────────────────────────────────
// 6. Tag → család FK resolve
// ─────────────────────────────────────────────────────────────

export async function getFamilyIdForPersonAction(
  personId: number,
): Promise<FamilyIdForPersonResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return getFamilyIdForPersonUseCase(
    {
      congregationId: access.effectiveCongregationId,
      personId,
    },
    { supabase: access.supabase, runtime: 'web' },
  )
}

// ─────────────────────────────────────────────────────────────
// 7. Soft-delete (A-M7.3c)
// ─────────────────────────────────────────────────────────────

export async function softDeleteIncomeAction(
  befizetesId: number,
): Promise<SoftDeleteIncomeResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return softDeleteIncomeUseCase(
    {
      congregationId: access.effectiveCongregationId,
      befizetesId,
    },
    { supabase: access.supabase, runtime: 'web' },
  )
}

// ─────────────────────────────────────────────────────────────
// 8. Sztornó (A-M7.3c)
// ─────────────────────────────────────────────────────────────

export type StornoIncomeWebInput = Omit<StornoIncomeInput, 'congregationId'>

export async function stornoIncomeAction(
  input: StornoIncomeWebInput,
): Promise<StornoIncomeResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return stornoIncomeUseCase(
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
