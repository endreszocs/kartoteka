import { redirect } from 'next/navigation'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'

// Admin Panel közös auth-guard layout (Sprint U.4, 2026-05-02; átdolgozva 2026-05-02 v0.9.33).
// - Csak admin / master admin léphet be
// - Az aloldalak (/admin/<slug>/page.tsx) ezt a layout-ot örökölik
// - A gradient banner KIKERÜLT — minden aloldalnak saját header-je van,
//   az /admin főoldal saját banner-rel rendelkezik
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getEffectiveAccessContext()
  const { user, admin, activeProfileRole } = access

  if (!user) redirect('/login')
  if (!admin) redirect('/dashboard')
  if (activeProfileRole && activeProfileRole.scope !== 'system') {
    redirect(getHomePathForScope(activeProfileRole.scope))
  }

  return <div className="space-y-6">{children}</div>
}
