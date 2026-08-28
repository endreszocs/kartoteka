/**
 * stornoChitantaUseCase — A-M7.2e (2026-04-23).
 *
 * Egy kiállított chitanță (papír-nyugta) sztornózása: `stornozott=true`,
 * `stornozott_at=now()`, `stornozott_indok=<user-input>`.
 *
 * Az RLS (A-M6.2) biztosítja, hogy csak a congregation-scope-ú user tudja
 * sztornózni — a user_id ellenőrzés a szerveren megy.
 *
 * **Online-only** most (A-M7.2d előtt): a sztornó szerver-oldali UPDATE;
 * offline esetén az A-M7.2d-ben érkezik az outbox-wrapper.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  stornoChitantaInputSchema,
  type StornoChitantaInput,
} from '@kartoteka/validations'

import { assertYearsNotFinalizedForDelete } from '../year-lock'

export interface StornoChitantaCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  /** P3-11 (audit 2026-08-28): a stornózó user — `stornozott_by` audit-mező.
   *  Opcionális a meglévő hívók kompatibilitásáért; add át, ahol csak tudod. */
  userId?: string
}

export type StornoChitantaResult =
  | {
      success: true
      /** P3-11: pl. a kapcsolt befizetés aktív maradt — a felület mondja ki. */
      figyelmeztetes?: string
    }
  | {
      success: false
      error: string
      /** Ha true, a hálózat nem elérhető, a UI felajánlja az online-váltást. */
      offlineNotSupported?: boolean
      /** P3-11: a nyugta éve véglegesítve — a stornó blokkolva. */
      yearFinalized?: boolean
    }

export async function stornoChitantaUseCase(
  input: StornoChitantaInput,
  ctx: StornoChitantaCtx,
): Promise<StornoChitantaResult> {
  const parsed = stornoChitantaInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen sztornó input.',
    }
  }
  const clean = parsed.data

  try {
    // P3-11 (audit 2026-08-28): a stornó eddig vakon UPDATE-elt — nem nézte a
    // nyugta évének zárát, nem írt audit-mezőt, és a kapcsolt befizetésről
    // hallgatott. Először felderítjük a sort.
    const { data: sor, error: sorErr } = await ctx.supabase
      .from('oblio_szamlak')
      .select('id, szamla_datum, befizetes_id, stornozott')
      .eq('id', clean.chitantaId)
      .eq('congregation_id', clean.congregationId)
      .eq('tipus', 'chitanta_papir')
      .maybeSingle()
    if (sorErr) {
      if (/fetch|network|connect|timeout/i.test(sorErr.message)) {
        return {
          success: false,
          error:
            'A sztornózás online kapcsolatot igényel. Csatlakozz a hálózatra, és próbáld újra.',
          offlineNotSupported: true,
        }
      }
      return { success: false, error: `Sztornó-hiba: ${sorErr.message}` }
    }
    if (!sor) return { success: false, error: 'A nyugta nem található.' }
    if ((sor as { stornozott?: boolean }).stornozott) {
      return { success: false, error: 'Ez a nyugta már stornózva van.' }
    }

    // ÉV-ZÁR: véglegesített (beküldött) év nyugtája nem érvényteleníthető —
    // a stornó a nyugta-kronológiát és az összesítőket is elmozdítaná.
    const szamlaDatum = (sor as { szamla_datum?: string | null }).szamla_datum
    const lockErr = await assertYearsNotFinalizedForDelete(
      ctx.supabase,
      clean.congregationId,
      [szamlaDatum],
    )
    if (lockErr) return { success: false, error: lockErr, yearFinalized: true }

    const payload: Record<string, unknown> = {
      stornozott: true,
      stornozott_at: new Date().toISOString(),
      stornozott_indok: clean.indok,
    }
    if (ctx.userId) payload.stornozott_by = ctx.userId

    let { error } = await ctx.supabase
      .from('oblio_szamlak')
      .update(payload)
      .eq('id', clean.chitantaId)
      .eq('congregation_id', clean.congregationId)
      .eq('tipus', 'chitanta_papir')

    // Türelmes átmenet: amíg a 2026-08-29-oblio-storno-audit.sql nem futott le
    // élesben, a `stornozott_by` oszlop hiányzik — akkor nélküle stornózunk,
    // hogy a művelet ne akadjon el, de az audit-mező kimaradását kimondjuk.
    let auditKimaradt = false
    if (error && /stornozott_by/.test(error.message)) {
      delete payload.stornozott_by
      auditKimaradt = true
      ;({ error } = await ctx.supabase
        .from('oblio_szamlak')
        .update(payload)
        .eq('id', clean.chitantaId)
        .eq('congregation_id', clean.congregationId)
        .eq('tipus', 'chitanta_papir'))
    }

    if (error) {
      if (/fetch|network|connect|timeout/i.test(error.message)) {
        return {
          success: false,
          error:
            'A sztornózás online kapcsolatot igényel. Csatlakozz a hálózatra, és próbáld újra.',
          offlineNotSupported: true,
        }
      }
      return { success: false, error: `Sztornó-hiba: ${error.message}` }
    }

    // A KAPCSOLT BEFIZETÉS SZÁNDÉKOSAN NEM stornózódik automatikusan (a bevétel
    // attól még valós lehet — pl. új nyugta készül helyette), de a tényt
    // KIMONDJUK, hogy ne maradjon észrevétlen aktív bevétel egy érvénytelen
    // nyugta mögött.
    const figyelmeztetesek: string[] = []
    const befizetesId = (sor as { befizetes_id?: string | number | null }).befizetes_id
    if (befizetesId != null) {
      figyelmeztetesek.push(
        'A nyugtához kapcsolt BEFIZETÉS aktív maradt — ha a bevétel is érvénytelen, ' +
          'stornózd a Pénzügy → Tranzakciók listában.',
      )
    }
    if (auditKimaradt) {
      figyelmeztetesek.push(
        'A stornózó személye (stornozott_by) nem került rögzítésre — futtasd le a ' +
          '2026-08-29-oblio-storno-audit.sql-t.',
      )
    }

    if (figyelmeztetesek.length > 0) {
      return { success: true, figyelmeztetes: figyelmeztetesek.join(' ') }
    }
    return { success: true }
  } catch {
    return {
      success: false,
      error:
        'A sztornózás online kapcsolatot igényel. Csatlakozz a hálózatra, és próbáld újra.',
      offlineNotSupported: true,
    }
  }
}
