/**
 * Gyülekezeti szervezeti forma (anya–leány–missziói) kötés-kezelő — TÍPUSOK
 * (2026-08-25, gyülekezeti egységek 3.1).
 *
 * ⚠️ Next.js 16: a `use server` fájl (szervezet-kotes-actions.ts) CSAK async
 *    függvényt exportálhat — a típusok ezért élnek itt. Ez a fájl importálhat
 *    (a selftest csak a szervezet-shared.ts import-mentességét követeli meg).
 */

import type { SzervezetiTipus } from '@/lib/gyulekezet/egysegek-shared'

export interface SetCongregationSzervezetInput {
  congregationId: string
  szervezetiTipus: SzervezetiTipus
  /**
   * Csak `'leany'` típusnál kötelező (és akkor KÖTELEZŐ is); `'anya'` /
   * `'misszioi'` esetén `null`.
   */
  anyaCongregationId: string | null
}

export interface SetCongregationSzervezetResult {
  /** Magyar siker-üzenet (toast). */
  success?: string
  /**
   * Magyar hibaüzenet. A DB őr-trigger (congregations_szervezet_guard) magyar
   * RAISE-üzenetei VÁLTOZTATÁS NÉLKÜL ide kerülnek — a felület szó szerint
   * jeleníti meg őket.
   */
  error?: string
}
