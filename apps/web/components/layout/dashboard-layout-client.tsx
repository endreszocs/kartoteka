'use client'

import { useState } from 'react'
import {
  ArrowLeftRight,
  Banknote,
  BookMarked,
  Building2,
  ClipboardList,
  Coins,
  CreditCard,
  Eye,
  HelpCircle,
  Home,
  Inbox,
  Landmark,
  Layers,
  ScrollText,
  User,
  UserCheck,
  Users2,
  Vote,
  Wallet,
} from 'lucide-react'
import { SidebarAdaptiveV4 } from './sidebar-adaptive-v4'
import { DashboardShell } from './dashboard-shell'
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
] as const

void Banknote
void BookMarked
void Users2

interface DashboardLayoutClientProps {
  profile: Profile
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
  children: React.ReactNode
}

export function DashboardLayoutClient({
  profile, congregationId, master, admin, egyhazkeruletiAdmin = false, esperes,
  konyvelo = false, szamvevo = false, hasCongregation, assignedCongregationsCount = 0,
  isGodMode, godModeExpiresAt, congregationName, congregationLogo,
  override, profileRoles = [], activeProfileRoleId = null, scopeNames = {}, activeScope = null,
  dioceseSetupNeeded = false, dioceseSetupId = null, dioceseSetupMissing = [],
  congregationSetupNeeded = false, congregationSetupId = null, congregationSetupMissing = [],
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
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <DashboardShell
          profile={profile}
          congregationId={congregationId}
          congregationName={congregationName}
          congregationLogo={congregationLogo}
          isMasterAdmin={master}
          isGodMode={isGodMode}
          godModeExpiresAt={godModeExpiresAt}
          override={override}
          profileRoles={profileRoles}
          activeProfileRoleId={activeProfileRoleId}
          scopeNames={scopeNames}
          onToggleMobileMenu={() => setMobileOpen(prev => !prev)}
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
            />
          )}
          {children}
        </DashboardShell>
      </div>
    </div>
  )
}
