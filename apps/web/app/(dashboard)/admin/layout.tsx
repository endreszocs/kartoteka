import { redirect } from 'next/navigation'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'

// Admin Panel közös auth-guard layout (Sprint U.4, 2026-05-02; Sprint U.5, 2026-05-03 D7 fix).
// - Master admin, role='admin' és role='egyhazkeruleti_admin' léphet be (konzisztens
//   a server actionökkel — `requireAdminAccess` helper).
// - Az aloldalak (/admin/<slug>/page.tsx) ezt a layout-ot örökölik
// - A gradient banner KIKERÜLT — minden aloldalnak saját header-je van,
//   az /admin főoldal saját banner-rel rendelkezik
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getEffectiveAccessContext()
  const { user, master, admin, egyhazkeruletiAdmin, activeProfileRole } = access

  if (!user) redirect('/login')
  if (!master && !admin && !egyhazkeruletiAdmin) redirect('/dashboard')
  if (activeProfileRole && activeProfileRole.scope !== 'system') {
    redirect(getHomePathForScope(activeProfileRole.scope))
  }

  return <div className="space-y-6">{children}</div>
}
