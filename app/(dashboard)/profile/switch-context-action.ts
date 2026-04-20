'use server'

/**
 * Aktív profile_role kontextus váltása.
 *
 * A user a header avatar popover-ben választhat az approved profile_roles sorai
 * közül. A választás egy `kartoteka_active_profile_role` cookie-ba kerül, amit
 * a `getEffectiveAccessContext` olvas.
 *
 * FÁZIS 4 (2026-04-17): cookie alapú (Fázis 5-ben JWT custom claim is jön).
 */

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

const ACTIVE_PROFILE_ROLE_COOKIE = 'kartoteka_active_profile_role'
// 30 napos érvényesség — a user ritkán vált profilt naponta
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export async function switchActiveProfileRole(
  profileRoleId: string | null,
): Promise<{ success?: boolean; error?: string; redirectTo?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  const cookieStore = await cookies()

  if (!profileRoleId) {
    // Cookie törlése — az elsődleges (profiles.role) alapú kontextusra visszaáll
    cookieStore.delete(ACTIVE_PROFILE_ROLE_COOKIE)
    revalidatePath('/', 'layout')
    return { success: true, redirectTo: '/dashboard' }
  }

  // Ellenőrzés: a user valóban birtokolja-e ezt a profile_role sort?
  const profileRole = access.profileRoles.find((r) => r.id === profileRoleId)
  if (!profileRole) {
    return { error: 'A kiválasztott szerepkör nem található, vagy nem aktív a saját fiókjánál.' }
  }

  // Cookie beállítás — httpOnly NEM kell, mert a frontend is olvashatja a UI-ben
  cookieStore.set(ACTIVE_PROFILE_ROLE_COOKIE, profileRoleId, {
    maxAge: COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })

  // Az új aktív kontextus szerinti kezdőoldal
  const redirectTo = determineStartPageForScope(profileRole.scope, profileRole.role)

  revalidatePath('/', 'layout')
  return { success: true, redirectTo }
}

function determineStartPageForScope(
  scope: 'system' | 'district' | 'diocese' | 'congregation',
  role: string,
): string {
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
