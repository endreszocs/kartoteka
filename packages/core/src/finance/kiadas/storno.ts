/**
 * stornoExpenseUseCase — A-M7.4c (2026-04-24).
 *
 * A `stornoIncomeUseCase` tükörképe a `kiadas` táblára. A befizetés-sztornó-
 * hoz képest egyszerűbb:
 *
 *   - NINCS chitanta cascade (a kiadás nem ad ki papír-nyugtát)
 *   - VAN belső-mozgás pár cascade (`belso_mozgas_xkey`)
 *   - `kiadasikiseroiv` táblához NINCS cascade — annak nincs stornozott oszlopa
 *
 * Évzárás check (`bealitas.accounting_finalized`) a befizetéshez hasonlóan.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  stornoExpenseInputSchema,
  type StornoExpenseInput,
} from '@kartoteka/validations'

import { refreshCarryoverBestEffort } from '../bank-import/nyito-egyenleg'
import { belsoMozgasParEvei } from '../belsomozgas/par-evei'
import { readYearFinalized } from '../year-lock'

export interface StornoExpenseCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  /** Sztornózó user UUID — `stornozott_by`. */
  userId: string
}

export type StornoExpenseResult =
  | {
      success: true
      cascadedInternalTransfer: boolean
    }
  | {
      success: false
      error: string
      notFound?: boolean
      alreadyStorno?: boolean
      yearFinalized?: boolean
    }

// 2026-08-11 (5. kör, P0 zárás-integritás): itt egy SAJÁT `isYearFinalized`
// helper állt — `const { data } = await …` + `if (!data) return false` —, ami az
// `error`-t ELDOBTA. A `false` jelentése „az év NINCS véglegesítve", tehát a
// `bealitas` olvasásának bármilyen hibája (RLS-szigorítás, oszlop-átnevezés,
// kettőzött `bealitas` sor → maybeSingle-hiba, hálózati hiba) NÉMÁN
// ENGEDÉLYEZTE a már véglegesített ÉS az egyházmegyének beküldött év kiadásának
// sztornózását: a beküldött, aláírt számadás és az adatbázis csendben
// széthúzott. Zárás-integritási kapunál a fail-CLOSED az egyetlen helyes
// alapértelmezés — inkább meghiúsuló művelet, mint hamis „nyitva az év".
//
// Javítás: a közös, FAIL-CLOSED `readYearFinalized` (../year-lock). A „nincs
// `bealitas` sor erre az évre" NEM hibaág (`maybeSingle` → `data: null,
// error: null`) → `finalized: false`; csak a VALÓDI lekérdezési hiba jön vissza
// `unknown: true`-val, azt elutasításként kezeljük.

export async function stornoExpenseUseCase(
  input: StornoExpenseInput,
  ctx: StornoExpenseCtx,
): Promise<StornoExpenseResult> {
  const parsed = stornoExpenseInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen sztornó input.',
    }
  }
  const clean = parsed.data
  const cascadeInternalTransfer = clean.cascadeInternalTransfer ?? true
  const nowIso = new Date().toISOString()

  try {
    // 1) Kiadás lekérdezése
    const { data: row, error: fetchErr } = await ctx.supabase
      .from('kiadas')
      .select('id, datum, belso_mozgas_xkey, stornozott, deleted, bankszamla_id')
      .eq('id', clean.kiadasId)
      .eq('congregation_id', clean.congregationId)
      .maybeSingle()

    if (fetchErr) {
      return { success: false, error: `Lekérdezési hiba: ${fetchErr.message}` }
    }
    if (!row) {
      return {
        success: false,
        error: 'A kiadás nem található (talán másik gyülekezeté, vagy már törölték).',
        notFound: true,
      }
    }

    const r = row as {
      id: number
      datum: string | null
      belso_mozgas_xkey: string | null
      stornozott: boolean
      deleted: boolean
      bankszamla_id: number | null
    }

    if (r.stornozott) {
      return {
        success: false,
        error: 'Ez a kiadás már sztornózva van.',
        alreadyStorno: true,
      }
    }

    // 2) Év-véglegesítés check (fail-CLOSED, lásd a fenti 2026-08-11 megjegyzést)
    // D6 (audit 2026-08-28, web-paritás): kaszkádnál a pár MINDKÉT lábának
    // évére — évfordulós átvezetésnél a másik láb MÁS (akár lezárt) évre eshet.
    // P4-27 (audit 2026-08-28): a skipYearFinalizedCheck bypass kivezetve —
    // az év-zár mindig érvényes.
    if (r.datum) {
      const evek = new Set<number>([new Date(r.datum).getFullYear()])
      if (cascadeInternalTransfer && r.belso_mozgas_xkey) {
        const par = await belsoMozgasParEvei(
          ctx.supabase, clean.congregationId, r.belso_mozgas_xkey, r.datum,
        )
        if ('error' in par) return { success: false, error: par.error }
        for (const y of par.evek) evek.add(y)
      }
      for (const year of evek) {
        const lock = await readYearFinalized(ctx.supabase, clean.congregationId, year)
        if (lock.unknown) {
          return {
            success: false,
            error:
              `A ${year}. évi számadás zárás-állapotát most nem sikerült ellenőrizni ` +
              `(${lock.errorMessage || 'ismeretlen hiba'}), ezért a sztornót biztonságból ` +
              'megszakítottuk — egy már lezárt évet nem nyithatunk ki véletlenül. Ellenőrizd ' +
              'az internetkapcsolatot, és próbáld újra; ha újra hibázik, jelezd a rendszergazdának.',
          }
        }
        if (lock.finalized) {
          return {
            success: false,
            error: `A ${year}. évi számadás már véglegesítve van. Kérj javítási engedélyt az egyházmegyétől, mielőtt sztornózol.`,
            yearFinalized: true,
          }
        }
      }
    }

    // 3) Fő UPDATE
    const payload = {
      stornozott: true,
      stornozott_at: nowIso,
      stornozott_indok: clean.indok,
      stornozott_by: ctx.userId,
      updated_at: nowIso,
    }

    const { error: updErr } = await ctx.supabase
      .from('kiadas')
      .update(payload)
      .eq('id', clean.kiadasId)
      .eq('congregation_id', clean.congregationId)

    if (updErr) {
      return { success: false, error: `Sztornó sikertelen: ${updErr.message}` }
    }

    // 4) Belső-mozgás pár sztornózása (ha engedélyezett + van)
    let cascadedInternalTransfer = false
    if (cascadeInternalTransfer && r.belso_mozgas_xkey) {
      // A belső mozgás párja lehet `befizetes` (bank→kassza esetén) VAGY
      // `kiadas` (kassza→bank esetén) táblában. Mindkettőt frissítjük, de
      // a magunkét (az eredeti id) kihagyjuk.
      const bErr1 = await ctx.supabase
        .from('kiadas')
        .update(payload)
        .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
        .eq('congregation_id', clean.congregationId)
        .neq('id', clean.kiadasId)
      const bErr2 = await ctx.supabase
        .from('befizetes')
        .update(payload)
        .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
        .eq('congregation_id', clean.congregationId)

      if (bErr1.error || bErr2.error) {
        const msg = bErr1.error?.message || bErr2.error?.message || 'ismeretlen'
        return {
          success: false,
          error: `Fő kiadás sztornózva, de a belső-mozgás pár NEM (${msg}). Kérlek ellenőrizd manuálisan.`,
        }
      }
      cascadedInternalTransfer = true
    }

    // P0-3 (audit 2026-08-28): a köv. évi carryover banki nyitó frissítése
    // (best-effort — hibája nem buktatja a sztornót).
    await refreshCarryoverBestEffort(
      {
        congregationId: clean.congregationId,
        tetelek: [{ bankszamla_id: r.bankszamla_id, datum: r.datum }],
        belsoMozgasXkey: cascadedInternalTransfer ? r.belso_mozgas_xkey : null,
      },
      ctx,
    )

    return {
      success: true,
      cascadedInternalTransfer,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Sztornó hiba: ${msg}` }
  }
}
