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
