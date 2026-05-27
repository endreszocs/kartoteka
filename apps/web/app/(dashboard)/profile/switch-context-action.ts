'use server'

/**
 * Aktív profile_role kontextus váltása.
 *
 * A user a header avatar popover-ben vagy a /valassz-profilt oldalon
 * választhat az approved profile_roles sorai közül. A választás egy
 * `kartoteka_active_profile_role` cookie-ba kerül, amit a
 * `getEffectiveAccessContext` olvas.
 *
 * 2026-05-25 SEBESSÉG-OPTIMALIZÁLÁS: a korábbi flow `getEffectiveAccessContext()`-t
 * hívott (6-10 Supabase query) csak a role-tulajdonlás ellenőrzéséhez, és
 * `revalidatePath('/', 'layout')`-tal invalidálta az egész alkalmazás layout-
 * cache-ét. Most:
 *   - 1 indexed query a `profile_roles`-on (~50ms a 500ms-2s helyett)
 *   - server-side `redirect()` — a kliens NEM kap visszatérési értéket, hanem
 *     közvetlenül átirányítva van (1 round-trip nyereség)
 *   - NINCS revalidatePath: a redirect úgyis új SSR-t hoz létre, és a következő
 *     navigáció már a friss cookie-val olvassa a kontextust
 *
 * FÁZIS 4 (2026-04-17): cookie alapú (Fázis 5-ben JWT custom claim is jön).
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const ACTIVE_PROFILE_ROLE_COOKIE = 'kartoteka_active_profile_role'
// 30 napos érvényesség — a user ritkán vált profilt naponta
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

type ProfileRoleScope = 'system' | 'district' | 'diocese' | 'congregation'

/**
 * Sikeres váltás esetén a function NEM tér vissza (server-side redirect).
 * Csak hiba esetén kap a kliens `{ error }` választ.
 */
export async function switchActiveProfileRole(
  profileRoleId: string | null,
): Promise<{ error: string } | void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezve.' }

  const cookieStore = await cookies()

  // Cookie törlés → vissza az elsődleges (profiles.role) kontextusra
  if (!profileRoleId) {
    cookieStore.delete(ACTIVE_PROFILE_ROLE_COOKIE)
    redirect('/dashboard')
  }

  // Egyetlen indexed query: a user birtokolja-e az approved+active role-t?
  const { data: profileRole, error } = await supabase
    .from('profile_roles')
    .select('scope, role')
    .eq('id', profileRoleId)
    .eq('profile_id', user.id)
    .eq('approval_status', 'approved')
    .eq('active', true)
    .maybeSingle()

  if (error || !profileRole) {
    return {
      error:
        'A kiválasztott szerepkör nem található, vagy nem aktív a saját fiókjánál.',
    }
  }

  cookieStore.set(ACTIVE_PROFILE_ROLE_COOKIE, profileRoleId, {
    maxAge: COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })

  // Server-side redirect — a kliens azonnal a célon van, NEXT_REDIRECT signal
  redirect(
    determineStartPageForScope(
      profileRole.scope as ProfileRoleScope,
      profileRole.role as string,
    ),
  )
}

function determineStartPageForScope(scope: ProfileRoleScope, role: string): string {
  switch (scope) {
    case 'system':
      return role === 'admin' ? '/admin' : '/dashboard'
    case 'district':
      return '/dashboard-kerulet'
    case 'diocese':
      return '/dashboard-egyhazmegye'
    case 'congregation':
    default:
      return '/dashboard'
  }
}
