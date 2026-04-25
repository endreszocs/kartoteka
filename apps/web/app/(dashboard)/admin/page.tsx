import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminTabsV3 } from '@/components/admin/admin-tabs-v3'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { ArrowRight, Building2, LayoutDashboard, Shield } from 'lucide-react'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'

export default async function AdminPage() {
  const access = await getEffectiveAccessContext()
  const { user, admin, activeProfileRole } = access

  if (!user) {
    redirect('/login')
  }
  if (!admin) {
    redirect('/dashboard')
  }
  if (activeProfileRole && activeProfileRole.scope !== 'system') {
    redirect(getHomePathForScope(activeProfileRole.scope))
  }
  const godMode = await getGodModeStatus()

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-indigo-100/70 bg-[linear-gradient(135deg,#1e1b4b_0%,#312e81_56%,#4338ca_100%)] px-6 py-6 text-white shadow-[0_34px_80px_-40px_rgba(30,27,75,0.55)] md:px-8 md:py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_18rem),radial-gradient(circle_at_bottom_right,rgba(129,140,248,0.22),transparent_18rem)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-50/86">
              <Shield className="size-3.5" />
              Rendszerszintű felügyelet
            </div>

            <h1 className="mt-4 font-heading text-3xl text-white md:text-4xl">
              Admin Központ
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-indigo-100/82 md:text-base">
              A gyülekezetek, felhasználók, támogatási jegyek és adatminőségi jelzések egy helyen, áttekinthető rendszerben.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/12 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/16"
            >
              <LayoutDashboard className="size-4" />
              Saját gyülekezet
            </Link>
            <Link
              href="/dashboard-kerulet"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-[0_20px_30px_-24px_rgba(255,255,255,0.9)] transition hover:bg-indigo-50"
            >
              <Building2 className="size-4" />
              Kerületi központ
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
      <div className="card-raised p-4 sm:p-5">
        <AdminTabsV3 isGodMode={godMode.active} />
      </div>
    </div>
  )
}
