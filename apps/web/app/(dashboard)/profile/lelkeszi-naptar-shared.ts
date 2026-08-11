/**
 * A lelkészi (privát) naptár-feed szerver-akcióinak TÍPUSAI — 2026-08-11.
 *
 * Külön fájl, mert a Next.js 16-ban egy `'use server'` modul KIZÁRÓLAG async
 * függvényeket exportálhat: típus vagy konstans ott fordítási hibát ad.
 * (Lásd a projekt-konvenciót: `*-shared.ts` / `*-types.ts` testvérfájl.)
 */

export interface PastoralCalendarState {
  /** A jelenlegi titkos token (uuid) — `null`, ha még nincs, vagy vissza lett vonva. */
  token: string | null
  /** Mikor készült a jelenlegi hivatkozás (ISO). */
  createdAt: string | null
  /** Mikor húzta le utoljára egy naptár-szolgáltató (ISO) — `null`, ha még soha. */
  lastUsedAt: string | null
  /**
   * `true`, ha a 2026-08-11-es SQL még NEM futott le az adatbázisban. Ilyenkor
   * a felület barátságos teendőt mutat, nem nyers hibát.
   */
  needsMigration: boolean
  /** Felhasználónak szánt magyar hibaüzenet (ha van). */
  error?: string
}

export interface PastoralCalendarActionResult {
  ok: boolean
  state?: PastoralCalendarState
  error?: string
}
