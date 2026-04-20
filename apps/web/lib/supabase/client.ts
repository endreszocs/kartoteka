import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase kliens.
 *
 * STANDALONE MÓDBAN: a böngészőből nem férünk hozzá a SQLite-hoz közvetlenül,
 * de a server-side actions (lib/supabase/server.ts) automatikusan a SQLite-ra
 * irányítja a CRUD műveleteket.
 *
 * A kliens-oldali Supabase-hívások (pl. realtime, auth, storage) szabadon
 * futnak — csak ha van net. Offline-ban timeout-ra futnak (ezért minden
 * fontos lekérdezés a server actions-ön keresztül megy).
 *
 * MEGJEGYZÉS: a Fázis 0-6 PWA réteg (Dexie cache) UI-szinten kezeli az
 * offline állapotot — ez a wrapper "csak" auth/storage/realtime esetén
 * lát ki közvetlenül a felhőbe.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
