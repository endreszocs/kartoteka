/**
 * undoStornoUseCase — sztornó visszavonása (C-hullám C1c, 2026-06-10).
 *
 * A web `undoStornoTransaction` (apps/web/app/(dashboard)/penzugy/
 * edit-storno-actions.ts) PONTOS tükre, hogy a desktop és a web azonosan
 * viselkedjen:
 *
 *   1. A tétel lekérdezése (befizetes VAGY kiadas tábla, type szerint)
 *   2. Ha nincs sztornózva → értelmetlen a visszavonás (notStorno hiba)
 *   3. Év-véglegesítés check (`bealitas.accounting_finalized`) — lezárt évnél
 *      a sztornó NEM vonható vissza (yearFinalized)
 *   4. Payload: stornozott=false + a sztornó-mezők (at/indok/by) nullázása
 *   5. Ha van `belso_mozgas_xkey` (kassza↔bank transfer), MINDKÉT tábla
 *      (befizetes + kiadas) párját visszavonja az xkey alapján — mint a web
 *
 * FONTOS (paritás): a sztornó kaszkádol a kapcsolt `oblio_szamlak` chitantákra,
 * de a VISSZAVONÁS — a webhez igazodva — NEM állítja vissza azokat. Ha egy
 * befizetéshez chitanta tartozott, annak sztornója kézzel vonható vissza.
 *
 * A művelet nem atomikus (több UPDATE); ha a belső-mozgás pár visszavonása
 * elbukik, a fő tétel már aktív — a user a hibaüzenetet látja.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type UndoStornoType = 'befizetes' | 'kiadas'

export interface UndoStornoInput {
  congregationId: string
  type: UndoStornoType
  /** A befizetes/kiadas sor PK-ja. */
  id: number
}

export interface UndoStornoCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  userId: string
}

export type UndoStornoResult =
  | {
      success: true
      /** Belső-mozgás pár is visszavonva (ha volt). */
      cascadedInternalTransfer: boolean
    }
  | {
      success: false
      error: string
      notFound?: boolean
      /** A tétel nincs sztornózva — nincs mit visszavonni. */
      notStorno?: boolean
      /** Az év számadása véglegesítve — blokkolva. */
      yearFinalized?: boolean
    }

/**
 * Egyszerű év-véglegesítés check a `bealitas` táblán (id = év stringként).
 * Ha nincs sor vagy `accounting_finalized=false`, return false (nincs blokk).
 * A `befizetes/storno.ts` ugyanezt a logikát használja.
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

export async function undoStornoUseCase(
  input: UndoStornoInput,
  ctx: UndoStornoCtx,
): Promise<UndoStornoResult> {
  // 1) Alap-validálás (kézi — az input triviális)
  if (!input.congregationId || typeof input.congregationId !== 'string') {
    return { success: false, error: 'Hiányzó gyülekezet-azonosító.' }
  }
  if (input.type !== 'befizetes' && input.type !== 'kiadas') {
    return { success: false, error: 'Érvénytelen tétel-típus.' }
  }
  if (!Number.isInteger(input.id) || input.id <= 0) {
    return { success: false, error: 'Érvénytelen tétel-azonosító.' }
  }

  const table = input.type === 'befizetes' ? 'befizetes' : 'kiadas'
  const nowIso = new Date().toISOString()

  try {
    // 2) Tétel lekérdezése
    const { data: row, error: fetchErr } = await ctx.supabase
      .from(table)
      .select('id, datum, belso_mozgas_xkey, stornozott')
      .eq('id', input.id)
      .eq('congregation_id', input.congregationId)
      .maybeSingle()

    if (fetchErr) {
      return { success: false, error: `Lekérdezési hiba: ${fetchErr.message}` }
    }
    if (!row) {
      return {
        success: false,
        error: 'A tétel nem található (talán másik gyülekezeté, vagy törölve).',
        notFound: true,
      }
    }

    const r = row as {
      id: number
      datum: string | null
      belso_mozgas_xkey: string | null
      stornozott: boolean
    }

    if (!r.stornozott) {
      return {
        success: false,
        error: 'Ez a tétel nincs sztornózva — nincs mit visszavonni.',
        notStorno: true,
      }
    }

    // 3) Év-véglegesítés check
    if (r.datum) {
      const year = new Date(r.datum).getFullYear()
      const finalized = await isYearFinalized(ctx.supabase, input.congregationId, year)
      if (finalized) {
        return {
          success: false,
          error: `A ${year}. évi számadás véglegesítve van — a sztornó nem vonható vissza.`,
          yearFinalized: true,
        }
      }
    }

    // 4) Visszavonás-payload (a sztornó-mezők nullázása)
    const payload = {
      stornozott: false,
      stornozott_at: null,
      stornozott_indok: null,
      stornozott_by: null,
      updated_at: nowIso,
    }

    // 5) Belső-mozgás pár → MINDKÉT tábla az xkey alapján (mint a web)
    let cascadedInternalTransfer = false
    if (r.belso_mozgas_xkey) {
      const { error: bErr } = await ctx.supabase
        .from('befizetes')
        .update(payload)
        .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
        .eq('congregation_id', input.congregationId)
      if (bErr) {
        return { success: false, error: `Visszavonás sikertelen (befizetés-oldal): ${bErr.message}` }
      }
      const { error: kErr } = await ctx.supabase
        .from('kiadas')
        .update(payload)
        .eq('belso_mozgas_xkey', r.belso_mozgas_xkey)
        .eq('congregation_id', input.congregationId)
      if (kErr) {
        return { success: false, error: `Visszavonás sikertelen (kiadás-oldal): ${kErr.message}` }
      }
      cascadedInternalTransfer = true
    } else {
      const { error: updErr } = await ctx.supabase
        .from(table)
        .update(payload)
        .eq('id', input.id)
        .eq('congregation_id', input.congregationId)
      if (updErr) {
        return { success: false, error: `Visszavonás sikertelen: ${updErr.message}` }
      }
    }

    return { success: true, cascadedInternalTransfer }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Visszavonás hiba: ${msg}` }
  }
}
