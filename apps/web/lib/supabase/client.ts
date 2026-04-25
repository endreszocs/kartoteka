/**
 * Next.js (böngésző-oldali) Supabase-kliens wrapper.
 *
 * M1.3 óta a tényleges factory a `@kartoteka/supabase-client` közös csomagban
 * él — hogy a Tauri desktop kliens (`apps/desktop/`) ugyanazt a forrást
 * használhassa. Ez a wrapper csak a Next.js-specifikus env-bekötést teszi fel
 * (NEXT_PUBLIC_ prefix).
 *
 * Az API **visszafelé kompatibilis**: a kódbázisban 15+ fájl importálja ezt
 * a függvényt úgy, hogy `createClient()`-ként hívja — a viselkedés azonos
 * marad.
 *
 * M6.3 (2026-04-22): a korábbi standalone/portable (SQLite-proxy) mód
 * kivezetve — a Tauri desktop közvetlenül a @kartoteka/supabase-client
 * factory-t használja (Tauri keyring storage-dzsel).
 */

import { createKartotekaBrowserClient } from '@kartoteka/supabase-client'

export function createClient() {
  return createKartotekaBrowserClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  })
}
