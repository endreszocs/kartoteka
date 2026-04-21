import 'server-only'

/**
 * Supabase admin-kliens — service_role kulccsal.
 *
 * KRITIKUS: a service_role kulcs MEGKERÜLI az RLS-t és mindent olvashat/írhat.
 * Ezért SOHA nem kerülhet böngésző-kódba. Az `import 'server-only'` megakadályozza,
 * hogy kliens komponens importálja.
 *
 * Használat (jelenleg): csak admin-server-actions-ből:
 *   - User-létrehozás invite-emaillel (auth.admin.inviteUserByEmail)
 *   - Eszköz-revoke admin által
 *   - Bulk-ops (pl. audit-log olvasás minden user-re)
 *
 * Env változó: SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function getSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL env változó nincs beállítva.')
  }
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY env változó nincs beállítva. ' +
        'Ez CSAK server-oldalon érhető el, SOHA ne kerüljön kliens-bundle-be.',
    )
  }

  cached = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return cached
}
