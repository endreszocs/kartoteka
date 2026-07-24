import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let publicClient: SupabaseClient | null = null

/**
 * Cookie-free, session-free client for public congregation content only.
 *
 * Public pages must consistently use the `anon` RLS policies even when the
 * visitor is signed in as staff or as an isolated portal member. This keeps a
 * member JWT from changing public layout visibility or widening loader access.
 */
export function createPublicServerClient(): SupabaseClient {
  if (publicClient) return publicClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing public Supabase URL or anon key.')
  }

  publicClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })

  return publicClient
}
