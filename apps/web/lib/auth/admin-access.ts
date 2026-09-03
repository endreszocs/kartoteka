import 'server-only'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

export type AdminAccessLevel = 'master' | 'admin' | 'district_admin'

export interface AdminAccessOptions {
  /** Ha true, csak a MASTER_ADMIN_EMAIL-hez tartozó user mehet át. Default: false. */
  requireMaster?: boolean
  /** Ha true (default), az `egyhazkeruleti_admin` is átmegy. */
  allowDistrictAdmin?: boolean
}

export type AdminAccessResult = Awaited<ReturnType<typeof getEffectiveAccessContext>> & {
  accessLevel: AdminAccessLevel
}

export async function requireAdminAccess(
  options: AdminAccessOptions = {},
): Promise<AdminAccessResult> {
  const { requireMaster = false, allowDistrictAdmin = true } = options
  const access = await getEffectiveAccessContext()

  if (!access.user) {
    throw new Error('Nincs bejelentkezve.')
  }

  // ── MÁSODIK VÉDELMI VONAL (2026-09-04, P0·2) ────────────────────────────
  // A `getEffectiveAccessContext` már fail-closed-ra állítja a származtatott
  // jogokat nem aktív profilnál, tehát ez a sor MA sosem sül el. SZÁNDÉKOSAN
  // van itt: ha valaki később a kontextusban lazít a kapun, ez a kapu még áll,
  // és a hibaüzenet is elmondja, MIÉRT nincs joga — a néma „nincs jogosultsága"
  // helyett, ami órákat visz el a hibakeresésből.
  //
  // A `master` szándékosan kivétel: a fő rendszergazda a `(dashboard)/layout.tsx`
  // státusz-kapuja alól is ki van véve, különben egy elrontott saját profil
  // kizárná a rendszerből azt, aki egyedül tudná megjavítani.
  if (!access.master && !access.statusActive) {
    throw new Error(
      'A fiók még nincs jóváhagyva vagy már nem aktív, ezért adminisztrátori művelet nem végezhető vele.',
    )
  }

  if (requireMaster) {
    if (!access.master) {
      throw new Error('Ehhez a művelethez fő rendszergazdai jogosultság szükséges.')
    }
    return { ...access, accessLevel: 'master' }
  }

  if (access.master) {
    return { ...access, accessLevel: 'master' }
  }
  if (access.admin) {
    return { ...access, accessLevel: 'admin' }
  }
  if (allowDistrictAdmin && access.egyhazkeruletiAdmin) {
    return { ...access, accessLevel: 'district_admin' }
  }

  throw new Error('Ehhez a művelethez nincs jogosultsága.')
}
