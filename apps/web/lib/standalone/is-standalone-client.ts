/**
 * Client-side standalone detection.
 *
 * Ez a helper a kliens-oldalon, a böngészőben fut, és a buildtime-ban
 * inline-olt `NEXT_PUBLIC_KARTOTEKA_STANDALONE` env var alapján dönt.
 *
 * A `NEXT_PUBLIC_` prefix kötelező — a Next.js CSAK ezeket az env var-okat
 * teszi elérhetővé a kliens-bundle-ben. A szerver-oldali `KARTOTEKA_STANDALONE`
 * nem látszik a böngészőben.
 *
 * Ha standalone módban vagy:
 *  - a Dexie sync-orchestrator (Supabase pull/push) KÁROS (timeout offline-ban)
 *  - a havi sync (`/offline` → "Szinkronizálás most") kezeli az adat-áramlást
 *  - a kliens komponenseknek alkalmazkodniuk kell (pl. ne mutassanak Supabase-sync
 *    gombokat, ne hívjanak orchestrator-t)
 *
 * Használat:
 *   import { isStandaloneMode } from '@/lib/standalone/is-standalone-client'
 *
 *   if (isStandaloneMode()) {
 *     // ne indíts Dexie sync orchestrator-t
 *   }
 *
 * A szerver-oldalhoz (API route-ok, middleware, server components) használd a
 * `lib/standalone/runtime-detect.ts` importját helyette — ez `process.env.KARTOTEKA_STANDALONE`
 * (NEXT_PUBLIC_ prefix nélkül) alapján dönt, és buildtime inline-olás nélkül is működik.
 */

export function isStandaloneMode(): boolean {
  return process.env.NEXT_PUBLIC_KARTOTEKA_STANDALONE === 'true'
}
