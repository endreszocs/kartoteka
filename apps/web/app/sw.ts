/// <reference lib="webworker" />
/**
 * Service Worker — KARTOTEKA offline-first PWA
 *
 * Ezt a fájlt a `@serwist/next` build-time fordítja le `public/sw.js`-re.
 * A runtime cache stratégiák:
 *  - Statikus assetek (JS/CSS/képek) → CacheFirst (precache + long-term)
 *  - /_next/data → NetworkFirst (Next.js fetch calls)
 *  - Supabase API → NetworkOnly (mert a Dexie + sync orchestrator kezeli)
 *  - Google Fonts → StaleWhileRevalidate
 *
 * Fázis 0: csak alap precache + default strategies. Későbbi fázisokban
 * bővítjük a Background Sync API-ra és a custom fetch handlerekre.
 */

import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist'
import { NetworkOnly, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Serwist build injekciója — a precache manifest-et tartalmazza
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// 2026-04-27 FIX: az auth-útvonalak (login, register, callback, oauth-complete)
// SOSE menjenek SW cache-be — ezek 302 redirect-tel záródnak (Supabase OAuth flow),
// és a Serwist NetworkFirst nem kezeli jól a redirect-eket. A "no-response"
// SW-hiba és a megzavart Google OAuth callback ez okozta.
const authRouteCaching: RuntimeCaching = {
  matcher: ({ url, request }) =>
    request.mode === 'navigate'
    && (
      url.pathname.startsWith('/login')
      || url.pathname.startsWith('/register')
      || url.pathname.startsWith('/auth/callback')
      || url.pathname.startsWith('/oauth-complete')
      || url.pathname.startsWith('/forgot-password')
      || url.pathname.startsWith('/api/auth')
    ),
  handler: new NetworkOnly(),
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Az auth-route handler ELŐRE — felülírja a defaultCache-t azokra az útvonalakra
  runtimeCaching: [authRouteCaching, ...defaultCache],
})

serwist.addEventListeners()
