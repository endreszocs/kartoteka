'use client'

/**
 * Kartotéka sidebar — platform-agnosztikus port a web `SidebarAdaptiveV4`-ből.
 *
 * A web-app `components/layout/sidebar-adaptive-v4.tsx` Next.js függőségei
 * (next/image, next/link, usePathname) helyett DEPENDENCY INJECTION
 * (Link komponens, logoSrc, currentPath) propsként érkezik.
 *
 * Használat:
 *   Web:     <KartotekaSidebar Link={NextLink} logoSrc="/EREK.png" currentPath={usePathname()} ... />
 *   Desktop: <KartotekaSidebar Link={RouterLink} logoSrc="/logo.png" currentPath={useLocation().pathname} ... />
 *
 * Minden business-logika (scope-aware filtering, role-alapú szekciók,
 * mobile sheet, collapse) megmarad — csak a routing-réteg cserélődik.
 */

import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Building2,
  Castle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Handshake,
  Landmark,
  LayoutDashboard,
  Package,
  Settings,
  Sparkles,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'

import { Sheet, SheetContent, SheetTitle } from '../components/sheet'
import { cn } from '../lib/utils'

// ─────────────────────────────────────────────────────────────────────────
// Platform adapter — a web / desktop külön-külön szolgáltatja
// ─────────────────────────────────────────────────────────────────────────

export interface SidebarLinkProps {
  href: string
  children: ReactNode
  onClick?: () => void
  title?: string
  'aria-label'?: string
  'data-walkthrough'?: string
  suppressHydrationWarning?: boolean
  className?: string
}

export type SidebarLinkComponent = ComponentType<SidebarLinkProps>

// ─────────────────────────────────────────────────────────────────────────
// Menü-modell
// ─────────────────────────────────────────────────────────────────────────

export interface MenuItem {
  label: string
  href: string
  icon: LucideIcon
  gradient: string
  /**
   * Kibontható almenü gyermek-elemei (Sprint Q F1.6, v0.7.6, 2026-04-26).
   * Ha megadva, a parent item-en chevron jelenik meg, és a sub-itemek
   * behúzva, halványabban renderelődnek. Az auto-expand logikája: ha a
   * `currentPath` matchel valamelyik child-href-fel (pl. `/penzugy/befizetes`)
   * VAGY a parent-href-fel (pl. `/penzugy`), a parent automatikusan
   * kibontva indul.
   */
  children?: MenuItem[]
}

export interface MenuSection {
  title: string
  items: MenuItem[]
}

// Ugyanaz a menü-modell, mint a web-app sidebar-adaptive-v4-ben.
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
  { label: 'Jegyzőkönyvek', href: '/jegyzokonyvek', icon: BookOpen, gradient: 'from-indigo-400 to-blue-500' },
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

const financialReviewItems: MenuItem[] = [
  { label: 'Pénzügyi áttekintés', href: '/penzugy', icon: Wallet, gradient: 'from-amber-400 to-orange-500' },
]

const profileItems: MenuItem[] = [
  { label: 'Profilom', href: '/profile', icon: Handshake, gradient: 'from-teal-400 to-cyan-500' },
]

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true
  return href !== '/dashboard' && pathname.startsWith(`${href}/`)
}

// ─────────────────────────────────────────────────────────────────────────
// Sidebar props
// ─────────────────────────────────────────────────────────────────────────

export interface KartotekaSidebarProps {
  /** Routing-komponens (web: next/link, desktop: react-router-dom Link wrapper). */
  Link: SidebarLinkComponent
  /** Aktuális URL path (web: usePathname(), desktop: useLocation().pathname). */
  currentPath: string
  /** EREK logó URL (web: '/EREK.png', desktop: relative a public-hez). */
  logoSrc: string

  // Role / scope állapot (ugyanaz, mint a SidebarAdaptiveV4-ben)
  isMasterAdmin: boolean
  isAdmin: boolean
  isEgyhazkeruletiAdmin?: boolean
  isEsperes: boolean
  isKonyvelo?: boolean
  isSzamvevo?: boolean
  hasCongregation: boolean
  assignedCongregationsCount?: number
  isGodMode: boolean
  activeScope?: 'system' | 'district' | 'diocese' | 'congregation' | null

  // UI állapot
  mobileOpen: boolean
  onMobileClose: () => void
  collapsed: boolean
  onToggleCollapsed: () => void

  /**
   * A Pénzügy menüpont kibontható almenüje (v0.7.6+).
   * - Web: 11 finance fül (`/penzugy#dashboard`, `/penzugy#cashbook`, ...)
   * - Desktop: 8 desktop oldal (`/penzugy/attekintes`, `/penzugy/befizetes`, ...)
   * Ha undefined/üres tömb, a Pénzügy item flat marad (régi viselkedés).
   */
  financeSubmenu?: MenuItem[]
}

// ─────────────────────────────────────────────────────────────────────────
// SidebarSection — egy label + nav-linkek blokkja
// ─────────────────────────────────────────────────────────────────────────

/**
 * Egy menüpont (parent-link, esetleg kibontható almenüvel).
 *
 * Ha az item-nek van `children`, a parent-link mellett egy chevron-gomb
 * jelenik meg, amely a sub-itemek listáját bontja ki/csukja össze.
 * Az auto-expand logikája: ha a currentPath valamelyik child-href-fel matchel
 * (pl. `/penzugy/befizetes`), a parent automatikusan expanded állapotban
 * kezdődik.
 */
function SidebarItem({
  item,
  pathname,
  collapsed,
  Link,
  onNavigate,
}: {
  item: MenuItem
  pathname: string
  collapsed: boolean
  Link: SidebarLinkComponent
  onNavigate?: () => void
}) {
  const Icon = item.icon
  const walkthroughKey = `menu-${item.href.replace(/^\//, '').split('/')[0]}`
  const hasChildren = !!item.children && item.children.length > 0

  // Aktív, ha pontosan ez a parent-href, VAGY az URL ezen a parent alatt van
  // (pl. /penzugy/befizetes a /penzugy parent alatt számít aktívnak az
  // ikon-gradiensnél).
  const parentActive = isActivePath(pathname, item.href)
  const childActive =
    hasChildren && item.children!.some((c) => isActivePath(pathname, c.href))
  const active = parentActive || childActive

  // Auto-expand a child-aktivitás vagy a hash-alapú aktivitás alapján.
  // A hash-alapú match (`/penzugy#cashbook`) a child.href-hez illeszkedik.
  const hashActive =
    hasChildren &&
    typeof window !== 'undefined' &&
    item.children!.some((c) => {
      const [path, hash] = c.href.split('#')
      if (!hash) return false
      return pathname === path && window.location.hash === `#${hash}`
    })
  const shouldStartExpanded = childActive || hashActive || parentActive

  const [expanded, setExpanded] = useState(shouldStartExpanded)

  // Auto-expand frissítés ha a pathname változik
  useEffect(() => {
    if (shouldStartExpanded) setExpanded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Collapsed sidebar-ban a children-t nem mutatjuk (csak az ikon-tooltip)
  const showChildren = hasChildren && expanded && !collapsed

  return (
    <div className="space-y-0.5">
      <div className="relative">
        <Link
          href={item.href}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          aria-label={item.label}
          data-walkthrough={walkthroughKey}
          suppressHydrationWarning
          className={cn(
            'group relative flex w-full items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium transition [@media(max-height:820px)]:py-2 [@media(max-height:820px)]:text-[12px]',
            active
              ? 'bg-white/12 text-white font-semibold'
              : 'text-white/78 hover:bg-white/8 hover:text-white',
            collapsed && 'justify-center px-2 py-2.5',
            hasChildren && !collapsed && 'pr-9',
          )}
        >
          {active && !collapsed && (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r"
              style={{ background: 'var(--accent2)' }}
            />
          )}
          <Icon
            className={cn(
              'size-[18px] shrink-0 transition-colors',
              active ? 'text-white' : 'text-white/68 group-hover:text-white/90',
            )}
            style={active ? { color: 'var(--accent2)' } : undefined}
          />
          {!collapsed && <span className="min-w-0 flex-1 truncate leading-tight">{item.label}</span>}
        </Link>

        {/* Chevron toggle — csak ha van almenü és nem collapsed */}
        {hasChildren && !collapsed && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
            aria-label={expanded ? `${item.label} almenü becsukása` : `${item.label} almenü kibontása`}
            aria-expanded={expanded}
            className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-[0.7rem] text-white/65 transition hover:bg-white/10 hover:text-white [@media(max-height:820px)]:size-6"
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        )}
      </div>

      {/* Almenü-elemek — sablon szerinti behúzás, accent-pötty az aktívnál */}
      {showChildren && (
        <div className="mt-0.5 space-y-0.5 pl-7">
          {item.children!.map((child) => {
            const childActive = isActivePath(pathname, child.href)
            const childWalkthroughKey = `menu-${child.href.replace(/^\//, '').replace(/[#?].*$/, '').split('/').join('-')}`
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                aria-label={child.label}
                data-walkthrough={childWalkthroughKey}
                suppressHydrationWarning
                className={cn(
                  'group flex w-full items-center gap-2.5 rounded-[8px] px-3 py-1.5 text-[12px] transition [@media(max-height:820px)]:py-1 [@media(max-height:820px)]:text-[11px]',
                  childActive
                    ? 'bg-white/12 text-white font-semibold'
                    : 'text-white/65 hover:bg-white/6 hover:text-white',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-block size-1.5 shrink-0 rounded-full transition-colors',
                    childActive ? '' : 'bg-white/35',
                  )}
                  style={childActive ? { background: 'var(--accent2)' } : undefined}
                />
                <span className="truncate leading-tight">{child.label}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SidebarSection({
  title,
  items,
  pathname,
  collapsed,
  Link,
  onNavigate,
}: {
  title: string
  items: MenuItem[]
  pathname: string
  collapsed: boolean
  Link: SidebarLinkComponent
  onNavigate?: () => void
}) {
  return (
    <section
      className={cn(
        'space-y-1 [@media(max-height:1040px)]:space-y-0.5 [@media(max-height:820px)]:space-y-0',
        collapsed && 'space-y-0.5',
      )}
    >
      {!collapsed && (
        <div className="px-2.5 [@media(max-height:760px)]:hidden">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
            {title}
          </p>
        </div>
      )}

      <div className={cn('space-y-0.5', collapsed && 'space-y-0.5')}>
        {items.map((item) => (
          <SidebarItem
            key={item.href}
            item={item}
            pathname={pathname}
            collapsed={collapsed}
            Link={Link}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// SidebarNav — brand + szekciók + god-mode sáv
// ─────────────────────────────────────────────────────────────────────────

interface SidebarNavProps {
  Link: SidebarLinkComponent
  logoSrc: string
  pathname: string

  isEsperes: boolean
  isAdmin: boolean
  isEgyhazkeruletiAdmin?: boolean
  isMasterAdmin?: boolean
  isKonyvelo?: boolean
  isSzamvevo?: boolean
  hasCongregation: boolean
  assignedCongregationsCount?: number
  isGodMode: boolean

  collapsed: boolean
  allowCollapse: boolean
  onToggleCollapsed?: () => void
  onNavigate?: () => void
  activeScope?: 'system' | 'district' | 'diocese' | 'congregation' | null
  financeSubmenu?: MenuItem[]
}

function SidebarNav({
  Link,
  logoSrc,
  pathname,
  isEsperes,
  isAdmin,
  isEgyhazkeruletiAdmin = false,
  isMasterAdmin = false,
  isKonyvelo = false,
  isSzamvevo = false,
  hasCongregation,
  assignedCongregationsCount = 0,
  isGodMode,
  collapsed,
  allowCollapse,
  onToggleCollapsed,
  onNavigate,
  activeScope = null,
  financeSubmenu,
}: SidebarNavProps) {
  const sections: MenuSection[] = []

  const hasExplicitScope = activeScope !== null
  const isCongregationScope = activeScope === 'congregation'
  const isDioceseScope = activeScope === 'diocese'
  const isDistrictScope = activeScope === 'district'
  const isSystemScope = activeScope === 'system'
  const showCongregationSections = hasExplicitScope ? (isCongregationScope || isDioceseScope) : hasCongregation
  const showDioceseSection = hasExplicitScope ? false : isEsperes
  const showDistrictSection = hasExplicitScope ? isDistrictScope : (isEgyhazkeruletiAdmin || isAdmin)
  const showAdminSection = hasExplicitScope ? (isSystemScope && isAdmin) : isMasterAdmin

  const dynamicDashboardItem: MenuItem = isDioceseScope
    ? { label: 'Egyházmegyei irányítópult', href: '/dashboard-egyhazmegye', icon: LayoutDashboard, gradient: 'from-teal-400 to-emerald-500' }
    : isDistrictScope
      ? { label: 'Kerületi irányítópult', href: '/dashboard-kerulet', icon: LayoutDashboard, gradient: 'from-teal-400 to-emerald-500' }
      : { label: 'Irányítópult', href: '/dashboard', icon: LayoutDashboard, gradient: 'from-teal-400 to-emerald-500' }

  // A Pénzügy menüpontot — ha kapunk financeSubmenu-t — bővítjük
  // a kibontható almenüvel (Sprint Q F1.6, v0.7.6).
  const financeMenuItem: MenuItem = {
    label: 'Pénzügy',
    href: '/penzugy',
    icon: Wallet,
    gradient: 'from-amber-400 to-orange-500',
    ...(financeSubmenu && financeSubmenu.length > 0 ? { children: financeSubmenu } : {}),
  }

  const dioceseMainItems: MenuItem[] = [dynamicDashboardItem, financeMenuItem]

  const effectiveMainItems: MenuItem[] = isDioceseScope
    ? dioceseMainItems
    : [
        dynamicDashboardItem,
        ...mainItems.slice(1).map((m) => (m.href === '/penzugy' ? financeMenuItem : m)),
      ]

  if (showCongregationSections) {
    if (isDioceseScope) {
      sections.push({ title: 'Fő modulok', items: effectiveMainItems })
      sections.push({ title: 'Profilom', items: profileItems })
    } else {
      sections.push(
        { title: 'Fő modulok', items: effectiveMainItems },
        { title: 'Szolgálati adminisztráció', items: operativeItems },
        { title: 'Közösségi tér', items: communityItems },
      )
    }
  }

  const isFinancialReviewer = (isKonyvelo || isSzamvevo) && !hasCongregation
  if (isFinancialReviewer && assignedCongregationsCount > 0) {
    // Pénzügyi review-nál is bővítjük az item-et a financeSubmenu-vel,
    // ha kaptunk almenüt.
    const reviewerFinanceItem: MenuItem =
      financeSubmenu && financeSubmenu.length > 0
        ? { ...financialReviewItems[0], children: financeSubmenu }
        : financialReviewItems[0]
    sections.push({ title: 'Pénzügyi review', items: [reviewerFinanceItem] })
  }

  if (isFinancialReviewer) {
    sections.push({ title: 'Profilom', items: profileItems })
  }

  if (showDioceseSection) {
    sections.push({ title: 'Egyházmegyei nézet', items: dioceseItems })
  }

  if (showDistrictSection) {
    sections.push({ title: 'Egyházkerületi nézet', items: districtItems })
  }

  if (showAdminSection) {
    sections.push({ title: 'Rendszerszint', items: adminItems })
  }

  return (
    <div
      className="sidebar-adaptive relative flex h-full w-full flex-col overflow-hidden"
      data-walkthrough="sidebar"
      suppressHydrationWarning
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-3.5rem] top-[-2rem] h-36 w-36 rounded-full bg-amber-300/18 blur-3xl" />
        <div className="absolute bottom-8 right-[-2.5rem] h-32 w-32 rounded-full bg-cyan-300/14 blur-3xl" />
      </div>

      <div className="relative flex h-full min-h-0 flex-col">
        <button
          type="button"
          onClick={allowCollapse ? onToggleCollapsed : undefined}
          aria-label={collapsed ? 'Oldalsáv kinyitása' : 'Oldalsáv összecsukása'}
          className={cn(
            'group flex w-full flex-col items-center gap-2 transition-[padding] duration-300',
            collapsed
              ? 'px-2 pb-2.5 pt-3.5'
              : 'px-5 pb-4 pt-6 [@media(max-height:980px)]:pb-3 [@media(max-height:980px)]:pt-4 [@media(max-height:820px)]:pb-2 [@media(max-height:820px)]:pt-3',
          )}
        >
          <img
            src={logoSrc}
            alt="Kartotéka"
            className={cn(
              'object-contain transition-[width,height] duration-300 drop-shadow-[0_12px_22px_rgba(0,0,0,0.28)]',
              collapsed
                ? 'size-10'
                : 'size-[108px] [@media(max-height:980px)]:size-[88px] [@media(max-height:820px)]:size-[72px]',
            )}
          />
        </button>

        <nav
          className={cn(
            'relative min-h-0 flex-1 overflow-hidden px-2.5 pb-1.5 [@media(max-height:820px)]:px-2 [@media(max-height:820px)]:pb-1',
            collapsed
              ? 'space-y-1'
              : 'space-y-2 [@media(max-height:1040px)]:space-y-1 [@media(max-height:820px)]:space-y-0.5',
          )}
        >
          {sections.map((section) => (
            <SidebarSection
              key={section.title}
              title={section.title}
              items={section.items}
              pathname={pathname}
              collapsed={collapsed}
              Link={Link}
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        {isGodMode && (
          <div className="relative px-2 pb-2.5 [@media(max-height:1040px)]:hidden">
            <div
              className={cn(
                'flex items-center justify-center gap-2 rounded-[1rem] border border-red-300/18 bg-red-400/12 px-3 py-1.5 text-[11px] font-semibold text-red-100',
                collapsed && 'px-2 py-2',
              )}
              title={collapsed ? 'Rendszergazdai mód aktív' : undefined}
            >
              <Zap className="size-4" />
              {!collapsed && 'Rendszergazdai mód aktív'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// KartotekaSidebar — kiírható komponens
// ─────────────────────────────────────────────────────────────────────────

export function KartotekaSidebar({
  Link,
  currentPath,
  logoSrc,
  isMasterAdmin,
  isAdmin,
  isEgyhazkeruletiAdmin = false,
  isEsperes,
  isKonyvelo = false,
  isSzamvevo = false,
  hasCongregation,
  assignedCongregationsCount = 0,
  isGodMode,
  mobileOpen,
  onMobileClose,
  collapsed,
  onToggleCollapsed,
  activeScope = null,
  financeSubmenu,
}: KartotekaSidebarProps) {
  const navProps = {
    Link,
    logoSrc,
    pathname: currentPath,
    isEsperes,
    isAdmin,
    isEgyhazkeruletiAdmin,
    isMasterAdmin,
    isKonyvelo,
    isSzamvevo,
    hasCongregation,
    assignedCongregationsCount,
    isGodMode,
    activeScope,
    financeSubmenu,
  }
  const shellBaseClassName =
    'relative shrink-0 overflow-hidden border-r border-white/10 bg-[var(--sidebar)] text-[var(--sidebar-foreground)]'
  const desktopShellClassName = cn(shellBaseClassName, 'h-dvh')
  const mobileShellClassName = cn(shellBaseClassName, 'h-dvh min-h-dvh')

  return (
    <>
      <aside
        className={cn(
          'hidden lg:flex transition-[width] duration-300 ease-out',
          collapsed
            ? 'w-[92px]'
            : 'w-[288px] [@media(max-height:880px)]:w-[272px] [@media(max-height:720px)]:w-[258px]',
          desktopShellClassName,
        )}
      >
        <SidebarNav
          {...navProps}
          collapsed={collapsed}
          allowCollapse
          onToggleCollapsed={onToggleCollapsed}
        />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={(open: boolean) => { if (!open) onMobileClose() }}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className={cn(
            'top-0 w-[88vw] max-w-[22rem] border-r-0 p-0 max-h-screen sm:max-w-[24rem] md:max-w-[25rem]',
            mobileShellClassName,
          )}
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
