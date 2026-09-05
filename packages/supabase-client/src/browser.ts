/**
 * Közös böngésző-oldali Supabase-kliens factory.
 *
 * **Mindkét platformon működik**:
 *   - Next.js App Router kliens komponensek (`apps/web/lib/supabase/client.ts`)
 *   - Tauri desktop React frontend (`apps/desktop/src/lib/supabase.ts`)
 *
 * A factory **paraméterként kapja** a konfigurációt — a csomag nem olvas
 * környezeti változót, így a caller (Next.js / Vite) szabadon dönt róla.
 *
 * Ez tudatos döntés:
 *   - Next.js: `process.env.NEXT_PUBLIC_SUPABASE_URL` (build-time inline-olt)
 *   - Vite/Tauri: `import.meta.env.VITE_SUPABASE_URL` (Vite build-time inline-olt)
 *
 * A két konvenció nem vegyíthető egy modulon belül (a `import.meta.env` csak
 * Vite-ban értelmezett), ezért a csomag nem is próbálkozik vele.
 *
 * ⛔ 2026-09-05 — KÉT KÜLÖNBÖZŐ KLIENS, ÉS EZ SZÁNDÉKOS.
 *
 * A web a `@supabase/ssr` `createBrowserClient`-jét használja: a munkamenet
 * SÜTIBEN él, hogy a Next.js szerver-oldal (proxy, server actions) is lássa.
 *
 * Az asztali app viszont 2026-04-22 óta egy Tauri-keyring adaptert adott át
 * `authOptions.storage`-ként — és az SOHA nem működött. A `@supabase/ssr`
 * 0.10.0 `createBrowserClient`-je a saját süti-tárolóját ÍRJA RÁ az átadott
 * `auth.storage`-ra (`node_modules/@supabase/ssr/dist/main/createBrowserClient.js`:
 * `auth: { ...options?.auth, …, storage }` — a spread UTÁN jön a felülírás),
 * ahogy a `flowType: 'pkce'`-t és a `detectSessionInUrl`-t is. A desktop
 * munkamenete így a WebView SÜTIJÉBEN élt, a keyring-adapter halott kód volt
 * (a 2026-09-03-i védelmi felülvizsgálat P0-találata, két független
 * ellenőrzéssel megerősítve 2026-09-05-én).
 *
 * A JAVÍTÁS: ha a hívó `authOptions`-t ad (= asztali app), a NYERS
 * `@supabase/supabase-js` `createClient`-jét használjuk, amely az átadott
 * `storage`-ot TISZTELETBEN TARTJA (aszinkron adapterrel is). Az ssr-csomag
 * ott szükségtelen: a Tauri webview-nak nincs szerver-oldala, sütit nem kell
 * megosztania senkivel.
 *
 * KÖVETKEZMÉNY a meglévő telepítéseken: a frissítés után a sütiben tárolt
 * régi munkamenet nem látszik (a kliens már a keyringben keres), ezért a
 * lelkész a PIN-kapura kerül, és a felhő-belépést egyszer újra el kell
 * végeznie (webes fiókkal való összekapcsolás vagy jelszó). Adat nem vész el.
 */

import { createBrowserClient } from '@supabase/ssr'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'

/**
 * Platform-független, localStorage-szerű storage adapter a Supabase session-höz.
 * Web: az alapértelmezett süti-tároló (nincs override).
 * Desktop: Tauri keyring-alapú adapter (Windows Credential Manager / macOS
 * Keychain / Linux Secret Service) — ld. apps/desktop/src/lib/supabase.ts.
 */
export interface SupabaseAuthStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export interface SupabaseBrowserConfig {
  /** A Supabase projekt URL-je, pl. `https://xxx.supabase.co` */
  url: string
  /** A publikus (anon) key — RLS-szel védi a DB-t. */
  anonKey: string
  /**
   * Opcionális auth-options override (M6.6 óta, 2026-04-22).
   * Desktop: Tauri keyring storage adapter; web: NE add meg (cookie-alapú).
   * ⚠️ Ha megadod, a kliens NEM az ssr-csomagból, hanem a nyers supabase-js-ből
   *    készül — csak így érvényesül a storage (lásd a fájl fejlécét).
   */
  authOptions?: {
    storage?: SupabaseAuthStorage
    /** A storage-beli kulcs. Default: Supabase saját `sb-<project>-auth-token`. */
    storageKey?: string
    persistSession?: boolean
    autoRefreshToken?: boolean
    detectSessionInUrl?: boolean
  }
}

/**
 * Létrehoz egy új Supabase böngésző-klienst.
 *
 * Figyelem: **nem cache-eli** az instance-t — minden hívás új klienst ad vissza.
 * Ha singletont akarsz, a hívó-oldalon kell cache-elni (ld. az
 * `apps/web/lib/supabase/client.ts` wrapper-t, ami minden komponens-render-kor
 * új klienst ad — ez Next.js-ben helyes, mert a session a cookie-ban van).
 */
export function createKartotekaBrowserClient(
  config: SupabaseBrowserConfig,
) {
  if (!config.url) {
    throw new Error(
      'createKartotekaBrowserClient: a `url` paraméter kötelező. ' +
        'Web: process.env.NEXT_PUBLIC_SUPABASE_URL, ' +
        'Desktop: import.meta.env.VITE_SUPABASE_URL.',
    )
  }
  if (!config.anonKey) {
    throw new Error(
      'createKartotekaBrowserClient: az `anonKey` paraméter kötelező. ' +
        'Web: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, ' +
        'Desktop: import.meta.env.VITE_SUPABASE_ANON_KEY.',
    )
  }
  if (config.authOptions) {
    // ASZTALI ÁG — nyers supabase-js, hogy az átadott storage érvényesüljön.
    return createSupabaseJsClient(config.url, config.anonKey, {
      auth: {
        ...config.authOptions,
        // Az asztali app a jelszavas belépést és a magic-link token_hash
        // (verifyOtp) útját használja; OAuth-visszairányítás a Tauri
        // webview-ban nincs, ezért a PKCE-folyam itt nem kell.
        flowType: 'implicit',
      },
    })
  }
  return createBrowserClient(config.url, config.anonKey)
}

/**
 * ŐRSZEM-SEGÉD: a kliens auth-tárolója — a `scripts/selftest-desktop-session-tarolo.mjs`
 * ezzel bizonyítja, hogy az átadott keyring-adapter valóban ÉL (és nem egy
 * könyvtári süti-tároló ül a helyén).
 */
export function authStorageOf(client: ReturnType<typeof createKartotekaBrowserClient>): unknown {
  return (client.auth as unknown as { storage?: unknown }).storage
}
