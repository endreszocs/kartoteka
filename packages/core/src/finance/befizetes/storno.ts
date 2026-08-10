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

import { readYearFinalized } from '../year-lock'

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

// 2026-08-11 (5. kör, P0 zárás-integritás): itt egy SAJÁT `isYearFinalized`
// helper állt — `const { data } = await …` + `if (!data) return false` —, ami az
// `error`-t ELDOBTA. A `false` jelentése „az év NINCS véglegesítve", vagyis a
// `bealitas` olvasásának bármilyen hibája (RLS-szigorítás, oszlop-átnevezés,
// kettőzött `bealitas` sor → maybeSingle-hiba, hálózati hiba) NÉMÁN
// ENGEDÉLYEZTE, hogy egy már véglegesített ÉS az egyházmegyének beküldött év
// befizetését sztornózzák — a kaszkád ráadásul a kapcsolt chitantákat is
// sztornózza, tehát a papíron kiadott nyugták is érvénytelenné váltak volna a
// beküldött számadás mögött. Zárás-integritási kapunál a fail-CLOSED az egyetlen
// helyes alapértelmezés.
//
// Javítás: a közös, FAIL-CLOSED `readYearFinalized` (../year-lock). A „nincs
// `bealitas` sor erre az évre" NEM hibaág (`maybeSingle` → `data: null,
// error: null`) → `finalized: false`; csak a VALÓDI lekérdezési hiba ad
// `unknown: true`-t, amit elutasításként kezelünk.

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

    // 3) Év-véglegesítés check (fail-CLOSED, lásd a fenti 2026-08-11 megjegyzést)
    if (!clean.skipYearFinalizedCheck && r.datum) {
      const year = new Date(r.datum).getFullYear()
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
