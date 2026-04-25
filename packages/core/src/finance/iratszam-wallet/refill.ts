/**
 * refillIratszamWalletUseCase — A-M7.9a (2026-04-25).
 *
 * A kliens offline iratszám-tárcájának feltöltése a befizetés és kiadás
 * Készpénzes mentéséhez. A szerveren atomikusan
 * `reserve_iratszam(p_congregation_id, p_tipus, p_ev, p_count)` RPC-t hív,
 * és visszaadja a lefoglalt sorszámokat. A hívó (desktop) tárolja el a
 * sorszámokat a lokális `iratszam_wallet_local` táblában.
 *
 * **Online-kötelező**: a foglalás csak hálózati kapcsolattal lehetséges,
 * mert a szerver-oldali pointer (`iratszam_pointers.next_szam`) atomikus
 * inkrementálása biztosítja a párhuzamos foglalások konzisztenciáját.
 *
 * Analóg a `refillChitantaWalletUseCase`-szel (lásd
 * `chitanta-wallet/refill.ts`), de:
 *   - Két típust kezel: `'befizetes'` és `'kiadas'`
 *   - Évhez kötött (a chitantánál sorozat-hez)
 *   - Közös a két entitás között → kiadás-write (A-M7.9b) ugyanezt használja
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type IratszamTipus = 'befizetes' | 'kiadas'

export interface RefillIratszamWalletInput {
  congregationId: string
  tipus: IratszamTipus
  /** Az év, amelyhez a sorszámok tartoznak (befizetés `fizetettev`, kiadás `EXTRACT(YEAR FROM datum)`). */
  ev: number
  /** Hány sorszámot kérünk (1–100). */
  count: number
}

export interface RefillIratszamWalletCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type RefillIratszamWalletResult =
  | {
      success: true
      /** Az újonnan lefoglalt sorszámok, növekvő sorrendben. */
      numbers: number[]
      tipus: IratszamTipus
      ev: number
    }
  | {
      success: false
      error: string
      /** Ha true, a hálózat nem elérhető — a UI felajánlja az online-váltást. */
      offlineNotSupported?: boolean
    }

const MIN_COUNT = 1
const MAX_COUNT = 100
const MIN_EV = 2000
const MAX_EV = 2100

export async function refillIratszamWalletUseCase(
  input: RefillIratszamWalletInput,
  ctx: RefillIratszamWalletCtx,
): Promise<RefillIratszamWalletResult> {
  if (!input.congregationId) {
    return { success: false, error: 'Hiányzó congregation_id.' }
  }
  if (input.tipus !== 'befizetes' && input.tipus !== 'kiadas') {
    return {
      success: false,
      error: `Ismeretlen iratszám-típus: '${input.tipus}'. Várt: 'befizetes' vagy 'kiadas'.`,
    }
  }
  const ev = Number(input.ev)
  if (!Number.isInteger(ev) || ev < MIN_EV || ev > MAX_EV) {
    return {
      success: false,
      error: `Az év érvénytelen (${input.ev}). ${MIN_EV}–${MAX_EV} közötti egész számot várok.`,
    }
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

  try {
    const { data, error } = await ctx.supabase.rpc('reserve_iratszam', {
      p_congregation_id: input.congregationId,
      p_tipus: input.tipus,
      p_ev: ev,
      p_count: count,
    })

    if (error) {
      if (/fetch|network|connect|timeout/i.test(error.message)) {
        return {
          success: false,
          error:
            'Az iratszám-tárca feltöltéséhez internetes kapcsolat szükséges. Csatlakozz a hálózatra, és próbáld újra.',
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

    return { success: true, numbers, tipus: input.tipus, ev }
  } catch {
    return {
      success: false,
      error:
        'Az iratszám-tárca feltöltéséhez internetes kapcsolat szükséges. Csatlakozz a hálózatra, és próbáld újra.',
      offlineNotSupported: true,
    }
  }
}
