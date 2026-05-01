import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Building2, LayoutDashboard, Shield } from 'lucide-react'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getHomePathForScope } from '@/lib/auth/active-ui-scope'

// Admin Panel közös layout (Sprint U.4, 2026-05-02).
// - Auth-guard: csak admin / master admin léphet be
// - Közös gradient banner mind a 13 aloldal tetején
// - Az aloldalak (/admin/<slug>/page.tsx) ezt a layout-ot örökölik
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getEffectiveAccessContext()
  const { user, admin, activeProfileRole } = access

  if (!user) redirect('/login')
  if (!admin) redirect('/dashboard')
  if (activeProfileRole && activeProfileRole.scope !== 'system') {
    redirect(getHomePathForScope(activeProfileRole.scope))
  }

  return (
    <div className="space-y-6">
      <div
        className="relative overflow-hidden rounded-[2rem] border border-border px-6 py-6 text-white shadow-[0_34px_80px_-40px_rgba(15,23,42,0.55)] md:px-8 md:py-8"
        style={{ background: 'linear-gradient(135deg, var(--sidebar) 0%, var(--primary) 56%, var(--accent) 100%)' }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_18rem),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.12),transparent_18rem)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/86">
              <Shield className="size-3.5" />
              Rendszerszintű felügyelet
            </div>

            <h1 className="mt-4 font-heading text-3xl text-white md:text-4xl">
              Admin Központ
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/82 md:text-base">
              A gyülekezetek, felhasználók, támogatási jegyek és adatminőségi jelzések egy helyen.
              A bal oldali sávon át bármelyik részhez közvetlenül átléphet.
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
              className="inline-flex items-center gap-2 rounded-2xl bg-card px-4 py-2.5 text-sm font-semibold text-primary shadow-[0_20px_30px_-24px_rgba(255,255,255,0.9)] transition hover:bg-muted"
            >
              <Building2 className="size-4" />
              Kerületi központ
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>

      {children}
    </div>
  )
}
