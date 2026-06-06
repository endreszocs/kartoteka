import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { isMasterAdmin } from '@/lib/auth/roles'

/**
 * Egységes belépés-utáni döntés — UGYANAZ a logika a Google (auth/callback) és
 * az email+jelszó (login) flow-ban, hogy mindkettő AZONOSAN viselkedjen.
 *
 * Háttér: a két regisztrációs út máshová írja az adatot:
 *   - Google/OAuth: az /oauth-complete a PROFILRA írja a diocese_id-t (nincs
 *     access_request).
 *   - Email+jelszó: a /hozzaferes-kerese ACCESS_REQUEST-et hoz létre; a
 *     profiles.diocese_id NULL marad.
 * Ezért a „megadta-e már az adatait?" kérdést MINDKÉT helyen figyelni kell.
 *
 * Visszatérés:
 *   - 'home'     → aktív (vagy master): mehet a /valassz-profilt-ra.
 *   - 'complete' → nem aktív ÉS még NEM adta meg a regisztrációs adatait
 *                  (se profil-egyházmegye, se access_request) → /oauth-complete.
 *   - 'pending'  → nem aktív, DE már megadta az adatait (OAuth-kiegészítés VAGY
 *                  jelszavas regisztráció access_request-tel) → jóváhagyásra vár.
 */
export type PostLoginDestination = 'home' | 'complete' | 'pending'

export async function resolvePostLoginDestination(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<PostLoginDestination> {
  if (isMasterAdmin(user.email)) return 'home'

  const { data: profile } = await supabase
    .from('profiles')
    .select('status, diocese_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.status === 'active') return 'home'

  // Megadta-e már a regisztrációs adatait?
  // 1) OAuth-kiegészítés → a profilra írt egyházmegye.
  if (profile?.diocese_id) return 'pending'
  // 2) Jelszavas regisztráció → access_request a címéhez.
  if (user.email) {
    const { count } = await supabase
      .from('access_requests')
      .select('id', { count: 'exact', head: true })
      .eq('email', user.email)
    if ((count ?? 0) > 0) return 'pending'
  }

  // Se egyházmegye a profilon, se access_request → tényleg hiányos (pl. friss
  // OAuth-belépés) → a profil-kiegészítő űrlap.
  return 'complete'
}
