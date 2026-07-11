'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  Bell,
  BookMarked,
  Building2,
  Church,
  ClipboardList,
  Coins,
  CreditCard,
  Cross,
  Database,
  Download,
  Eye,
  Flame,
  Heart,
  HelpCircle,
  History,
  Home,
  Inbox,
  Landmark,
  Layers,
  LifeBuoy,
  LogIn,
  LogOut,
  PiggyBank,
  PlaneLanding,
  PlaneTakeoff,
  ScrollText,
  ShieldAlert,
  Sparkles,
  User,
  UserCheck,
  UserCog,
  Users2,
  Vote,
  Wallet,
} from 'lucide-react'
import { SidebarAdaptiveV4 } from './sidebar-adaptive-v4'
import { DashboardShell } from './dashboard-shell'
import { BottomVerse } from './bottom-verse'
import { DioceseSetupBanner } from './diocese-setup-banner'
import { CongregationSetupBanner } from './congregation-setup-banner'
import type { Profile } from '@/lib/types/auth'
import type { Role } from '@/lib/types/auth'
import type { ProfileRoleRow } from '@/lib/profile-roles/types'

/**
 * A Pénzügy menüpont kibontható almenüje a webes oldalon
 * (Sprint Q F1.6, v0.7.6, 2026-04-26).
 *
 * 11 fül a webes /penzugy oldalon — hash-alapú navigáció (`#cashbook` stb.)
 * a `finance-tabs.tsx` `useState('dashboard')` activeTab-jával összehangolva.
 *
 * A sub-item-eknél az icon és gradient nem jelenik meg a UI-on (csak bullet
 * látszik), de a `MenuItem` típus kötelezi őket.
 */
const WEB_FINANCE_SUBMENU = [
  { label: 'Áttekintés', href: '/penzugy#dashboard', icon: Eye, gradient: 'from-blue-400 to-indigo-500' },
  { label: 'Kassza', href: '/penzugy#cashbook', icon: Wallet, gradient: 'from-emerald-400 to-green-500' },
  { label: 'Bank', href: '/penzugy#bank', icon: Landmark, gradient: 'from-violet-400 to-purple-500' },
  { label: 'Tranzakciók', href: '/penzugy#transactions', icon: ArrowLeftRight, gradient: 'from-pink-400 to-rose-500' },
  { label: 'Költségvetés', href: '/penzugy#budget', icon: ScrollText, gradient: 'from-amber-400 to-orange-500' },
  { label: 'Számadás', href: '/penzugy#accounting', icon: ClipboardList, gradient: 'from-cyan-400 to-teal-500' },
  { label: 'Tartozások', href: '/penzugy#debt', icon: Coins, gradient: 'from-orange-400 to-red-500' },
  { label: 'Bérleti szerződések', href: '/penzugy#rental', icon: Building2, gradient: 'from-amber-400 to-yellow-500' },
  { label: 'Monetár', href: '/penzugy#monetary', icon: CreditCard, gradient: 'from-slate-400 to-slate-600' },
  { label: 'Oblio ellenőrzés', href: '/penzugy#oblio_ellenorzes', icon: Inbox, gradient: 'from-cyan-400 to-blue-500' },
  { label: 'Súgó', href: '/penzugy#sugo', icon: HelpCircle, gradient: 'from-teal-400 to-cyan-500' },
] as const

/**
 * Tagnyilvántartás almenüje a sidebarban (2026-04-28).
 * 6 fül a webes /tagnyilvantartas oldalon — hash-alapú navigáció (`#persons` stb.)
 * a `member-tabs-v4.tsx` activeTab-jával összehangolva.
 */
const WEB_TAGNYILVANTARTAS_SUBMENU = [
  { label: 'Áttekintés', href: '/tagnyilvantartas', icon: Eye, gradient: 'from-blue-400 to-indigo-500' },
  { label: 'Személyek', href: '/tagnyilvantartas#persons', icon: User, gradient: 'from-emerald-400 to-teal-500' },
  { label: 'Családok', href: '/tagnyilvantartas#families', icon: Home, gradient: 'from-violet-400 to-purple-500' },
  { label: 'Presbiterek', href: '/tagnyilvantartas#presbyters', icon: UserCheck, gradient: 'from-amber-400 to-orange-500' },
  { label: 'Körzetek', href: '/tagnyilvantartas#districts', icon: Layers, gradient: 'from-cyan-400 to-teal-500' },
  { label: 'Választók', href: '/tagnyilvantartas#voters', icon: Vote, gradient: 'from-pink-400 to-rose-500' },
  { label: 'Hibák', href: '/tagnyilvantartas#errors', icon: AlertTriangle, gradient: 'from-rose-400 to-red-500' },
] as const

/**
 * Admin Panel almenüje a sidebarban (2026-05-02, Sprint U.4 / 7. észrevétel).
 * 13 önálló oldal — minden eddigi fülből külön /admin/<slug> útvonal.
 * A sorrend megegyezik a régi `AdminTabsV3` TABS array-jával (felhasználó kérése).
 */
const WEB_ADMIN_SUBMENU = [
  { label: 'Áttekintés', href: '/admin', icon: Eye, gradient: 'from-blue-400 to-indigo-500' },
  // 2026-06-06: a "Hozzáférés-kérelmek" kivéve a menüből — a regisztrációk
  // jóváhagyása + aktiválása mostantól EGY helyen, a Felhasználók oldalon
  // történik (a függőben lévő kérelmek kontextusa ott látszik). Az útvonal
  // (/admin/hozzaferes-kerelmek) megmarad archívumként/visszafordíthatóságért.
  { label: 'Gyülekezetek', href: '/admin/gyulekezetek', icon: Church, gradient: 'from-emerald-400 to-teal-500' },
  // 2026-07-11 (2. kör): a „Könyvelők / számvevők" külön menüpont MEGSZŰNT — a
  // könyvelői/számvevői hozzárendelések a Felhasználók oldal második fülére
  // („Könyvelői hozzárendelések") kerültek. Az /admin/konyvelok útvonal a
  // Felhasználók oldalra irányít át (visszafordíthatóság + régi könyvjelzők).
  { label: 'Felhasználók', href: '/admin/felhasznalok', icon: UserCog, gradient: 'from-violet-500 to-indigo-600' },
  { label: 'Eszközök és napló', href: '/admin/eszkozok', icon: Database, gradient: 'from-cyan-400 to-sky-500' },
  { label: 'Frissítések', href: '/admin/frissitesek', icon: Bell, gradient: 'from-orange-400 to-amber-500' },
  { label: 'Támogatás', href: '/admin/tamogatas', icon: LifeBuoy, gradient: 'from-yellow-400 to-amber-500' },
  { label: 'Import', href: '/admin/import', icon: Download, gradient: 'from-pink-400 to-rose-500' },
  { label: 'Rendszer pénzügyei', href: '/admin/penzugy', icon: PiggyBank, gradient: 'from-rose-400 to-pink-500' },
  // 2026-07-11 (admin-redesign): a Tevékenység-napló (rekord-szintű audit) újra
  // elérhető — a halott AdminTabsV3-ból önálló /admin/naplo oldalra költözött.
  { label: 'Tevékenység-napló', href: '/admin/naplo', icon: History, gradient: 'from-slate-400 to-slate-600' },
  { label: 'Rendszer', href: '/admin/rendszer', icon: ShieldAlert, gradient: 'from-red-400 to-rose-500' },
  { label: 'Veszélyes zóna', href: '/admin/veszelyes-zona', icon: Flame, gradient: 'from-red-500 to-red-700' },
] as const

/**
 * Anyakönyv almenüje a sidebarban (2026-04-28).
 * 9 fül a /anyakonyv oldalon — hash-alapú navigáció (`#keresztseg` stb.)
 * a `registry-tabs.tsx` activeTab-jával összehangolva.
 */
const WEB_ANYAKONYV_SUBMENU = [
  { label: 'Áttekintés', href: '/anyakonyv', icon: Eye, gradient: 'from-blue-400 to-indigo-500' },
  { label: 'Keresztelések', href: '/anyakonyv#keresztseg', icon: Sparkles, gradient: 'from-sky-400 to-cyan-500' },
  { label: 'Konfirmálások', href: '/anyakonyv#konfirmalas', icon: BookMarked, gradient: 'from-violet-400 to-purple-500' },
  { label: 'Esketések', href: '/anyakonyv#hazassag', icon: Heart, gradient: 'from-rose-400 to-pink-500' },
  { label: 'Temetések', href: '/anyakonyv#temetes', icon: Cross, gradient: 'from-slate-400 to-slate-600' },
  { label: 'Beköltözöttek', href: '/anyakonyv#bekoltozott', icon: PlaneLanding, gradient: 'from-teal-400 to-emerald-500' },
  { label: 'Elköltözöttek', href: '/anyakonyv#elkoltozott', icon: PlaneTakeoff, gradient: 'from-orange-400 to-amber-500' },
  { label: 'Áttértek', href: '/anyakonyv#attert', icon: LogIn, gradient: 'from-emerald-400 to-green-500' },
  { label: 'Kitértek', href: '/anyakonyv#kitert', icon: LogOut, gradient: 'from-amber-400 to-yellow-500' },
] as const

void Banknote
void BookMarked
void Users2
void Church

interface DashboardLayoutClientProps {
  profile: Profile
  /** 2026-07-10 (S4-avatar): a beállított profilfotó URL-je a header avatárhoz. */
  avatarUrl?: string | null
  congregationId: string | null
  role: Role
  master: boolean
  admin: boolean
  /** Egyházkerületi admin (2026-04-16 óta külön szerepkör). Opcionális a backward compat miatt. */
  egyhazkeruletiAdmin?: boolean
  esperes: boolean
  /** Könyvelő szerepkör (2026-04-16). */
  konyvelo?: boolean
  /** Egyházmegyei számvevő (2026-04-16). */
  szamvevo?: boolean
  hasCongregation: boolean
  /** Approved gyülekezet-hozzárendelések száma (konyvelo/szamvevo számára). */
  assignedCongregationsCount?: number
  isGodMode: boolean
  godModeExpiresAt: number | null
  congregationName: string | null
  congregationLogo: string | null
  /** A gyülekezet egyházmegyéjének neve (header chip secondary felirathoz). */
  congregationDioceseName?: string | null
  override: { active: boolean; congregationName?: string; remainingMinutes?: number }
  /** Multi-role profilváltás (2026-04-17, Fázis 4). */
  profileRoles?: ProfileRoleRow[]
  activeProfileRoleId?: string | null
  scopeNames?: Record<string, string>
  /** 2026-04-18 SCOPE-AWARE: az aktív profile_role scope-ja. A sidebar ez alapján
   *  dönti el az "Irányítópult" label + href-et és a modul-szűrést. */
  activeScope?: 'system' | 'district' | 'diocese' | 'congregation' | null
  /** 2026-04-19: egyházmegye setup status — ha kitöltetlen, banner jelenik meg. */
  dioceseSetupNeeded?: boolean
  dioceseSetupId?: string | null
  dioceseSetupMissing?: string[]
  /** 2026-04-19: gyülekezet setup status — ha kitöltetlen, banner jelenik meg. */
  congregationSetupNeeded?: boolean
  congregationSetupId?: string | null
  congregationSetupMissing?: string[]
  /** 2026-06-05: ha épp indul a bevezető walkthrough, a setup-banner csak utána. */
  deferSetupForWalkthrough?: boolean
  children: React.ReactNode
}

export function DashboardLayoutClient({
  profile, avatarUrl = null, congregationId, master, admin, egyhazkeruletiAdmin = false, esperes,
  konyvelo = false, szamvevo = false, hasCongregation, assignedCongregationsCount = 0,
  isGodMode, godModeExpiresAt, congregationName, congregationLogo, congregationDioceseName = null,
  override, profileRoles = [], activeProfileRoleId = null, scopeNames = {}, activeScope = null,
  dioceseSetupNeeded = false, dioceseSetupId = null, dioceseSetupMissing = [],
  congregationSetupNeeded = false, congregationSetupId = null, congregationSetupMissing = [],
  deferSetupForWalkthrough = false,
  children,
}: DashboardLayoutClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarAdaptiveV4
        isMasterAdmin={master}
        isAdmin={admin}
        isEgyhazkeruletiAdmin={egyhazkeruletiAdmin}
        isEsperes={esperes}
        isKonyvelo={konyvelo}
        isSzamvevo={szamvevo}
        hasCongregation={hasCongregation}
        assignedCongregationsCount={assignedCongregationsCount}
        isGodMode={isGodMode}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        activeScope={activeScope}
        financeSubmenu={WEB_FINANCE_SUBMENU as unknown as Parameters<typeof SidebarAdaptiveV4>[0]['financeSubmenu']}
        tagnyilvantartasSubmenu={WEB_TAGNYILVANTARTAS_SUBMENU as unknown as Parameters<typeof SidebarAdaptiveV4>[0]['tagnyilvantartasSubmenu']}
        anyakonyvSubmenu={WEB_ANYAKONYV_SUBMENU as unknown as Parameters<typeof SidebarAdaptiveV4>[0]['anyakonyvSubmenu']}
        adminSubmenu={WEB_ADMIN_SUBMENU as unknown as Parameters<typeof SidebarAdaptiveV4>[0]['adminSubmenu']}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <DashboardShell
          profile={profile}
          avatarUrl={avatarUrl}
          congregationId={congregationId}
          congregationName={congregationName}
          congregationLogo={congregationLogo}
          congregationDioceseName={congregationDioceseName}
          isMasterAdmin={master}
          isGodMode={isGodMode}
          godModeExpiresAt={godModeExpiresAt}
          override={override}
          profileRoles={profileRoles}
          activeProfileRoleId={activeProfileRoleId}
          scopeNames={scopeNames}
          activeScope={activeScope}
          activeScopeName={(() => {
            // Az aktív profile_role scope_id-jához tartozó név (egyházmegye / kerület)
            const active = profileRoles.find((r) => r.id === activeProfileRoleId)
            if (!active || !active.scope_id) return null
            return scopeNames[active.scope_id] || null
          })()}
          onToggleMobileMenu={() => setMobileOpen(prev => !prev)}
          onToggleSidebar={() => setSidebarCollapsed(prev => !prev)}
        >
          {/* Egyházmegyei setup banner — csak diocese scope-ban, ha hiányosak az adatok */}
          {dioceseSetupNeeded && dioceseSetupId && (
            <DioceseSetupBanner
              dioceseId={dioceseSetupId}
              missingFields={dioceseSetupMissing}
            />
          )}
          {/* Gyülekezeti setup banner — congregation scope-ban, ha hiányosak az adatok */}
          {congregationSetupNeeded && congregationSetupId && (
            <CongregationSetupBanner
              congregationId={congregationSetupId}
              missingFields={congregationSetupMissing}
              deferForWalkthrough={deferSetupForWalkthrough}
            />
          )}
          {children}
        </DashboardShell>

        {/* Sablon-szerű napi igeszakasz csík a layout alján */}
        <BottomVerse />
      </div>
    </div>
  )
}
