/**
 * Scope → kezdőoldal leképezés (2026-07-25, G2).
 *
 * Eddig HÁROM helyen élt ugyanez a logika: a profilváltó server action
 * (`determineStartPageForScope`), a /valassz-profilt kliens-oldali
 * `predictRedirectPath`-je (prefetch-hez) és a header-switcher. A
 * 'use server' fájl Next 16-ban NEM exportálhat konstanst/típust
 * (runtime ReferenceError), ezért a közös helper külön, nem-server
 * modulban él — a server action ezt importálhatja.
 */

import type { ProfileRoleScope } from '@/lib/profile-roles/types'

export function getStartPathForScope(scope: ProfileRoleScope, role: string): string {
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
