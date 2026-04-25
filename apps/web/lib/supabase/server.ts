import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase server-side kliens web-módra (SSR cookies-alapú session).
 *
 * M6.3 (2026-04-22): a korábbi STANDALONE MODE (portable Inno Setup, SQLite-
 * proxy) kivezetve — a Tauri desktop direktben a @kartoteka/supabase-client
 * browser factory-t használja (nem ezt a server.ts-t).
 *
 * FIGYELEM: a `cookies()` és `createServerClient` SSR-only — ez a fájl
 * **csak** server components / route handlers / server actions-ban használható.
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies()

  return createServerClient(
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
            // Ez rendben van — a middleware/proxy kezeli a frissítést
          }
        },
      },
    }
  )
}
