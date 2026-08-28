/**
 * softDeleteExpenseUseCase — A-M7.4c (2026-04-24).
 *
 * A `kiadas` sor `deleted=true` flag-re állítása. A `softDeleteIncomeUseCase`
 * tükörképe; visszafordítható.
 *
 * 2026-08-15 (átvilágítás, ⛔1) ÉV-ZÁR: a törlés eddig NEM olvasta a
 * `bealitas.accounting_finalized` zászlót, így egy már véglegesített, aláírt és
 * az egyházmegyének beküldött év kiadása némán eltüntethető volt (a kassza- és
 * bankegyenleg, a Registru és a Számadás tény-oszlopa elmozdult, a beküldött
 * papír nem). Mostantól a stornóval AZONOS, fail-closed kapun megy át — a közös
 * `../year-lock` helperrel, nem másolattal.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  softDeleteExpenseInputSchema,
  type SoftDeleteExpenseInput,
} from '@kartoteka/validations'

import { refreshCarryoverBestEffort } from '../bank-import/nyito-egyenleg'
import { assertYearsNotFinalizedForDelete } from '../year-lock'

export interface SoftDeleteExpenseCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  /** P0-3: a carryover-frissítés audit-oszlopaihoz — ha nincs, a frissítés kimarad. */
  userId?: string
}

export type SoftDeleteExpenseResult =
  | { success: true }
  | {
      success: false
      error: string
      notFound?: boolean
      /** Az érintett év számadása véglegesítve — a törlés blokkolva. */
      yearFinalized?: boolean
    }

export async function softDeleteExpenseUseCase(
  input: SoftDeleteExpenseInput,
  ctx: SoftDeleteExpenseCtx,
): Promise<SoftDeleteExpenseResult> {
  const parsed = softDeleteExpenseInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen input.',
    }
  }
  const { congregationId, kiadasId } = parsed.data

  try {
    // 1) A sor dátuma — ez alapján tudjuk, melyik év számadását érintené a törlés.
    const { data: row, error: fetchErr } = await ctx.supabase
      .from('kiadas')
      .select('id, datum, belso_mozgas_xkey, bankszamla_id')
      .eq('id', kiadasId)
      .eq('congregation_id', congregationId)
      .maybeSingle()

    if (fetchErr) {
      return { success: false, error: `Lekérdezési hiba: ${fetchErr.message}` }
    }
    if (!row) {
      return {
        success: false,
        error: 'A kiadás nem található (talán már törölték, vagy nem a te gyülekezeted).',
        notFound: true,
      }
    }

    // ⛔ 2026-08-27 — BELSŐ MOZGÁS PÁR-KASZKÁD (lásd a befizetes/soft-delete.ts
    // azonos blokkját). Ez a use-case korábban egyetlen sort törölt, a
    // `belso_mozgas_xkey` szót nem is tartalmazta → ÁRVA felet hagyott.
    // A webes `deleteTransaction` mindig helyesen csinálta; a desktop viszont
    // ezen ment át, tehát a két felület MÁST csinált ugyanarra a gombra.
    const bmXkey = (row as { belso_mozgas_xkey?: string | null }).belso_mozgas_xkey ?? null

    // A pár MINDKÉT lábának évét ellenőrizzük — egy évfordulós átvezetés két
    // oldala ELTÉRŐ évre eshet.
    const datesToCheck: Array<string | null | undefined> = [
      (row as { datum?: string | null }).datum,
    ]
    if (bmXkey) {
      const [befRes, kiaRes] = await Promise.all([
        ctx.supabase.from('befizetes').select('datum')
          .eq('belso_mozgas_xkey', bmXkey).eq('congregation_id', congregationId),
        ctx.supabase.from('kiadas').select('datum')
          .eq('belso_mozgas_xkey', bmXkey).eq('congregation_id', congregationId),
      ])
      if (befRes.error || kiaRes.error) {
        const msg = befRes.error?.message || kiaRes.error?.message || 'ismeretlen'
        return {
          success: false,
          error:
            `A belső mozgás párjának ellenőrzése nem sikerült (${msg}), ezért a törlést ` +
            'biztonságból megszakítottuk. Próbáld újra; ha újra hibázik, jelezd a rendszergazdának.',
        }
      }
      for (const p of [...(befRes.data || []), ...(kiaRes.data || [])]) {
        datesToCheck.push((p as { datum?: string | null }).datum)
      }
    }

    // 2) ÉV-ZÁR (fail-closed) — lásd a fájl fejlécének 2026-08-15-i bejegyzését.
    const lockError = await assertYearsNotFinalizedForDelete(ctx.supabase, congregationId, datesToCheck)
    if (lockError) {
      return { success: false, error: lockError, yearFinalized: true }
    }

    // 2b) Ha belső mozgás: MINDKÉT lábat töröljük, közös kulcs alapján.
    if (bmXkey) {
      const kiaDel = await ctx.supabase.from('kiadas').update({ deleted: true })
        .eq('belso_mozgas_xkey', bmXkey).eq('congregation_id', congregationId)
      if (kiaDel.error) {
        return { success: false, error: `Törlés sikertelen: ${kiaDel.error.message}` }
      }
      const befDel = await ctx.supabase.from('befizetes').update({ deleted: true })
        .eq('belso_mozgas_xkey', bmXkey).eq('congregation_id', congregationId)
      if (befDel.error) {
        return {
          success: false,
          error:
            `A belső mozgás kiadás-oldala törlődött, a bevétel-oldala viszont NEM ` +
            `(${befDel.error.message}). Nézd meg a Belső mozgások listát, és jelezd a rendszergazdának.`,
        }
      }
      // P0-3 (audit 2026-08-28): carryover-frissítés (best-effort) — a pár
      // lábait a helper deríti fel a közös kulcs alapján.
      await refreshCarryoverBestEffort({ congregationId, belsoMozgasXkey: bmXkey }, ctx)
      return { success: true }
    }

    // 3) Maga a soft delete
    const { data, error } = await ctx.supabase
      .from('kiadas')
      .update({ deleted: true })
      .eq('id', kiadasId)
      .eq('congregation_id', congregationId)
      .select('id')
      .maybeSingle()

    if (error) {
      return { success: false, error: `Törlés sikertelen: ${error.message}` }
    }
    if (!data) {
      return {
        success: false,
        error: 'A kiadás nem található (talán már törölték, vagy nem a te gyülekezeted).',
        notFound: true,
      }
    }

    // P0-3 (audit 2026-08-28): carryover-frissítés (best-effort).
    await refreshCarryoverBestEffort(
      {
        congregationId,
        tetelek: [
          {
            bankszamla_id: (row as { bankszamla_id?: number | null }).bankszamla_id,
            datum: (row as { datum?: string | null }).datum,
          },
        ],
      },
      ctx,
    )

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Törlési hiba: ${msg}` }
  }
}
