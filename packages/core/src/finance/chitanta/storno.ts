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

export interface StornoChitantaCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type StornoChitantaResult =
  | { success: true }
  | {
      success: false
      error: string
      /** Ha true, a hálózat nem elérhető, a UI felajánlja az online-váltást. */
      offlineNotSupported?: boolean
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
    const { error } = await ctx.supabase
      .from('oblio_szamlak')
      .update({
        stornozott: true,
        stornozott_at: new Date().toISOString(),
        stornozott_indok: clean.indok,
      })
      .eq('id', clean.chitantaId)
      .eq('congregation_id', clean.congregationId)
      .eq('tipus', 'chitanta_papir')

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
