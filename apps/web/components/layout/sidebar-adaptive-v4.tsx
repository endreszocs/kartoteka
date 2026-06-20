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
import { SidebarDecor } from '@/components/layout/sidebar-decor'

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
  /** Az Anyakönyv menüpont kibontható almenüje (2026-04-28).
   *  Hash-alapú navigáció: `/anyakonyv#keresztseg` stb. */
  anyakonyvSubmenu?: MenuItem[]
  /** Az Admin Panel kibontható almenüje (2026-05-02, Sprint U.4).
   *  13 önálló /admin/<slug> oldal. */
  adminSubmenu?: MenuItem[]
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
  // A "gyűjtő"/áttekintő útvonalak (/dashboard, /admin) CSAK pontos egyezésnél
  // aktívak — különben minden alaloldalon kijelölve maradnának. (Pl. az admin
  // "Áttekintés" almenüpont (/admin) eddig a /admin/* oldalakon is aktív volt.)
  if (href === '/dashboard' || href === '/admin') return false
  return pathname.startsWith(`${href}/`)
}

/**
 * Egy menüpont — kibontható almenüvel, ha van `children`.
 *
 * 2026-06-02 v2 — accordion mód: csak EGY menü lehet egyszerre nyitva.
 * Az `expanded` állapot a szülő SidebarNav-on él (`expandedHref`), amit
 * pathname-re reagálva auto-szinkronizál. Ettől:
 *   - csak az nyílik ki, amelyiknek az URL-jén dolgozunk
 *   - a kattintásra a többi automatikusan becsukódik (akkordeon)
 *
 * Animáció: grid-rows trükk (0fr → 1fr) — height-anim, no JS, smooth.
 * A child-elemek stagger-elt fade-slide-in animációval érkeznek.
 */
function SidebarItem({
  item,
  pathname,
  collapsed,
  onNavigate,
  expanded,
  onToggle,
}: {
  item: MenuItem
  pathname: string
  collapsed: boolean
  onNavigate?: () => void
  expanded: boolean
  onToggle: () => void
}) {
  const Icon = item.icon
  const walkthroughKey = `menu-${item.href.replace(/^\//, '').split('/')[0]}`
  const hasChildren = !!item.children && item.children.length > 0

  const parentActive = isActivePath(pathname, item.href)
  const childActive =
    hasChildren && item.children!.some((c) => {
      const [path, hash] = c.href.split('#')
      if (hash) {
        return (
          pathname === path &&
          typeof window !== 'undefined' &&
          window.location.hash === `#${hash}`
        )
      }
      // Hash-mentes default-child: csak akkor aktív, ha az URL-en sincs hash
      // (különben az "Áttekintés" mindig aktívnak látszott más hash-fülön is)
      const siblingHasHash = item.children!.some((sib) => sib.href.includes('#'))
      if (siblingHasHash) {
        return (
          isActivePath(pathname, c.href) &&
          (typeof window === 'undefined' || !window.location.hash)
        )
      }
      return isActivePath(pathname, c.href)
    })
  const active = parentActive || childActive

  // Hash változás figyelése — re-render trigger ha hash változik
  const [, setHashTick] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    function handleHashChange() {
      setHashTick((v) => v + 1)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return (
    <div className="space-y-0.5">
      <div className="relative">
        <Link
          href={item.href}
          onClick={(e) => {
            // 2026-06-21 (Endre kérése): ha a fő-menüpontnak van almenüje és a sáv
            // ki van bontva, a rákattintás NEM navigál — csak KINYITJA / becsukja
            // az almenüt, és onnan választ a felhasználó, hová lép tovább.
            // (Az áttekintő oldal az almenü első eleméből (pl. „Áttekintés") érhető el;
            //  középső kattintás / új lapon megnyitás továbbra is a linkre megy.)
            if (hasChildren && !collapsed) {
              e.preventDefault()
              // Csak NYITUNK a fő-pontra kattintva. Ha az almenü MÁR nyitva van (pl. mert
              // ezen az oldalon vagyunk → az auto-expand kinyitotta), a kattintás NE csukja be
              // — a becsukás a chevron gomb dolga. (Regresszió-javítás 2026-06-20: a toggle
              // azonnal becsukta a már nyitott almenüt, ezért tűnt úgy, hogy „nem működik".)
              if (!expanded) onToggle()
              return
            }
            onNavigate?.()
          }}
          title={collapsed ? item.label : undefined}
          aria-label={item.label}
          data-walkthrough={walkthroughKey}
          suppressHydrationWarning
          className={cn(
            'group relative flex w-full items-center gap-2.5 overflow-hidden rounded-[12px] px-2.5 py-2 text-[13.5px] font-medium tracking-[-0.005em] transition-all duration-300 ease-out [@media(max-height:820px)]:py-1.5 [@media(max-height:820px)]:text-[12.5px]',
            active
              ? 'bg-gradient-to-r from-white/14 via-white/8 to-transparent text-white font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
              : 'text-white/78 hover:bg-white/6 hover:text-white hover:translate-x-[1px]',
            collapsed && 'justify-center px-2 py-2',
            hasChildren && !collapsed && 'pr-9',
          )}
        >
          {/* Aktív bal csík — finom glow-val */}
          {active && !collapsed && (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r shadow-[0_0_8px_currentColor]"
              style={{ background: 'var(--accent2)', color: 'var(--accent2)' }}
            />
          )}
          {/* Aktív halvány sheen — szín-mosó effekt jobbra */}
          {active && !collapsed && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-white/[0.04] to-transparent"
            />
          )}
          {/* Ikon-chip: gradient háttérrel */}
          <span
            className={cn(
              'relative flex size-7 shrink-0 items-center justify-center rounded-[9px] transition-all duration-300 ease-out [@media(max-height:820px)]:size-[26px]',
              active
                ? `bg-gradient-to-br ${item.gradient} shadow-[0_4px_14px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.25)] scale-105`
                : 'bg-white/6 group-hover:bg-white/10 group-hover:scale-105',
            )}
          >
            <Icon
              className={cn(
                'size-[15px] transition-all duration-200',
                active ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]' : 'text-white/72 group-hover:text-white/95',
              )}
            />
            {/* Aktív állapotban: pici fény-pötty az ikon jobb felső sarkán */}
            {active && (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)]"
              />
            )}
          </span>
          {!collapsed && <span className="min-w-0 flex-1 truncate leading-tight">{item.label}</span>}
        </Link>

        {hasChildren && !collapsed && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggle()
            }}
            aria-label={expanded ? `${item.label} almenü becsukása` : `${item.label} almenü kibontása`}
            aria-expanded={expanded}
            className="group/chev absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-white/55 transition-all duration-300 hover:bg-white/10 hover:text-white [@media(max-height:820px)]:size-6"
          >
            <ChevronRight
              className={cn(
                'size-3.5 transition-transform duration-300 ease-out',
                expanded && 'rotate-90',
              )}
            />
          </button>
        )}
      </div>

      {/* PRÉMIUM SUBMENU: grid-rows animation (no JS) + glass effect + stagger */}
      {hasChildren && !collapsed && (
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out',
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div
              className={cn(
                'relative ml-[18px] mt-1.5 mb-1 space-y-1 rounded-[12px] bg-gradient-to-b from-white/[0.06] to-white/[0.01] px-2 py-2 backdrop-blur-[1px]',
                // bal vonal — animáltan rajzolódik amikor kibontunk
                'before:absolute before:bottom-2 before:left-0 before:top-2 before:w-px before:bg-gradient-to-b before:from-white/30 before:via-white/20 before:to-white/5 before:transition-opacity before:duration-500',
                expanded ? 'before:opacity-100' : 'before:opacity-0',
              )}
            >
              {item.children!.map((child, idx) => {
                const [childPath, childHash] = child.href.split('#')
                // 2026-06-02 BUG FIX: hash-mentes child (pl. "Áttekintés"
                // = /tagnyilvantartas) eddig MINDIG aktívnak látszott amikor
                // a pathname matchel — akkor is amikor egy testvér hash-fülön
                // (pl. #persons) voltunk. Most: ha a fő-menü-nek vannak
                // hash-szel rendelkező childoki, akkor a hash-mentes "default"
                // gyermek CSAK akkor aktív, ha az URL-en sincs hash.
                const siblingHasHash = item.children!.some((c) => c.href.includes('#'))
                const isChildActive = childHash
                  ? pathname === childPath &&
                    typeof window !== 'undefined' &&
                    window.location.hash === `#${childHash}`
                  : siblingHasHash
                    ? isActivePath(pathname, child.href) &&
                      (typeof window === 'undefined' || !window.location.hash)
                    : isActivePath(pathname, child.href)
                const childWalkthroughKey = `menu-${child.href.replace(/^\//, '').replace(/[#?].*$/, '').split('/').join('-')}`
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={(e) => {
                      onNavigate?.()
                      // Hash-alapú almenü ugyanazon az oldalon: a Next.js Link
                      // pushState-et használ, ami NEM vált ki `hashchange` eseményt,
                      // így a fül-komponensek (finance/registry/member) nem váltanának.
                      // Ezért azonos útvonalnál kézzel állítjuk a hash-t (ez kivált
                      // egy valódi `hashchange`-et → a fül frissül).
                      if (childHash && typeof window !== 'undefined' && window.location.pathname === childPath) {
                        e.preventDefault()
                        if (window.location.hash !== `#${childHash}`) {
                          window.location.hash = childHash
                        }
                      }
                    }}
                    aria-label={child.label}
                    data-walkthrough={childWalkthroughKey}
                    suppressHydrationWarning
                    style={{
                      // Stagger fade-slide: minden child kicsit később úszik be
                      transitionDelay: expanded ? `${idx * 35}ms` : '0ms',
                    }}
                    className={cn(
                      'group/child relative flex w-full items-center gap-2.5 rounded-[10px] pl-3.5 pr-3 py-2 text-[13px] transition-all duration-200 ease-out [@media(max-height:820px)]:py-1.5 [@media(max-height:820px)]:text-[12px]',
                      expanded
                        ? 'translate-x-0 opacity-100'
                        : 'translate-x-1 opacity-0',
                      isChildActive
                        ? 'bg-white/[0.14] text-white font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-white/10'
                        : 'text-white/70 hover:bg-white/[0.09] hover:text-white active:bg-white/[0.13]',
                    )}
                  >
                    {/* Bal kapcsolódási stub-vonal — child→fő-vonal */}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute -left-[8px] top-1/2 h-px w-2 -translate-y-1/2 transition-colors duration-300',
                        isChildActive ? 'bg-white/40' : 'bg-white/15',
                      )}
                    />
                    {/* Pötty — aktív állapotban pulse + glow */}
                    <span
                      aria-hidden
                      className={cn(
                        'relative inline-block size-2 shrink-0 rounded-full transition-all duration-300',
                        isChildActive ? '' : 'bg-white/30 group-hover/child:bg-white/55',
                      )}
                      style={
                        isChildActive
                          ? {
                              background: 'var(--accent2)',
                              boxShadow: '0 0 8px var(--accent2), 0 0 14px color-mix(in srgb, var(--accent2) 35%, transparent)',
                            }
                          : undefined
                      }
                    />
                    <span className="truncate leading-tight">{child.label}</span>
                    {/* Aktív állapot: jobb oldali chevron (deli vissza-jelzés) */}
                    {isChildActive && (
                      <ChevronRight
                        aria-hidden
                        className="ml-auto size-3 shrink-0 opacity-60"
                        style={{ color: 'var(--accent2)' }}
                      />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
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
  expandedHref,
  onToggleHref,
}: {
  title: string
  items: MenuItem[]
  pathname: string
  collapsed: boolean
  onNavigate?: () => void
  expandedHref: string | null
  onToggleHref: (href: string) => void
}) {
  return (
    <section className={cn('space-y-1 [@media(max-height:1040px)]:space-y-0.5 [@media(max-height:820px)]:space-y-0', collapsed && 'space-y-0.5')}>
      {!collapsed && (
        <div className="flex items-center gap-2 px-2.5 pb-0.5 [@media(max-height:760px)]:hidden">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/55">
            {title}
          </p>
          <div aria-hidden className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
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
            expanded={expandedHref === item.href}
            onToggle={() => onToggleHref(item.href)}
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
  anyakonyvSubmenu,
  adminSubmenu,
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
  /** Az Anyakönyv menüpont kibontható almenüje (2026-04-28). */
  anyakonyvSubmenu?: MenuItem[]
  /** Az Admin Panel kibontható almenüje (2026-05-02, Sprint U.4). */
  adminSubmenu?: MenuItem[]
}) {
  const pathname = usePathname()
  const sections: MenuSection[] = []

  // 2026-06-02 v2 — akkordeon-szerű állapot: csak EGY menü lehet egyszerre
  // nyitva. Az `expandedHref` az aktuálisan kibontott menü `href`-jét tartja
  // (null = mind csukva). Pathname-ről auto-szinkron: amikor a felhasználó
  // egy submenu-elemen navigál, a hozzá tartozó fő-menü kinyílik, a többi
  // becsukódik. A felhasználó kattintással felülbírálhatja (más menüt nyit).
  const [expandedHref, setExpandedHref] = useState<string | null>(null)

  // Pathname → auto-expand: megkeressük melyik MenuItem.href prefixje
  // illeszkedik az URL-re. Csak akkor frissítünk ha tényleg változás van
  // (hogy a felhasználó manuálisan-nyitott menüjét ne csukjuk be).
  useEffect(() => {
    // A három fő-menü amik submenu-kkel rendelkeznek
    const candidates = ['/penzugy', '/tagnyilvantartas', '/anyakonyv']
    for (const href of candidates) {
      if (pathname === href || pathname.startsWith(`${href}/`)) {
        setExpandedHref(href)
        return
      }
    }
    // Egyébként ne piszkáljuk az állapotot — a felhasználó által nyitva
    // hagyott menü maradjon nyitva navigáció közben is.
  }, [pathname])

  // 2026-06-02: Custom event a fő-menüpontra kattintáshoz. Ezt a SidebarItem
  // Link onClick-jébe dispatch-eljük — biztosítja hogy a kattintás AZONNAL
  // szinkronizálja az akkordeon állapotot, függetlenül a router prefetch
  // időzítésétől.
  useEffect(() => {
    if (typeof window === 'undefined') return
    function handler(e: Event) {
      const ev = e as CustomEvent<string>
      if (typeof ev.detail === 'string') {
        setExpandedHref(ev.detail)
      }
    }
    window.addEventListener('sidebar-expand-href', handler)
    return () => window.removeEventListener('sidebar-expand-href', handler)
  }, [])

  const handleToggleHref = (href: string) => {
    setExpandedHref((prev) => (prev === href ? null : href))
  }

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

  // Az Anyakönyv menüpontot — ha kapunk anyakonyvSubmenu-t — bővítjük (2026-04-28).
  const anyakonyvMenuItem: MenuItem = {
    label: 'Anyakönyv',
    href: '/anyakonyv',
    icon: BookOpen,
    gradient: 'from-rose-400 to-fuchsia-500',
    ...(anyakonyvSubmenu && anyakonyvSubmenu.length > 0
      ? { children: anyakonyvSubmenu }
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
          if (m.href === '/anyakonyv') return anyakonyvMenuItem
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
  //
  // 2026-05-02 (v0.9.37) — felhasználó kérése: az "Admin Panel" eddig egy
  // kibontható menüpont volt, alatta 13 almenü. Most mind a 13 EGYENRANGÚ
  // főmenüpont a "Rendszerszint" szekcióban, saját ikonokkal. A submenu
  // pattern megszűnt — a felhasználó tisztább, áttekinthetőbb listát kért.
  if (showAdminSection) {
    const adminMainItems: MenuItem[] = adminSubmenu && adminSubmenu.length > 0
      ? adminSubmenu.map((m) => ({ ...m })) // shallow copy, children nélkül
      : [adminItems[0]] // fallback: csak az "Admin Panel" link
    sections.push({ title: 'Rendszerszint', items: adminMainItems })
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

      {/* Sablon-szerű téma-specifikus motívum-overlay (Trellis/Dove) */}
      <SidebarDecor />

      <div className="relative flex h-full min-h-0 flex-col">
        <button
          type="button"
          onClick={allowCollapse ? onToggleCollapsed : undefined}
          aria-label={collapsed ? 'Oldalsáv kinyitása' : 'Oldalsáv összecsukása'}
          className={cn(
            'group flex w-full flex-col items-center gap-2 transition-[padding] duration-300',
            collapsed
              ? 'px-2 pb-2.5 pt-3.5'
              : 'px-5 pb-4 pt-6 [@media(max-height:980px)]:pb-3 [@media(max-height:980px)]:pt-4 [@media(max-height:820px)]:pb-2 [@media(max-height:820px)]:pt-3'
          )}
        >
          <Image
            src="/kartoteka-logo.png"
            alt="Kartotéka"
            width={collapsed ? 40 : 108}
            height={collapsed ? 40 : 108}
            className={cn(
              'object-contain transition-[width,height] duration-300 drop-shadow-[0_12px_22px_rgba(0,0,0,0.28)]',
              collapsed
                ? 'size-10'
                : 'size-[108px] [@media(max-height:980px)]:size-[88px] [@media(max-height:820px)]:size-[72px]'
            )}
            priority
          />
        </button>

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
              expandedHref={expandedHref}
              onToggleHref={handleToggleHref}
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
  anyakonyvSubmenu,
  adminSubmenu,
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
    anyakonyvSubmenu,
    adminSubmenu,
  }
  // Sprint S F1 — téma-aware sidebar háttér (a hardkódolt #14514b→#16334e
  // gradient cserélődött a `--sidebar` CSS-vars-ra, ami a 3 téma szerint
  // változik: Kerített kert #143030, Csendes parókia #1f3a3a, Zsoltáros #2a2218.
  // A finom gradient-effektust egy halvány overlay-jel megtartjuk.
  const shellBaseClassName =
    'relative shrink-0 overflow-hidden border-r border-white/10 text-[var(--sidebar-foreground)] bg-[var(--sidebar)]'
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
