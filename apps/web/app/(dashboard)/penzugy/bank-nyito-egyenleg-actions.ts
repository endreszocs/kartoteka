'use server'

/**
 * Bankszámla éves nyitó egyenleg szerver akciók — VÉKONY WRAPPER a
 * @kartoteka/core fölé (2026-06-12, Endre #4 bank-import).
 *
 * A get / upsert / checkYearStart logika átköltözött a
 * `packages/core/src/finance/bank-import/nyito-egyenleg.ts` use-case-ekbe,
 * hogy a desktop (Tauri) BCR-wizard ugyanazt futtassa. Itt csak:
 *   - auth + gyülekezet-feloldás (getEffectiveAccessContext),
 *   - revalidatePath('/penzugy') a sikeres upsert után.
 *
 * A visszatérési alakok VÁLTOZATLANOK. A `listBankszamlaNyitoEgyenlegek`
 * (csak weben használt) változatlanul itt él.
 */

import { revalidatePath } from 'next/cache'

import {
  checkYearStartStateUseCase,
  getBankszamlaNyitoEgyenlegUseCase,
  upsertBankszamlaNyitoEgyenlegUseCase,
  type UpsertNyitoEgyenlegInput,
} from '@kartoteka/core'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

// 2026-04-25 (Sprint Q F1, v0.7.2): a `NyitoEgyenlegRow` átkerült a shared
// `@kartoteka/ui-app` package-be, hogy a desktop és iOS oldal is ugyanazt a
// típust használja. Itt re-exportoljuk, hogy a meglévő import-helyek
// (pl. bcr-import-wizard-dialog.tsx) változatlanul működjenek.
import type { NyitoEgyenlegRow } from '@kartoteka/ui-app'
export type { NyitoEgyenlegRow }

// 2026-06-12: az input/eredmény típusok kanonikus helye a core — itt
// re-export, hogy a meglévő importok ne törjenek (`export type` törlődik
// fordításkor, a 'use server' szabályt nem sérti).
export type { UpsertNyitoEgyenlegInput, YearStartCheckResult } from '@kartoteka/core'

/**
 * Egy bankszámla éves nyitó egyenlegének lekérdezése.
 */
export async function getBankszamlaNyitoEgyenleg(
  bankszamlaId: number,
  eve: number,
): Promise<{ data?: NyitoEgyenlegRow | null; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  return getBankszamlaNyitoEgyenlegUseCase(
    { congregationId: access.effectiveCongregationId, bankszamlaId, eve },
    { supabase: access.supabase, runtime: 'web', userId: access.user.id },
  )
}

/**
 * Összes éves nyitó egyenleg egy bankszámlához.
 */
export async function listBankszamlaNyitoEgyenlegek(
  bankszamlaId: number,
): Promise<{ data?: NyitoEgyenlegRow[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data, error } = await access.supabase
    .from('bankszamla_nyito_egyenleg')
    .select('*')
    .eq('bankszamla_id', bankszamlaId)
    .eq('congregation_id', access.effectiveCongregationId)
    .order('eve', { ascending: true })

  if (error) return { error: error.message }
  return { data: (data || []) as NyitoEgyenlegRow[] }
}

/**
 * Nyitó egyenleg rögzítés / frissítés (upsert).
 *
 * Ha a bankszámla RON, a `nyito_egyenleg_ron` automatikusan egyenlő a
 * `nyito_egyenleg_valuta`-val. Ha valutás (EUR/HUF), a RON-t az
 * árfolyammal számoljuk (ha van) vagy a megadott értéket vesszük.
 */
export async function upsertBankszamlaNyitoEgyenleg(
  input: UpsertNyitoEgyenlegInput,
): Promise<{ success?: boolean; id?: number; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const result = await upsertBankszamlaNyitoEgyenlegUseCase(
    { ...input, congregationId: access.effectiveCongregationId },
    { supabase: access.supabase, runtime: 'web', userId: access.user.id },
  )

  if (result.success) revalidatePath('/penzugy')
  return result
}

/**
 * Év eleji állapot ellenőrzés — a könyvelési gyakorlatnak megfelelően.
 * (Részletek a core `checkYearStartStateUseCase` fejléc-kommentjében:
 * FX revaluation DECEMBER 31-re, nem január 1-re — csak ellenőrzünk,
 * NEM könyvelünk.)
 */
export async function checkYearStartState(args: {
  bankszamlaId: number
  eve: number
  newYearValuta: number
  newYearArfolyam: number
}): Promise<{ data?: import('@kartoteka/core').YearStartCheckResult; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  return checkYearStartStateUseCase(
    { congregationId: access.effectiveCongregationId, ...args },
    { supabase: access.supabase, runtime: 'web', userId: access.user.id },
  )
}

// 2026-05-15 (DIAGNOSTICS P1-2): a `previewFxAtYearStart`, `applyFxAtYearStart`,
// `FxYearStartPreview` és a `_legacyApplyFxAtYearStartRemoved` belső helper
// (~170 sor) törölve. A január 1-i FX könyvelés könyvelésileg hibás volt —
// a helyes út a december 31-i FX revaluation a `FxRevaluationDialog`-ban.
// A `checkYearStartState` és a `FxRevaluationDialog` továbbra is működik.
