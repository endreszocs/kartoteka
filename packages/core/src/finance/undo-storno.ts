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

import { refreshCarryoverBestEffort } from './bank-import/nyito-egyenleg'
import { belsoMozgasParEvei } from './belsomozgas/par-evei'
import { readYearFinalized } from './year-lock'

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

// 2026-08-11 (5. kör, P0 zárás-integritás): itt egy SAJÁT `isYearFinalized`
// helper állt — `const { data } = await …` + `if (!data) return false` —, ami az
// `error`-t ELDOBTA. A `false` jelentése „az év NINCS véglegesítve", vagyis a
// `bealitas` olvasásának bármilyen hibája (RLS, séma-drift, kettőzött sor,
// hálózat) NÉMÁN ENGEDÉLYEZTE, hogy egy már véglegesített és az egyházmegyének
// beküldött évben visszavonják a sztornót — a beküldött snapshot és az élő
// adatbázis csendben széthúzott. Zárás-integritási kapunál a fail-OPEN a
// legrosszabb alapértelmezés; itt csak a fail-CLOSED helyes.
//
// Javítás: a közös, FAIL-CLOSED `readYearFinalized` (./year-lock). A „nincs
// `bealitas` sor erre az évre" továbbra sem hiba (`maybeSingle` → `data: null,
// error: null`) → `finalized: false`; csak a VALÓDI lekérdezési hiba ad
// `unknown: true`-t, amit elutasításként kezelünk.

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
      .select('id, datum, belso_mozgas_xkey, stornozott, bankszamla_id')
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
      bankszamla_id: number | null
    }

    if (!r.stornozott) {
      return {
        success: false,
        error: 'Ez a tétel nincs sztornózva — nincs mit visszavonni.',
        notStorno: true,
      }
    }

    // 3) Év-véglegesítés check (fail-CLOSED, lásd a fenti 2026-08-11 megjegyzést)
    // D6 (audit 2026-08-28, web-paritás): párnál a visszavonás MINDKÉT lábat
    // átírja — a másik láb MÁS (akár lezárt) évre eshet, azt is ellenőrizzük.
    if (r.datum) {
      const evek = new Set<number>([new Date(r.datum).getFullYear()])
      if (r.belso_mozgas_xkey) {
        const par = await belsoMozgasParEvei(
          ctx.supabase, input.congregationId, r.belso_mozgas_xkey, r.datum,
        )
        if ('error' in par) return { success: false, error: par.error }
        for (const y of par.evek) evek.add(y)
      }
      for (const year of evek) {
        const lock = await readYearFinalized(ctx.supabase, input.congregationId, year)
        if (lock.unknown) {
          return {
            success: false,
            error:
              `A ${year}. évi számadás zárás-állapotát most nem sikerült ellenőrizni ` +
              `(${lock.errorMessage || 'ismeretlen hiba'}), ezért a sztornó visszavonását ` +
              'biztonságból megszakítottuk — egy már lezárt évet nem nyithatunk ki véletlenül. ' +
              'Ellenőrizd az internetkapcsolatot, és próbáld újra; ha újra hibázik, jelezd a ' +
              'rendszergazdának.',
          }
        }
        if (lock.finalized) {
          return {
            success: false,
            error: `A ${year}. évi számadás véglegesítve van — a sztornó nem vonható vissza. Kérj feloldást (javítási engedélyt) az egyházmegyétől.`,
            yearFinalized: true,
          }
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

    // P0-3 (audit 2026-08-28): a köv. évi carryover banki nyitó frissítése
    // (best-effort — hibája nem buktatja a visszavonást).
    await refreshCarryoverBestEffort(
      {
        congregationId: input.congregationId,
        tetelek: [{ bankszamla_id: r.bankszamla_id, datum: r.datum }],
        belsoMozgasXkey: cascadedInternalTransfer ? r.belso_mozgas_xkey : null,
      },
      ctx,
    )

    return { success: true, cascadedInternalTransfer }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Visszavonás hiba: ${msg}` }
  }
}
