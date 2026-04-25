/**
 * refillChitantaWalletUseCase — A-M7.2d1 (2026-04-24).
 *
 * A kliens offline szám-tárcájának feltöltése: a szerveren atomikusan
 * `reserve_chitanta_numbers(p_congregation_id, p_sorozat, p_count)` RPC-t
 * hív, és visszaadja a lefoglalt sorszámokat. A hívó (desktop) oldal
 * tárolja el a sorszámokat a lokális `chitanta_wallet_local` táblában.
 *
 * **Online-kötelező**: a foglalás csak hálózati kapcsolattal lehetséges,
 * mert a szerver-oldali pointer (`oblio_fiokok.chitanta_kovetkezo_szam`)
 * mindkét flow (wallet és online-issue) számára egy, az ütközést a row-lock
 * biztosítja. Offline-módban a user csak a meglévő wallet-számokat használja.
 *
 * A sorszámokat a walletben 1-1 állapotúak:
 *   - available (`used=0`) — még nem használta
 *   - used (`used=1`, `used_at` + `used_for_chitanta_local_id`) — elkülönítve
 *     az A-M7.2d2 offline-issue-logika egyes rekordjaihoz rendelve
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface RefillChitantaWalletInput {
  congregationId: string
  /** Sorozat (pl. "EREKC24"). Ha nincs megadva, az RPC 'CHIT' fallback-et használ. */
  sorozat?: string
  /** Hány sorszámot kérünk (1–100). */
  count: number
}

export interface RefillChitantaWalletCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type RefillChitantaWalletResult =
  | {
      success: true
      /** Az újonnan lefoglalt sorszámok, növekvő sorrendben. */
      numbers: number[]
      /** A használt sorozat (default-eltés után). */
      sorozat: string
    }
  | {
      success: false
      error: string
      /** Ha true, a hálózat nem elérhető — a UI felajánlja az online-váltást. */
      offlineNotSupported?: boolean
    }

const MIN_COUNT = 1
const MAX_COUNT = 100

export async function refillChitantaWalletUseCase(
  input: RefillChitantaWalletInput,
  ctx: RefillChitantaWalletCtx,
): Promise<RefillChitantaWalletResult> {
  if (!input.congregationId) {
    return { success: false, error: 'Hiányzó congregation_id.' }
  }
  const count = Number(input.count)
  if (!Number.isInteger(count) || count < MIN_COUNT) {
    return {
      success: false,
      error: `A foglalás legalább ${MIN_COUNT} sorszám legyen.`,
    }
  }
  if (count > MAX_COUNT) {
    return {
      success: false,
      error: `Egyszerre legfeljebb ${MAX_COUNT} sorszám foglalható.`,
    }
  }

  const sorozat = (input.sorozat || '').trim() || 'CHIT'

  try {
    const { data, error } = await ctx.supabase.rpc('reserve_chitanta_numbers', {
      p_congregation_id: input.congregationId,
      p_sorozat: sorozat,
      p_count: count,
    })

    if (error) {
      if (/fetch|network|connect|timeout/i.test(error.message)) {
        return {
          success: false,
          error:
            'A szám-tárca feltöltéséhez internetes kapcsolat szükséges. Csatlakozz a hálózatra, és próbáld újra.',
          offlineNotSupported: true,
        }
      }
      return { success: false, error: `Foglalás hiba: ${error.message}` }
    }

    if (!Array.isArray(data)) {
      return {
        success: false,
        error: 'A szerver érvénytelen választ adott a foglalásra.',
      }
    }

    const numbers = data.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    if (numbers.length !== count) {
      return {
        success: false,
        error: `A szerver ${numbers.length} számot adott a kért ${count} helyett.`,
      }
    }

    return { success: true, numbers, sorozat }
  } catch {
    return {
      success: false,
      error:
        'A szám-tárca feltöltéséhez internetes kapcsolat szükséges. Csatlakozz a hálózatra, és próbáld újra.',
      offlineNotSupported: true,
    }
  }
}
