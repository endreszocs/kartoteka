/**
 * Desktop (Tauri + Vite) Supabase-kliens.
 *
 * Az M1.3-ban bevezetett közös `@kartoteka/supabase-client` csomagot
 * használja — ez ugyanaz, amit a web-oldal is.
 *
 * **Lazy-init**: a klienst csak akkor hozzuk létre, amikor ténylegesen kérjük,
 * így ha a `.env` nincs kitöltve, a frontend még betölthető (csak a
 * Supabase-hívások fognak tiszta hibát dobni).
 *
 * Env-beállítás:
 *   - `apps/desktop/.env` (vagy `.env.local`) — létrehozandó az `.env.example`
 *     alapján. A Vite a `VITE_` prefixű változókat inline-olja a build-be.
 */

import {
  createKartotekaBrowserClient,
  type SupabaseBrowserConfig,
} from '@kartoteka/supabase-client'

type SupabaseClient = ReturnType<typeof createKartotekaBrowserClient>

let cached: SupabaseClient | null = null

function readViteEnv(): SupabaseBrowserConfig {
  const env = import.meta.env
  const url = (env.VITE_SUPABASE_URL ?? '') as string
  const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? '') as string

  if (!url || !anonKey) {
    throw new Error(
      'Nincsenek beállítva a Supabase környezeti változók a desktop appban. ' +
        'Hozz létre egy `apps/desktop/.env` fájlt a `.env.example` alapján, ' +
        'és töltsd ki a VITE_SUPABASE_URL és VITE_SUPABASE_ANON_KEY értékeket.',
    )
  }
  return { url, anonKey }
}

/**
 * A desktop Supabase-kliens singleton.
 * Első híváskor hozza létre a klienst és cache-eli.
 */
export function getDesktopSupabase(): SupabaseClient {
  if (cached) return cached
  cached = createKartotekaBrowserClient(readViteEnv())
  return cached
}
