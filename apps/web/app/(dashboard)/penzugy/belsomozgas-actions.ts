'use server'

/**
 * Belső mozgás (internal transfer) server action-ök — A-M7.6a (2026-04-24).
 *
 * A meglévő ~2400 soros `actions.ts` `saveInternalTransfer` függvényét
 * tartjuk egy darabig backward-compat-ként; az új flow ezen a thin-wrapper
 * fájlon át hívja a @kartoteka/core use-case-eket.
 */

import {
  listInternalTransfersUseCase,
  saveInternalTransferUseCase,
  softDeleteInternalTransferUseCase,
  type ListInternalTransfersResult,
  type SaveInternalTransferResultOrError,
  type SoftDeleteInternalTransferResult,
} from '@kartoteka/core'
import {
  type ListInternalTransfersInput,
  type SaveInternalTransferInput,
} from '@kartoteka/validations'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

export type ListInternalTransfersWebInput = Omit<ListInternalTransfersInput, 'congregationId'>
export type SaveInternalTransferWebInput = Omit<SaveInternalTransferInput, 'congregationId'>

// ─────────────────────────────────────────────────────────────
// 1. Lista
// ─────────────────────────────────────────────────────────────

export async function listInternalTransfersAction(
  input: ListInternalTransfersWebInput,
): Promise<ListInternalTransfersResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return listInternalTransfersUseCase(
    {
      congregationId: access.effectiveCongregationId,
      year: input.year,
      tipus: input.tipus,
      includeDeleted: input.includeDeleted,
      orderBy: input.orderBy,
      limit: input.limit,
    },
    { supabase: access.supabase, runtime: 'web' },
  )
}

// ─────────────────────────────────────────────────────────────
// 2. Új belső mozgás
// ─────────────────────────────────────────────────────────────

export async function saveInternalTransferAction(
  input: SaveInternalTransferWebInput,
): Promise<SaveInternalTransferResultOrError> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return saveInternalTransferUseCase(
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
// 3. Soft-delete
// ─────────────────────────────────────────────────────────────

export async function softDeleteInternalTransferAction(
  transferId: number,
): Promise<SoftDeleteInternalTransferResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  return softDeleteInternalTransferUseCase(
    {
      congregationId: access.effectiveCongregationId,
      transferId,
    },
    { supabase: access.supabase, runtime: 'web' },
  )
}
