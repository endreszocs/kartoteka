/**
 * getFamilyIdForPersonUseCase — A-M7.3b (2026-04-24).
 *
 * Egy tag ID-ból megadja a hozzá tartozó család ID-t (ha van). A
 * befizetés-form használja: ha a user tag-et választ, a form automatikusan
 * ajánlja a család-befizetést is, feltéve hogy a tag családba tartozik.
 *
 * Logika (a web-oldali `getFamilyIdForPerson` portja):
 *   1. A `csalad` táblában a tag mint `id_ferfi` VAGY `id_no` (házas szülő)
 *   2. Ha nem, a `gyerek` táblában a tag mint `id_szemely` (gyerek → csalad.id)
 *   3. Ha sehol, null
 *
 * A `congregationId` paraméter biztonsági réteg: csak a saját gyülekezet
 * családjait engedjük visszaadni (RLS egyébként védi, de explicit filter
 * a use-case-ben egyértelmű).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  familyIdForPersonInputSchema,
  type FamilyIdForPersonInput,
} from '@kartoteka/validations'

export interface FamilyIdForPersonCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type FamilyIdForPersonResult =
  | { success: true; familyId: number | null }
  | { success: false; error: string }

export async function getFamilyIdForPersonUseCase(
  input: FamilyIdForPersonInput,
  ctx: FamilyIdForPersonCtx,
): Promise<FamilyIdForPersonResult> {
  const parsed = familyIdForPersonInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen input.',
    }
  }
  const { congregationId, personId } = parsed.data

  try {
    // 1) Mint szülő (férj vagy feleség)
    const parentRes = await ctx.supabase
      .from('csalad')
      .select('id')
      .eq('congregation_id', congregationId)
      .or(`id_ferfi.eq.${personId},id_no.eq.${personId}`)
      .limit(1)

    if (parentRes.error) {
      return {
        success: false,
        error: `Család-lekérdezés hiba: ${parentRes.error.message}`,
      }
    }
    if (parentRes.data && parentRes.data.length > 0) {
      return {
        success: true,
        familyId: Number((parentRes.data[0] as { id: number }).id),
      }
    }

    // 2) Mint gyerek — a `gyerek` táblán keresztül (a szemely mint id_szemely)
    const childRes = await ctx.supabase
      .from('gyerek')
      .select('id_csalad')
      .eq('id_szemely', personId)
      .limit(1)

    if (childRes.error) {
      return {
        success: false,
        error: `Gyerek-lekérdezés hiba: ${childRes.error.message}`,
      }
    }
    if (childRes.data && childRes.data.length > 0) {
      const fid = (childRes.data[0] as { id_csalad: number | null }).id_csalad
      return { success: true, familyId: fid ?? null }
    }

    // 3) Sehol — nincs család
    return { success: true, familyId: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return {
      success: false,
      error: `Család-lekérdezés hiba (valószínűleg nincs internet): ${msg}`,
    }
  }
}
