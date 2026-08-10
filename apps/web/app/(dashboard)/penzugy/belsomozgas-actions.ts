'use server'

/**
 * Belső mozgás (internal transfer) server action — A-M7.6a (2026-04-24).
 *
 * 2026-08-11 (K5 P2 #5) — MEGTISZTÍTVA. A fájl eredetileg három thin-wrappert
 * exportált a @kartoteka/core use-case-ek fölé, egy „a web fokozatosan átáll a
 * core-ra" migráció részeként. Az átállás nem történt meg: a listázást és a
 * mentést a felület továbbra is a ~2400 soros `penzugy/actions.ts`-ből hívja,
 * így a `listInternalTransfersAction` és a `saveInternalTransferAction` HÍVÓ
 * NÉLKÜL maradt. Egy `use server` export hívó nélkül is ÉLŐ POST-végpont —
 * a `saveInternalTransferAction` konkrétan pénzügyi sort írt volna —, ezért
 * mindkettőt töröltük a hozzájuk tartozó input-típusokkal együtt.
 *
 * Ami MARAD: a `softDeleteInternalTransferAction`, amit a
 * `components/finance/monetary-tab-v2.tsx:15` ténylegesen hív.
 *
 * Ha a web→core konvergencia később mégis megtörténik, az önálló feladat
 * legyen — ne hívatlan wrapper-fájlok formájában várakozzon a repóban.
 */

import {
  softDeleteInternalTransferUseCase,
  type SoftDeleteInternalTransferResult,
} from '@kartoteka/core'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

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
