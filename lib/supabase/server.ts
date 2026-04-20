import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Standalone-aware Supabase server-side kliens.
 *
 * KÉT MÓD:
 *   1. SERVER MODE (default, web deploy): standard Supabase kliens, minden
 *      query a felhő DB-hez megy.
 *
 *   2. STANDALONE MODE (Fázis 7, lelkész gépén): a Supabase kliens-t
 *      `wrapSupabaseForOfflineUse()` proxy-val felülírjuk, ami a `from()`
 *      hívásokat a lokális SQLite-ra irányítja. Az auth, storage, functions
 *      tovább a Supabase-hez mennek (ha van net), különben offline mode.
 *
 * A `wrapSupabaseForOfflineUse` lazy-loaded — server módban nem terhel.
 *
 * FIGYELEM: a `cookies()` és `createServerClient` SSR-only — ez a fájl
 * **csak** server components / route handlers / server actions-ban használható.
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies()

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component-ből nem lehet cookie-t beállítani
            // Ez rendben van — a middleware kezeli a frissítést
          }
        },
      },
    }
  )

  // Standalone módban: SQLite proxy
  if (process.env.KARTOTEKA_STANDALONE === 'true') {
    const { wrapSupabaseForOfflineUse } = await import(
      '@/lib/standalone/offline-supabase-wrapper'
    )
    return wrapSupabaseForOfflineUse(client)
  }

  return client
}
