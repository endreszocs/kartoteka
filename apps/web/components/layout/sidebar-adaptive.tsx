'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Building2,
  Castle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  HelpCircle,
  Landmark,
  LayoutDashboard,
  Package,
  Settings,
  Sparkles,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface SidebarProps {
  role?: string
  isMasterAdmin: boolean
  isAdmin: boolean
  isEsperes: boolean
  hasCongregation: boolean
  isGodMode: boolean
  mobileOpen: boolean
  onMobileClose: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

interface MenuItem {
  label: string
  href: string
  icon: LucideIcon
  gradient: string
}

interface MenuSection {
  title: string
  items: MenuItem[]
}

const mainItems: MenuItem[] = [
  { label: 'Irányítópult', href: '/dashboard', icon: LayoutDashboard, gradient: 'from-teal-400 to-emerald-500' },
  { label: 'Tagnyilvántartás', href: '/tagnyilvantartas', icon: Users, gradient: 'from-emerald-400 to-teal-500' },
  { label: 'Pénzügy', href: '/penzugy', icon: Wallet, gradient: 'from-amber-400 to-orange-500' },
  { label: 'Anyakönyv', href: '/anyakonyv', icon: BookOpen, gradient: 'from-rose-400 to-fuchsia-500' },
]

const operativeItems: MenuItem[] = [
  { label: 'Munkanapló', href: '/munkanaplo', icon: ClipboardList, gradient: 'from-sky-400 to-cyan-500' },
  { label: 'Leltár', href: '/leltar', icon: Package, gradient: 'from-orange-400 to-amber-500' },
  { label: 'Iktatás', href: '/iktato', icon: FileText, gradient: 'from-violet-400 to-purple-500' },
  { label: 'Sírhelyek', href: '/sirhelyek', icon: Landmark, gradient: 'from-slate-300 to-slate-500' },
]

const communityItems: MenuItem[] = [
  { label: 'Missziós Műhely', href: '/misszios-muhely', icon: Sparkles, gradient: 'from-fuchsia-400 to-pink-500' },
]

const dioceseItems: MenuItem[] = [
  { label: 'Egyházmegye', href: '/dashboard-egyhazmegye', icon: Building2, gradient: 'from-teal-400 to-cyan-500' },
]

const districtItems: MenuItem[] = [
  { label: 'Egyházkerület', href: '/dashboard-kerulet', icon: Castle, gradient: 'from-indigo-400 to-blue-500' },
]

const adminItems: MenuItem[] = [
  { label: 'Admin Panel', href: '/admin', icon: Settings, gradient: 'from-rose-400 to-red-500' },
]

function getRoleLabel(role: string) {
  const roleLabels: Record<string, string> = {
    admin: 'Kerületi admin',
    esperes: 'Esperes',
    master_admin: 'Főadmin',
    pastor: 'Lelkipásztor',
    user: 'Felhasználó',
  }

  return roleLabels[role] || role.replace(/_/g, ' ')
}

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true
  return href !== '/dashboard' && pathname.startsWith(`${href}/`)
}

function SidebarSection({
  title,
  items,
  pathname,
  collapsed,
  onNavigate,
}: {
  title: string
  items: MenuItem[]
  pathname: string
  collapsed: boolean
  onNavigate?: () => void
}) {
  return (
    <section className={cn('space-y-2 [@media(max-height:860px)]:space-y-1.5 [@media(max-height:720px)]:space-y-1', collapsed && 'space-y-1')}>
      {!collapsed && (
        <div className="px-3 [@media(max-height:720px)]:px-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/55 [@media(max-height:860px)]:text-[9px] [@media(max-height:720px)]:tracking-[0.18em]">
            {title}
          </p>
        </div>
      )}

      <div className={cn('space-y-1.5 [@media(max-height:860px)]:space-y-1 [@media(max-height:720px)]:space-y-0.5', collapsed && 'space-y-1')}>
        {items.map((item) => {
          const active = isActivePath(pathname, item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
              className={cn(
                'group flex items-center gap-3 rounded-[1.2rem] border px-3 py-3 text-sm transition [@media(max-height:860px)]:gap-2.5 [@media(max-height:860px)]:rounded-[1rem] [@media(max-height:860px)]:px-2.5 [@media(max-height:860px)]:py-2.5 [@media(max-height:860px)]:text-[13px] [@media(max-height:720px)]:gap-2 [@media(max-height:720px)]:px-2 [@media(max-height:720px)]:py-2 [@media(max-height:720px)]:text-[12px]',
                active
                  ? 'border-white/18 bg-white/14 text-white shadow-[0_18px_28px_-24px_rgba(0,0,0,0.55)]'
                  : 'border-transparent text-white/76 hover:border-white/10 hover:bg-white/8 hover:text-white',
                collapsed && 'justify-center rounded-[1rem] px-2 py-2.5'
              )}
            >
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 transition [@media(max-height:860px)]:size-9 [@media(max-height:720px)]:size-8',
                  active && `bg-gradient-to-br ${item.gradient} border-white/20`,
                  collapsed && 'size-10'
                )}
              >
                <Icon className={cn('size-[18px]', active ? 'text-white' : 'text-white/75')} />
              </div>

              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.label}</p>
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function SidebarNav({
  role = 'lelkesz',
  isEsperes,
  isAdmin,
  isMasterAdmin,
  hasCongregation,
  isGodMode,
  collapsed,
  allowCollapse,
  onToggleCollapsed,
  onNavigate,
}: {
  role?: string
  isEsperes: boolean
  isAdmin: boolean
  isMasterAdmin: boolean
  hasCongregation: boolean
  isGodMode: boolean
  collapsed: boolean
  allowCollapse: boolean
  onToggleCollapsed?: () => void
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  const sections: MenuSection[] = []

  if (hasCongregation) {
    sections.push(
      { title: 'Fő modulok', items: mainItems },
      { title: 'Szolgálati adminisztráció', items: operativeItems },
      { title: 'Közösségi tér', items: communityItems }
    )
  }

  if (isEsperes) {
    sections.push({ title: 'Egyházmegyei nézet', items: dioceseItems })
  }

  if (isAdmin) {
    sections.push({ title: 'Kerületi nézet', items: districtItems })
  }

  if (isMasterAdmin) {
    sections.push({ title: 'Rendszerszint', items: adminItems })
  }

  return (
    <div className="sidebar-adaptive relative flex h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-3.5rem] top-[-2rem] h-36 w-36 rounded-full bg-amber-300/18 blur-3xl" />
        <div className="absolute bottom-8 right-[-2.5rem] h-32 w-32 rounded-full bg-cyan-300/14 blur-3xl" />
      </div>

      <div className="relative flex h-full flex-col">
        <div className="px-4 pb-4 pt-5 [@media(max-height:860px)]:px-3 [@media(max-height:860px)]:pb-3 [@media(max-height:860px)]:pt-3 [@media(max-height:720px)]:px-2.5 [@media(max-height:720px)]:pb-2 [@media(max-height:720px)]:pt-2.5">
          <button
            type="button"
            onClick={allowCollapse ? onToggleCollapsed : undefined}
            className={cn(
              'sidebar-brand-card flex w-full items-center rounded-[1.8rem] border border-white/14 bg-white/10 p-4 text-left shadow-[0_24px_45px_-32px_rgba(0,0,0,0.6)] backdrop-blur-xl transition hover:bg-white/12 [@media(max-height:860px)]:rounded-[1.5rem] [@media(max-height:860px)]:p-3 [@media(max-height:720px)]:rounded-[1.3rem] [@media(max-height:720px)]:p-2.5',
              collapsed ? 'justify-center px-2 py-3' : 'gap-3'
            )}
            aria-label={collapsed ? 'Oldalsáv kinyitása' : 'Oldalsáv összecsukása'}
          >
            <div className={cn('flex size-12 items-center justify-center rounded-[1.2rem] bg-white/86 shadow-[0_18px_30px_-24px_rgba(16,70,63,0.46)] [@media(max-height:860px)]:size-10 [@media(max-height:720px)]:size-9', collapsed && 'size-11')}>
              <Image src="/kartoteka-icon.png" alt="Kartotéka" width={30} height={30} className="rounded-xl" />
            </div>

            {!collapsed && (
              <>
                <div className="sidebar-brand min-w-0 flex-1">
                  <h2 className="font-heading text-2xl leading-none text-white [@media(max-height:860px)]:text-xl [@media(max-height:720px)]:text-lg">
                    Kartotéka
                  </h2>
                  <p className="mt-1 text-xs text-white/68 [@media(max-height:720px)]:hidden">
                    meleg, átlátható pásztori adminisztráció
                  </p>
                </div>

                {allowCollapse && (
                  <div className="flex size-9 items-center justify-center rounded-2xl bg-white/10 text-white/78">
                    <ChevronLeft className="size-4" />
                  </div>
                )}
              </>
            )}

            {collapsed && allowCollapse && (
              <div className="absolute bottom-2 right-2 flex size-6 items-center justify-center rounded-full bg-white/12 text-white/78">
                <ChevronRight className="size-3.5" />
              </div>
            )}
          </button>

          {!collapsed && (
            <div className="sidebar-badges mt-4 flex flex-wrap gap-2 [@media(max-height:860px)]:mt-3 [@media(max-height:720px)]:mt-2">
              <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-medium text-white/88 [@media(max-height:860px)]:px-2.5 [@media(max-height:860px)]:py-0.5 [@media(max-height:860px)]:text-[10px]">
                {getRoleLabel(role)}
              </span>
              <span className="rounded-full bg-amber-300/18 px-3 py-1 text-[11px] font-medium text-amber-100 [@media(max-height:860px)]:hidden">
                {hasCongregation ? 'Aktív gyülekezeti nézet' : 'Jóváhagyásra vár'}
              </span>
            </div>
          )}
        </div>

        <nav className={cn(
          'relative flex-1 overflow-hidden px-3 pb-3 [@media(max-height:860px)]:px-2.5 [@media(max-height:860px)]:pb-2.5 [@media(max-height:720px)]:px-2 [@media(max-height:720px)]:pb-2',
          collapsed ? 'space-y-2' : 'space-y-5 [@media(max-height:860px)]:space-y-3 [@media(max-height:720px)]:space-y-2'
        )}>
          {sections.map((section) => (
            <SidebarSection
              key={section.title}
              title={section.title}
              items={section.items}
              pathname={pathname}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        <div className="relative px-3 pb-4 [@media(max-height:860px)]:px-2.5 [@media(max-height:860px)]:pb-3 [@media(max-height:720px)]:px-2 [@media(max-height:720px)]:pb-2">
          <div className="rounded-[1.5rem] border border-white/12 bg-white/8 p-3 backdrop-blur-xl [@media(max-height:860px)]:rounded-[1.25rem] [@media(max-height:860px)]:p-2.5 [@media(max-height:720px)]:p-2">
            <Link
              href="/support"
              onClick={onNavigate}
              title={collapsed ? 'Segítség és támogatás' : undefined}
              className={cn(
                'sidebar-support-link flex items-center rounded-[1.1rem] text-sm text-white/82 transition hover:bg-white/10 hover:text-white',
                collapsed
                  ? 'justify-center px-2 py-2.5'
                  : 'gap-3 px-3 py-3 [@media(max-height:860px)]:gap-2.5 [@media(max-height:860px)]:px-2.5 [@media(max-height:860px)]:py-2.5 [@media(max-height:860px)]:text-[13px] [@media(max-height:720px)]:gap-2 [@media(max-height:720px)]:px-2 [@media(max-height:720px)]:py-2 [@media(max-height:720px)]:text-[12px]'
              )}
            >
              <div className={cn('flex size-10 items-center justify-center rounded-2xl bg-white/10 [@media(max-height:860px)]:size-9 [@media(max-height:720px)]:size-8', collapsed && 'size-10')}>
                <HelpCircle className="size-[18px]" />
              </div>

              {!collapsed && (
                <div className="sidebar-support-copy">
                  <p className="font-medium">Segítség és támogatás</p>
                  <p className="text-xs text-white/55 [@media(max-height:860px)]:hidden">
                    Ha elakadsz, innen indul a segítség.
                  </p>
                </div>
              )}
            </Link>

            {isGodMode && (
              <div
                className={cn(
                  'mt-3 flex items-center justify-center gap-2 rounded-[1.1rem] border border-red-300/18 bg-red-400/12 px-3 py-2 text-xs font-semibold text-red-100 [@media(max-height:860px)]:mt-2 [@media(max-height:860px)]:py-1.5 [@media(max-height:860px)]:text-[11px] [@media(max-height:720px)]:mt-1.5',
                  collapsed && 'px-2 py-2'
                )}
                title={collapsed ? 'God Mode aktív' : undefined}
              >
                <Zap className="size-4" />
                {!collapsed && 'God Mode aktív'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SidebarAdaptive({
  role,
  isMasterAdmin,
  isAdmin,
  isEsperes,
  hasCongregation,
  isGodMode,
  mobileOpen,
  onMobileClose,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const navProps = { role, isEsperes, isAdmin, isMasterAdmin, hasCongregation, isGodMode }
  const shellClassName =
    'relative h-dvh shrink-0 overflow-hidden border-r border-white/10 bg-[linear-gradient(180deg,#14514b_0%,#11454a_52%,#16334e_100%)] text-white'

  return (
    <>
      <aside
        className={cn(
          'hidden lg:flex transition-[width] duration-300 ease-out',
          collapsed ? 'w-[92px]' : 'w-[288px] [@media(max-height:860px)]:w-[272px] [@media(max-height:720px)]:w-[256px]',
          shellClassName
        )}
      >
        <SidebarNav
          {...navProps}
          collapsed={collapsed}
          allowCollapse
          onToggleCollapsed={onToggleCollapsed}
        />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={(open) => { if (!open) onMobileClose() }}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className={cn('w-[86vw] max-w-[320px] border-r-0 p-0 sm:max-w-[344px]', shellClassName)}
        >
          <SheetTitle className="sr-only">Navigáció</SheetTitle>
          <SidebarNav
            {...navProps}
            collapsed={false}
            allowCollapse={false}
            onNavigate={onMobileClose}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
