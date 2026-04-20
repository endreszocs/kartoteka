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
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Serwist build injekciója — a precache manifest-et tartalmazza
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})

serwist.addEventListeners()
