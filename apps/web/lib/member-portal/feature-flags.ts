import 'server-only'

/**
 * A tagi Auth-felület csak két, külön kezelt production kapuval nyílhat meg.
 *
 * Az AUTH kapcsoló az üzleti engedély, a SCHEMA_READY pedig annak explicit
 * igazolása, hogy a teljes Supabase migrációs lánc és az Auth/RLS próba lefutott.
 * Bármelyik hiánya vagy elírása szándékosan fail-closed állapotot eredményez.
 */
export function isMemberPortalAuthEnabled(): boolean {
  return (
    process.env.MEMBER_PORTAL_AUTH_ENABLED === 'true' &&
    process.env.MEMBER_PORTAL_SCHEMA_READY === 'true'
  )
}
