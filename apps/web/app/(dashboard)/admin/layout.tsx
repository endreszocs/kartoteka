import { redirect } from 'next/navigation'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'
import { canReadDistrictScope, canWriteDistrictScope } from '@/lib/auth/level-scope'

// Admin Panel közös auth-guard layout (Sprint U.4, 2026-05-02; Sprint U.5, 2026-05-03 D7 fix).
// - Master admin, role='admin' és role='egyhazkeruleti_admin' léphet be (konzisztens
//   a server actionökkel — `requireAdminAccess` helper).
// - Az aloldalak (/admin/<slug>/page.tsx) ezt a layout-ot örökölik
// - A gradient banner KIKERÜLT — minden aloldalnak saját header-je van,
//   az /admin főoldal saját banner-rel rendelkezik
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getEffectiveAccessContext()
  const { user, master, admin, activeProfileRole } = access

  if (!user) redirect('/login')

  // ── 2026-08-15 (EGYHÁZKERÜLETI S1) — A MÁSODIK KERÜLETI BELÉPŐ-KAPU ───────
  //
  // Eddig itt a `egyhazkeruletiAdmin` SKALÁR állt, ami KIZÁRÓLAG a
  // `profiles.role`-ból jön (effective-access.ts). Következmény: aki csak
  // `profile_roles` district sorral rendelkezik (a szerepkör-kiosztás
  // pipeline ezt rendszeresen előállítja, miközben a skalár `lelkesz`
  // marad), az NÉMÁN kiesett — és mivel a /dashboard-kerulet kapuja
  // ugyanezen a skaláron állt, MINDEN kerületi útvonalról ugyanoda, a
  // gyülekezeti /dashboard-ra került, magyarázat nélkül. ZSÁKUTCA.
  // Ezért kell a KÉT kaput EGYSZERRE javítani: ha valaki csak az egyiket
  // írja át, a felhasználó továbbra sem jut sehova.
  //
  // ⚠️ ITT A KAPU AZ *ÍRÓ* (canWriteDistrictScope), NEM az olvasó:
  //    az /admin panel szerepköröket oszt és felhasználókat kezel. Az új
  //    kerületi SZÁMVEVŐ (ellenőr) ide szándékosan NEM jöhet be — a
  //    ROLE_TEMPLATES sablonjában sincs `admin` modul. Neki viszont VAN
  //    hova mennie, ezért nem a gyülekezeti dashboardra dobjuk.
  const districtWriter = canWriteDistrictScope(access)
  if (!master && !admin && !districtWriter) {
    if (canReadDistrictScope(access)) redirect('/dashboard-kerulet')
    redirect('/dashboard')
  }

  // 2026-07-11 fix: a kerületi admin profile_roles-sora definíció szerint
  // scope='district' (system scope csak role='admin'-nak adható ki), ezért a
  // korábbi feltétel (scope !== 'system' → redirect) őt MINDIG kizárta a
  // /admin-ból, hiába engedte be a fenti kapu. District-scope + kerületi
  // ÍRÓI jogosultság együtt átengedett — a szűkítést az admin-scope.ts végzi.
  if (
    activeProfileRole &&
    activeProfileRole.scope !== 'system' &&
    !(
      activeProfileRole.scope === 'district' &&
      canWriteDistrictScope(access, activeProfileRole.scopeId)
    )
  ) {
    redirect(getHomePathForScope(activeProfileRole.scope))
  }

  return <div className="space-y-6">{children}</div>
}
