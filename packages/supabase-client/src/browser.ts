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
 */

import { createBrowserClient } from '@supabase/ssr'

/**
 * Platform-független, localStorage-szerű storage adapter a Supabase session-höz.
 * Web: az alapértelmezett `localStorage` (nincs override).
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
 *
 * Desktop-on a `authOptions.storage` paraméter a Tauri keyring-alapú adapter,
 * amely a `auth_store_session` / `auth_read_session` / `auth_clear_session`
 * Rust command-okon keresztül OS-szintű keyring-ben tárolja a session-t
 * (localStorage helyett).
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
    return createBrowserClient(config.url, config.anonKey, {
      auth: config.authOptions,
    })
  }
  return createBrowserClient(config.url, config.anonKey)
}
