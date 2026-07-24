import 'server-only'

import type { EffectiveAccessContext } from '@/lib/auth/effective-access'
import { hasPermission, ROLE_TEMPLATES } from '@/lib/profile-roles/permissions'

export type PublicSiteAdminAction = 'read' | 'write'

/**
 * Alkalmazásszintű jogosultságkapu a publikus oldal minden page/action belépési
 * pontjához. Az RLS továbbra is kötelező védelmi réteg, de nem helyettesíti
 * a Server Actionön belüli authorizationt.
 */
export function canAccessPublicSiteAdmin(
  access: EffectiveAccessContext,
  action: PublicSiteAdminAction,
): boolean {
  if (!access.user) return false
  if (!access.effectiveCongregationId) return false
  if (access.master) return true
  if (!access.profile || access.profile.status !== 'active') return false

  const permissions =
    access.activeProfileRole?.permissions ?? ROLE_TEMPLATES[access.role] ?? {}

  return hasPermission(permissions, 'publikus_oldal', action)
}
