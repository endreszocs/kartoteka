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
 * STANDALONE MÓDBAN (a lelkész gépén — ma még a Next.js standalone output
 * verzió): a böngészőből nem férünk hozzá a SQLite-hoz közvetlenül, de a
 * server-side actions (lib/supabase/server.ts) automatikusan a SQLite-ra
 * irányítja a CRUD műveleteket. A kliens-oldali Supabase-hívások (pl.
 * realtime, auth, storage) szabadon futnak — csak ha van net.
 */

import { createKartotekaBrowserClient } from '@kartoteka/supabase-client'

export function createClient() {
  return createKartotekaBrowserClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  })
}
