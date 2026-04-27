'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Building2,
  Castle,
  ChevronDown,
  ChevronLeft,
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

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface SidebarProps {
  isMasterAdmin: boolean
  isAdmin: boolean
  /** 2026-04-16: külön szerepkör. Opcionális a backward compat miatt. */
  isEgyhazkeruletiAdmin?: boolean
  isEsperes: boolean
  /** 2026-04-16: könyvelő szerepkör (gyülekezeti szintű pénzügyi review). */
  isKonyvelo?: boolean
  /** 2026-04-16: egyházmegyei számvevő (auditori szerep). */
  isSzamvevo?: boolean
  hasCongregation: boolean
  /** Jóváhagyott gyülekezet-hozzárendelések száma (konyvelo/szamvevo számára). */
  assignedCongregationsCount?: number
  isGodMode: boolean
  mobileOpen: boolean
  onMobileClose: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
  /** 2026-04-18 SCOPE-AWARE: az aktuálisan aktív profile_role scope-ja.
   *  Diocese esetén az "Irányítópult" label + href változik és csak a
   *  Pénzügy modul jelenik meg fő modulok között. */
  activeScope?: 'system' | 'district' | 'diocese' | 'congregation' | null
  /** A Pénzügy menüpont kibontható almenüje (Sprint Q F1.6, v0.7.6).
   *  Hash-alapú navigáció: `/penzugy#cashbook` stb. */
  financeSubmenu?: MenuItem[]
  /** A Tagnyilvántartás menüpont kibontható almenüje (2026-04-28).
   *  Hash-alapú navigáció: `/tagnyilvantartas#persons` stb. */
  tagnyilvantartasSubmenu?: MenuItem[]
}

interface MenuItem {
  label: string
  href: string
  icon: LucideIcon
  gradient: string
  /**
   * Kibontható almenü gyermek-elemei (Sprint Q F1.6, v0.7.6, 2026-04-26).
   * Hash-alapú navigáció a finance fülekhez: `/penzugy#cashbook` stb.
   */
  children?: MenuItem[]
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

// Könyvelő / Számvevő: a pénzügyi modulhoz fognak jutni a jóváhagyott gyülekezetekben
const financialReviewItems: MenuItem[] = [
  { label: 'Pénzügyi áttekintés', href: '/penzugy', icon: Wallet, gradient: 'from-amber-400 to-orange-500' },
]

// Profil (mindenki számára: könyvelő/számvevő hozzárendelések, lelkész jóváhagyási kérések)
const profileItems: MenuItem[] = [
  { label: 'Profilom', href: '/profile', icon: Handshake, gradient: 'from-teal-400 to-cyan-500' },
]

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true
  return href !== '/dashboard' && pathname.startsWith(`${href}/`)
}

/**
 * Egy menüpont — kibontható almenüvel, ha van `children`.
 * Hash-alapú aktivitás: `/penzugy#cashbook` matchel ha pathname=='/penzugy'
 * és window.location.hash === '#cashbook'.
 */
function SidebarItem({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: MenuItem
  pathname: string
  collapsed: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  const walkthroughKey = `menu-${item.href.replace(/^\//, '').split('/')[0]}`
  const hasChildren = !!item.children && item.children.length > 0

  const parentActive = isActivePath(pathname, item.href)
  const childActive =
    hasChildren && item.children!.some((c) => {
      const [path, hash] = c.href.split('#')
      if (hash) {
        // hash-alapú: csak akkor aktív, ha pathname matchel ÉS hash matchel
        return (
          pathname === path &&
          typeof window !== 'undefined' &&
          window.location.hash === `#${hash}`
        )
      }
      return isActivePath(pathname, c.href)
    })
  const active = parentActive || childActive

  // Auto-expand: ha bármelyik gyermek aktív vagy a parent matchel.
  const [expanded, setExpanded] = useState(parentActive || childActive)

  useEffect(() => {
    if (parentActive || childActive) setExpanded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Hash változás figyelése — a finance fülek aktivitása frissül
  useEffect(() => {
    if (typeof window === 'undefined') return
    function handleHashChange() {
      // re-render trigger; az `childActive` újraszámolódik a következő render-ben
      setExpanded((v) => v)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

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
            'group flex w-full items-center gap-2 rounded-[0.95rem] border px-2.5 py-2 text-[12px] transition [@media(max-height:1040px)]:gap-1.5 [@media(max-height:1040px)]:rounded-[0.9rem] [@media(max-height:1040px)]:px-2 [@media(max-height:1040px)]:py-1.5 [@media(max-height:1040px)]:text-[11px] [@media(max-height:820px)]:gap-1.5 [@media(max-height:820px)]:rounded-[0.85rem] [@media(max-height:820px)]:px-1.5 [@media(max-height:820px)]:py-1 [@media(max-height:820px)]:text-[10px]',
            active
              ? 'border-white/18 bg-white/14 text-white shadow-[0_18px_28px_-24px_rgba(0,0,0,0.55)]'
              : 'border-transparent text-white/76 hover:border-white/10 hover:bg-white/8 hover:text-white',
            collapsed && 'justify-center rounded-[0.9rem] px-1.5 py-1.5',
            hasChildren && !collapsed && 'pr-9',
          )}
        >
          <div
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-[0.95rem] border border-white/15 bg-white/10 transition [@media(max-height:820px)]:size-7',
              active && `bg-gradient-to-br ${item.gradient} border-white/20`,
              collapsed && 'size-8',
            )}
          >
            <Icon className={cn('size-3.5', active ? 'text-white' : 'text-white/75')} />
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium leading-tight">{item.label}</p>
            </div>
          )}
        </Link>

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
            className={cn(
              'absolute right-1 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-[0.7rem] text-white/65 hover:bg-white/10 hover:text-white transition',
              '[@media(max-height:820px)]:size-6',
            )}
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        )}
      </div>

      {showChildren && (
        <div className="mt-0.5 ml-3 space-y-0.5 border-l border-white/10 pl-2">
          {item.children!.map((child) => {
            const [childPath, childHash] = child.href.split('#')
            const isChildActive = childHash
              ? pathname === childPath &&
                typeof window !== 'undefined' &&
                window.location.hash === `#${childHash}`
              : isActivePath(pathname, child.href)
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
                  'group flex w-full items-center gap-2 rounded-[0.7rem] px-2.5 py-1.5 text-[11px] transition [@media(max-height:820px)]:py-1 [@media(max-height:820px)]:text-[10px]',
                  isChildActive
                    ? 'bg-white/12 text-white font-semibold'
                    : 'text-white/68 hover:bg-white/6 hover:text-white',
                )}
              >
                <span
                  className={cn(
                    'inline-block size-1.5 shrink-0 rounded-full',
                    isChildActive ? 'bg-white' : 'bg-white/40',
                  )}
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
  onNavigate,
}: {
  title: string
  items: MenuItem[]
  pathname: string
  collapsed: boolean
  onNavigate?: () => void
}) {
  return (
    <section className={cn('space-y-1 [@media(max-height:1040px)]:space-y-0.5 [@media(max-height:820px)]:space-y-0', collapsed && 'space-y-0.5')}>
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
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  )
}

function SidebarNav({
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
  tagnyilvantartasSubmenu,
}: {
  isEsperes: boolean
  isAdmin: boolean
  isEgyhazkeruletiAdmin?: boolean
  /** Master admin — jelenleg a SidebarNav nem használja közvetlenül (az isAdmin magában foglalja), de megtartjuk a props-ban a jövőbeli bővítéshez. */
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
  /** 2026-04-18 SCOPE-AWARE: az aktív profile_role scope-ja.
   *  Diocese esetén az "Irányítópult" menüpont "Egyházmegyei irányítópult"-ra
   *  változik és csak a Pénzügy látható. */
  activeScope?: 'system' | 'district' | 'diocese' | 'congregation' | null
  /** A Pénzügy menüpont kibontható almenüje (Sprint Q F1.6, v0.7.6). */
  financeSubmenu?: MenuItem[]
  /** A Tagnyilvántartás menüpont kibontható almenüje (2026-04-28). */
  tagnyilvantartasSubmenu?: MenuItem[]
}) {
  const pathname = usePathname()
  const sections: MenuSection[] = []

  // 2026-04-18: dinamikus "Irányítópult" menüpont scope alapján
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

  // A Tagnyilvántartás menüpontot — ha kapunk tagnyilvantartasSubmenu-t — bővítjük
  // a kibontható almenüvel (2026-04-28).
  const tagnyilvantartasMenuItem: MenuItem = {
    label: 'Tagnyilvántartás',
    href: '/tagnyilvantartas',
    icon: Users,
    gradient: 'from-emerald-400 to-teal-500',
    ...(tagnyilvantartasSubmenu && tagnyilvantartasSubmenu.length > 0
      ? { children: tagnyilvantartasSubmenu }
      : {}),
  }

  // Diocese scope: csak Irányítópult + Pénzügy. A többi modul elrejtve.
  const dioceseMainItems: MenuItem[] = [dynamicDashboardItem, financeMenuItem]

  // Gyülekezeti mainItems dinamikus elemmel
  const effectiveMainItems: MenuItem[] = isDioceseScope
    ? dioceseMainItems
    : [
        dynamicDashboardItem,
        ...mainItems.slice(1).map((m) => {
          if (m.href === '/penzugy') return financeMenuItem
          if (m.href === '/tagnyilvantartas') return tagnyilvantartasMenuItem
          return m
        }),
      ]

  // Lelkész / esperes / admin: a saját gyülekezetük moduljaihoz jutnak
  if (showCongregationSections) {
    if (isDioceseScope) {
      // Diocese scope-ban CSAK a Pénzügy fő modul + Profil
      sections.push({ title: 'Fő modulok', items: effectiveMainItems })
      sections.push({ title: 'Profilom', items: profileItems })
    } else {
      sections.push(
        { title: 'Fő modulok', items: effectiveMainItems },
        { title: 'Szolgálati adminisztráció', items: operativeItems },
        { title: 'Közösségi tér', items: communityItems }
      )
    }
  }

  // Könyvelő / számvevő: pénzügyi review a jóváhagyott gyülekezetekben
  // Csak akkor, ha tényleg van approved hozzárendelés. Ha 0, egy üdvözlő üzenet jön
  // a profil oldalán ("Várakozás lelkészi jóváhagyásra").
  const isFinancialReviewer = (isKonyvelo || isSzamvevo) && !hasCongregation
  if (isFinancialReviewer && assignedCongregationsCount > 0) {
    // Pénzügyi review-nál is bővítjük az item-et a financeSubmenu-vel.
    const reviewerFinanceItem: MenuItem =
      financeSubmenu && financeSubmenu.length > 0
        ? { ...financialReviewItems[0], children: financeSubmenu }
        : financialReviewItems[0]
    sections.push({ title: 'Pénzügyi review', items: [reviewerFinanceItem] })
  }

  // Profil mindenkinek elérhető (saját oldal, hozzáférési kérések kezelése)
  // Csak akkor nem mutatjuk, ha a lelkész már a főnézetben van (mert a header gomb
  // amúgy is elvezet a profilhoz). A könyvelő / számvevő számára viszont külön
  // menüpontként is jó kiemelni.
  if (isFinancialReviewer) {
    sections.push({ title: 'Profilom', items: profileItems })
  }

  if (showDioceseSection) {
    sections.push({ title: 'Egyházmegyei nézet', items: dioceseItems })
  }

  // Egyházkerületi nézet: kerületi admin + admin + master (az isEgyhazkeruletiAdminRole
  // helper már magában foglalja az admin-t és master-t)
  if (showDistrictSection) {
    sections.push({ title: 'Egyházkerületi nézet', items: districtItems })
  }

  // Admin Panel: az admin szerepkör és master admin is láthatja
  // (eddig CSAK a master admin látta — ez változás!)
  if (showAdminSection) {
    sections.push({ title: 'Rendszerszint', items: adminItems })
  }

  return (
    <div
      className="sidebar-adaptive relative flex h-full flex-col overflow-hidden"
      data-walkthrough="sidebar"
      suppressHydrationWarning
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-3.5rem] top-[-2rem] h-36 w-36 rounded-full bg-amber-300/18 blur-3xl" />
        <div className="absolute bottom-8 right-[-2.5rem] h-32 w-32 rounded-full bg-cyan-300/14 blur-3xl" />
      </div>

      <div className="relative flex h-full min-h-0 flex-col">
        <div className="px-2.5 pb-2.5 pt-3 [@media(max-height:1040px)]:px-2.5 [@media(max-height:1040px)]:pb-2 [@media(max-height:1040px)]:pt-2.5 [@media(max-height:820px)]:px-2 [@media(max-height:820px)]:pb-1.5 [@media(max-height:820px)]:pt-2">
          <button
            type="button"
            onClick={allowCollapse ? onToggleCollapsed : undefined}
            className={cn(
              'sidebar-brand-card relative flex w-full items-center rounded-[1.4rem] border border-white/14 bg-white/10 p-3 text-left shadow-[0_24px_45px_-32px_rgba(0,0,0,0.6)] backdrop-blur-xl transition hover:bg-white/12 [@media(max-height:1040px)]:rounded-[1.2rem] [@media(max-height:1040px)]:p-2.5 [@media(max-height:820px)]:rounded-[1rem] [@media(max-height:820px)]:p-2',
              collapsed ? 'justify-center px-2 py-2.5' : 'gap-2.5'
            )}
            aria-label={collapsed ? 'Oldalsáv kinyitása' : 'Oldalsáv összecsukása'}
          >
            <div className={cn('flex size-11 items-center justify-center rounded-[1rem] [@media(max-height:1040px)]:size-10 [@media(max-height:820px)]:size-9', collapsed && 'size-10')}>
              <Image src="/EREK.png" alt="Kartotéka" width={38} height={38} className="object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.22)]" />
            </div>

            {!collapsed && (
              <>
                <div className="sidebar-brand min-w-0 flex-1">
                  <h2 className="font-heading text-[1.46rem] leading-none text-white [@media(max-height:1040px)]:text-[1.3rem] [@media(max-height:820px)]:text-[1.08rem]">
                    Kartotéka
                  </h2>
                  <p className="mt-1 text-[10px] leading-tight text-white/68 [@media(max-height:980px)]:hidden">
                    EREK nyilvántartási rendszer
                  </p>
                </div>

                {allowCollapse && (
                  <div className="flex size-7 items-center justify-center rounded-2xl bg-white/10 text-white/78 [@media(max-height:820px)]:size-6">
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
        </div>

        <nav
          className={cn(
            'relative min-h-0 flex-1 overflow-hidden px-2.5 pb-1.5 [@media(max-height:820px)]:px-2 [@media(max-height:820px)]:pb-1',
            collapsed ? 'space-y-1' : 'space-y-2 [@media(max-height:1040px)]:space-y-1 [@media(max-height:820px)]:space-y-0.5'
          )}
        >
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

        {isGodMode && (
          <div className="relative px-2 pb-2.5 [@media(max-height:1040px)]:hidden">
            <div
              className={cn(
                'flex items-center justify-center gap-2 rounded-[1rem] border border-red-300/18 bg-red-400/12 px-3 py-1.5 text-[11px] font-semibold text-red-100',
                collapsed && 'px-2 py-2'
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

export function SidebarAdaptiveV4({
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
  tagnyilvantartasSubmenu,
}: SidebarProps) {
  const navProps = {
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
    tagnyilvantartasSubmenu,
  }
  const shellBaseClassName =
    'relative shrink-0 overflow-hidden border-r border-white/10 bg-[linear-gradient(180deg,#14514b_0%,#11454a_52%,#16334e_100%)] text-white'
  const desktopShellClassName = cn(shellBaseClassName, 'h-dvh')
  const mobileShellClassName = cn(shellBaseClassName, 'h-dvh min-h-dvh')

  return (
    <>
      <aside
        className={cn(
          'hidden lg:flex transition-[width] duration-300 ease-out',
          collapsed ? 'w-[92px]' : 'w-[288px] [@media(max-height:880px)]:w-[272px] [@media(max-height:720px)]:w-[258px]',
          desktopShellClassName
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
          className={cn(
            'top-0 w-[88vw] max-w-[22rem] border-r-0 p-0 max-h-screen sm:max-w-[24rem] md:max-w-[25rem]',
            mobileShellClassName
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
