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

import { invoke } from '@tauri-apps/api/core'
import {
  createKartotekaBrowserClient,
  type SupabaseAuthStorage,
  type SupabaseBrowserConfig,
} from '@kartoteka/supabase-client'

type SupabaseClient = ReturnType<typeof createKartotekaBrowserClient>

let cached: SupabaseClient | null = null

function readViteEnv(): Pick<SupabaseBrowserConfig, 'url' | 'anonKey'> {
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
 * Tauri keyring-alapú storage adapter a Supabase session-höz (M6.6, 2026-04-22).
 *
 * Minden kulcs egy OS-szintű keyring entry (Windows Credential Manager DPAPI,
 * macOS Keychain, Linux Secret Service). A kulcsokra `auth-` prefixet tesz,
 * hogy a Rust oldal engedje (biztonsági korlátozás — a többi slot (SQLCipher,
 * device privkey) nem írható ezen az úton).
 *
 * localStorage → keyring mapping:
 *   - getItem('sb-abc-auth-token')   → invoke('auth_read_item', { key: 'auth-sb-abc-auth-token' })
 *   - setItem('sb-abc-auth-token', x) → invoke('auth_store_item', { key: 'auth-...', value: x })
 *   - removeItem(...)                 → invoke('auth_clear_item', { key: 'auth-...' })
 */
const tauriKeyringStorage: SupabaseAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await invoke<string | null>('auth_read_item', { key: `auth-${key}` })
      return value ?? null
    } catch (e) {
      console.error(`[auth] keyring getItem('${key}') sikertelen:`, e)
      return null
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await invoke('auth_store_item', { key: `auth-${key}`, value })
    } catch (e) {
      console.error(`[auth] keyring setItem('${key}') sikertelen:`, e)
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await invoke('auth_clear_item', { key: `auth-${key}` })
    } catch (e) {
      console.error(`[auth] keyring removeItem('${key}') sikertelen:`, e)
    }
  },
}

/**
 * A desktop Supabase-kliens singleton.
 * Első híváskor hozza létre a klienst és cache-eli.
 *
 * Az auth session **NEM** localStorage-ba kerül, hanem a fenti
 * `tauriKeyringStorage` adapteren keresztül az OS-szintű keyring-be.
 */
export function getDesktopSupabase(): SupabaseClient {
  if (cached) return cached
  const env = readViteEnv()
  cached = createKartotekaBrowserClient({
    url: env.url,
    anonKey: env.anonKey,
    authOptions: {
      storage: tauriKeyringStorage,
      persistSession: true,
      autoRefreshToken: true,
      // Desktop — a Tauri webview soha nem kap OAuth redirect-et URL-en át.
      detectSessionInUrl: false,
    },
  })
  return cached
}
