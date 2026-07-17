import 'server-only'

/**
 * A publikus Auth-iratást csak a P0, token-hook és workflow migrációk
 * ellenőrzött telepítése után szabad megnyitni. A hiányzó vagy eltérő
 * env-érték szándékosan fail closed.
 */
export function isMemberPortalAuthEnabled(): boolean {
  return process.env.MEMBER_PORTAL_AUTH_ENABLED === 'true'
}
