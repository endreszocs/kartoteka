/**
 * softDeleteIncomeUseCase — A-M7.3c (2026-04-24).
 *
 * Egy befizetés `deleted=true` flag-re állítása. Visszafordítható — a sor
 * a DB-ben marad, csak kiszűrjük a lista-lekérdezésekben (az `includeDeleted`
 * flag-gel nézhető újra).
 *
 * Szemantika: „ez sosem kellett volna, hogy rögzítve legyen" (véletlen
 * dupla-entry, elírás). A sztornó (lásd `stornoIncomeUseCase`) ellenben
 * „érvénytelenítés" — könyvelési fogalom, más szerepe van.
 *
 * A korábbi web `deleteTransaction('befizetes', id)` egyszerű `update({deleted: true})`
 * — a logika ugyanez, csak explicit congregation_id scope-pal és Result-formával.
 *
 * 2026-08-15 (átvilágítás, ⛔1) ÉV-ZÁR: a törlés eddig NEM olvasta a
 * `bealitas.accounting_finalized` zászlót — egyedüliként a pénzügyi írási utak
 * közül. Egy már véglegesített, aláírt és beküldött év nyugtája így némán
 * eltüntethető volt: a kassza-egyenleg, a Registru, a Csoportnapló és a Számadás
 * tény-oszlopa elmozdult, a beküldött papír viszont nem. Mostantól a stornóval
 * AZONOS, fail-closed kaput használ (a közös `../year-lock` helper) — nem másolat.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  softDeleteIncomeInputSchema,
  type SoftDeleteIncomeInput,
} from '@kartoteka/validations'

import { refreshCarryoverBestEffort } from '../bank-import/nyito-egyenleg'
import { assertYearsNotFinalizedForDelete } from '../year-lock'

export interface SoftDeleteIncomeCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  /** P0-3: a carryover-frissítés audit-oszlopaihoz — ha nincs, a frissítés kimarad. */
  userId?: string
}

export type SoftDeleteIncomeResult =
  | { success: true }
  | {
      success: false
      error: string
      notFound?: boolean
      /** Az érintett év számadása véglegesítve — a törlés blokkolva. */
      yearFinalized?: boolean
    }

export async function softDeleteIncomeUseCase(
  input: SoftDeleteIncomeInput,
  ctx: SoftDeleteIncomeCtx,
): Promise<SoftDeleteIncomeResult> {
  const parsed = softDeleteIncomeInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen input.',
    }
  }
  const { congregationId, befizetesId } = parsed.data

  try {
    // 1) A sor dátuma — ez alapján tudjuk, melyik év számadását érintené a törlés.
    const { data: row, error: fetchErr } = await ctx.supabase
      .from('befizetes')
      .select('id, datum, belso_mozgas_xkey, bankszamla_id')
      .eq('id', befizetesId)
      .eq('congregation_id', congregationId)
      .maybeSingle()

    if (fetchErr) {
      return { success: false, error: `Lekérdezési hiba: ${fetchErr.message}` }
    }
    if (!row) {
      return {
        success: false,
        error: 'A befizetés nem található (talán már törölték, vagy nem a te gyülekezeted).',
        notFound: true,
      }
    }

    // ⛔ 2026-08-27 — BELSŐ MOZGÁS PÁR-KASZKÁD.
    // Ez a use-case KORÁBBAN egyetlen sort törölt, a `belso_mozgas_xkey` szót
    // nem is tartalmazta. Egy belső mozgás viszont MINDIG egy bevétel + egy
    // kiadás PÁR: az egyik láb törlése ÁRVA felet hagyott, és a pénz eltűnt az
    // összesítésből. A webes `deleteTransaction` MINDIG helyesen csinálta
    // (mindkét lábat törli ÉS mindkét láb évét ellenőrzi) — a desktop viszont
    // ezen a use-case-en át ment, tehát a két felület MÁST csinált ugyanarra a
    // gombra. Ez a projekt visszatérő hibaosztálya: a második felület a régi
    // implementációt őrzi.
    const bmXkey = (row as { belso_mozgas_xkey?: string | null }).belso_mozgas_xkey ?? null

    // A pár MINDKÉT lábának évét ellenőrizzük: egy évfordulós átvezetés két
    // oldala ELTÉRŐ évre eshet, és a zárt év oldalának eltüntetése ugyanúgy
    // elmozdítaná a már beküldött számadást.
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
        // Fail-closed: ha a párt nem tudjuk felderíteni, azt sem tudjuk, melyik
        // év(ek)et érintené a törlés → NEM törlünk.
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
      const befDel = await ctx.supabase.from('befizetes').update({ deleted: true })
        .eq('belso_mozgas_xkey', bmXkey).eq('congregation_id', congregationId)
      if (befDel.error) {
        return { success: false, error: `Törlés sikertelen: ${befDel.error.message}` }
      }
      const kiaDel = await ctx.supabase.from('kiadas').update({ deleted: true })
        .eq('belso_mozgas_xkey', bmXkey).eq('congregation_id', congregationId)
      if (kiaDel.error) {
        return {
          success: false,
          error:
            `A belső mozgás bevétel-oldala törlődött, a kiadás-oldala viszont NEM ` +
            `(${kiaDel.error.message}). Nézd meg a Belső mozgások listát, és jelezd a rendszergazdának.`,
        }
      }
      // P0-3 (audit 2026-08-28): carryover-frissítés (best-effort) — a pár
      // lábait a helper deríti fel a közös kulcs alapján.
      await refreshCarryoverBestEffort({ congregationId, belsoMozgasXkey: bmXkey }, ctx)
      return { success: true }
    }

    // 3) Maga a soft delete
    const { data, error } = await ctx.supabase
      .from('befizetes')
      .update({ deleted: true })
      .eq('id', befizetesId)
      .eq('congregation_id', congregationId)
      .select('id')
      .maybeSingle()

    if (error) {
      return { success: false, error: `Törlés sikertelen: ${error.message}` }
    }
    if (!data) {
      return {
        success: false,
        error: 'A befizetés nem található (talán már törölték, vagy nem a te gyülekezeted).',
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
