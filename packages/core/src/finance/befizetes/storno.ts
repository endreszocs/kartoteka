/**
 * stornoIncomeUseCase — A-M7.3c (2026-04-24).
 *
 * Egy befizetés stornózása (érvénytelenítése, audit-trail megőrzésével).
 * Komplex flow a `apps/web/app/(dashboard)/penzugy/edit-storno-actions.ts`
 * mintája alapján:
 *
 *   1. Zod-validálás (indok min 5 char)
 *   2. A befizetés lekérdezése: `datum`, `belso_mozgas_xkey`, `stornozott`
 *   3. Már-sztornózott → error
 *   4. Év-véglegesítés check (`bealitas.accounting_finalized`) — ha finalized,
 *      blokkoljuk (kivéve ha `skipYearFinalizedCheck=true`)
 *   5. UPDATE payload: stornozott=true, stornozott_at=now(), stornozott_indok, stornozott_by
 *   6. Ha van `belso_mozgas_xkey` (belső kassza↔bank transfer), a párját is
 *      sztornózza (cascadeInternalTransfer default true)
 *   7. Ha vannak kapcsolt chitantak (`oblio_szamlak.befizetes_id = this.id`),
 *      azokat is sztornózza (cascadeChitantas default true)
 *
 * A művelet nem atomikus a szerver-oldalon (több UPDATE); ha bármelyik
 * cascade elbukik, a fő befizetés már sztornózva van — a user a hibaüzenetet
 * látja, manuálisan ellenőrizheti a kapcsolt tételeket.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  stornoIncomeInputSchema,
  type StornoIncomeInput,
} from '@kartoteka/validations'

export interface StornoIncomeCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  /** A sztornózó user UUID — a `stornozott_by` oszlopba megy. */
  userId: string
}

export type StornoIncomeResult =
  | {
      success: true
      /** Kapcsolt chitantak száma, amiket is stornóztunk. */
      cascadedChitantas: number
      /** Belső-mozgás pár is sztornózva (ha volt). */
      cascadedInternalTransfer: boolean
    }
  | {
      success: false
      error: string
      /** A befizetés nem található (másik gyülekezet vagy már törölve). */
      notFound?: boolean
      /** Már sztornózva — újabb stornó értelmetlen. */
      alreadyStorno?: boolean
      /** Az év számadása véglegesítve — blokkolva. */
      yearFinalized?: boolean
    }

/**
 * Egyszerű év-véglegesítés check a `bealitas` táblán. A `bealitas.id`
 * varchar (az év stringként — pl. "2026"). Ha nem találja a sort vagy
 * az `accounting_finalized = false`, return false (nincs blokk).
 */
async function isYearFinalized(
  supabase: SupabaseClient,
  congregationId: string,
  year: number,
): Promise<boolean> {
  const { data } = await supabase
    .from('bealitas')
    .select('accounting_finalized')
    .eq('congregation_id', congregationId)
    .eq('id', String(year))
    .maybeSingle()
  if (!data) return false
  return Boolean((data as { accounting_finalized?: boolean }).accounting_finalized)
}

export async function stornoIncomeUseCase(
  input: StornoIncomeInput,
  ctx: StornoIncomeCtx,
): Promise<StornoIncomeResult> {
  // 1) Zod-validálás
  const parsed = stornoIncomeInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen sztornó input.',
    }
  }
  const clean = parsed.data
  const cascadeChitantas = clean.cascadeChitantas ?? true
  const cascadeInternalTransfer = clean.cascadeInternalTransfer ?? true
  const nowIso = new Date().toISOString()

  try {
    // 2) Befizetés lekérdezése
    const { data: row, error: fetchErr } = await ctx.supabase
      .from('befizetes')
      .select('id, datum, belso_mozgas_xkey, stornozott, deleted')
      .eq('id', clean.befizetesId)
      .eq('congregation_id', clean.congregationId)
      .maybeSingle()

    if (fetchErr) {
      return { success: false, error: `Lekérdezési hiba: ${fetchErr.message}` }
    }
    if (!row) {
      return {
        success: false,
        error: 'A befizetés nem található (talán másik gyülekezeté, vagy már törölték).',
        notFound: true,
      }
    }

    const r = row as {
      id: number
      datum: string | null
      belso_mozgas_xkey: string | null
      stornozott: boolean
      deleted: boolean
    }

    if (r.stornozott) {
      return {
        success: false,
        error: 'Ez a befizetés már sztornózva van.',
        alreadyStorno: true,
      }
    }

    // 3) Év-véglegesítés check
    if (!clean.skipYearFinalizedCheck && r.datum) {
      const year = new Date(r.datum).getFullYear()
      const finalized = await isYearFinalized(ctx.supabase, clean.congregationId, year)
      if (finalized) {
        return {
          success: false,
          error: `A ${year}. évi számadás már véglegesítve van. Kérj javítási engedélyt az egyházmegyétől, mielőtt sztornózol.`,
          yearFinalized: true,
        }
      }
    }

    // 4) Fő UPDATE
    const payload = {
      stornozott: true,
      stornozott_at: nowIso,
      stornozott_indok: clean.indok,
      stornozott_by: ctx.userId,
      updated_at: nowIso,
    }

    const { error: updErr } = await ctx.supabase
      .from('befizetes')
      .update(payload)
      .eq('id', clean.befizetesId)
      .eq('congregation_id', clean.congregationId)

    if (updErr) {
      return { success: false, error: `Sztornó sikertelen: ${updErr.message}` }
    }

    // 5) Belső-mozgás pár sztornózása (ha engedélyezett + van)
    let cascadedInternalTransfer = false
    if (cascadeInternalTransfer && r.belso_mozgas_xkey) {
      const { error: bErr } = await ctx.supabase
        .from('befizetes')
        .update(payload)
        .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
        .eq('congregation_id', clean.congregationId)
        .neq('id', clean.befizetesId) // a már sztornózott fő sort ne zavarjuk
      if (bErr) {
        // A fő sztornó már megtörtént, de a pár nem — logoljuk a hibát a response-ba
        return {
          success: false,
          error: `Fő befizetés sztornózva, de a belső-mozgás pár NEM (${bErr.message}). Kérlek ellenőrizd manuálisan.`,
        }
      }
      cascadedInternalTransfer = true
    }

    // 6) Kapcsolt chitantak sztornózása (ha engedélyezett)
    let cascadedChitantas = 0
    if (cascadeChitantas) {
      const { data: chCount, error: chErr } = await ctx.supabase
        .from('oblio_szamlak')
        .update({
          stornozott: true,
          stornozott_at: nowIso,
          stornozott_indok: `A befizetés stornózva: ${clean.indok}`,
        })
        .eq('befizetes_id', clean.befizetesId)
        .eq('congregation_id', clean.congregationId)
        .eq('stornozott', false) // csak a még-nem-stornózottakat
        .select('id')

      if (chErr) {
        return {
          success: false,
          error: `Fő befizetés sztornózva, de a kapcsolt chitantak NEM (${chErr.message}). Kérlek ellenőrizd manuálisan.`,
        }
      }
      cascadedChitantas = chCount?.length ?? 0
    }

    return {
      success: true,
      cascadedChitantas,
      cascadedInternalTransfer,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Sztornó hiba: ${msg}` }
  }
}
