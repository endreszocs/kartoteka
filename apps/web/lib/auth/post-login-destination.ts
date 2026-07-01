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
 *   - 'home'           → aktív (vagy master): mehet a /valassz-profilt-ra.
 *   - 'complete'       → nem aktív ÉS még NEM adta meg a regisztrációs adatait
 *                        (se profil-egyházmegye, se access_request) → /oauth-complete.
 *                        CSAK a jelszavas (via: 'password') úton fordulhat elő.
 *   - 'pending'        → nem aktív, DE már megadta az adatait (OAuth-kiegészítés VAGY
 *                        jelszavas regisztráció access_request-tel) → jóváhagyásra vár.
 *   - 'not_registered' → (CSAK Google/OAuth, via: 'oauth') a belépő e-mail cím NINCS
 *                        regisztrálva: nincs se aktív profil, se egyházmegye, se
 *                        access_request. A `handle_new_user` trigger ilyenkor is létrehoz
 *                        egy `pending` profilt MINDEN friss auth-userre (így az OAuth-nál
 *                        egy ismeretlen e-mail „hiányos regisztrációnak" tűnne) — ezért az
 *                        OAuth-ágon ezt kifejezetten „nincs regisztrálva"-ként kezeljük,
 *                        és NEM küldjük regisztrációs űrlapra (Endre kérése, 2026-07-01).
 *                        Google-lel csak MÁR regisztrált (hozzáférést igényelt) felhasználó
 *                        léphet be; új felhasználó a /hozzaferes-kerese úton kezd.
 */
export type PostLoginDestination = 'home' | 'complete' | 'pending' | 'not_registered'

export async function resolvePostLoginDestination(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  opts?: { via?: 'oauth' | 'password' },
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

  // Se egyházmegye a profilon, se access_request → nincs valódi regisztráció.
  // OAuth (Google): ez egy ISMERETLEN e-mail → „nincs regisztrálva" (a trigger által
  // auto-létrehozott pending profil ellenére) → NEM regisztrációs űrlap.
  if (opts?.via === 'oauth') return 'not_registered'
  // Jelszavas út: idáig csak sikeres jelszavas belépés jut el (tehát létező, hitelesített
  // felhasználó) — a hiányos állapotot a profil-kiegészítő űrlappal zárjuk le.
  return 'complete'
}
