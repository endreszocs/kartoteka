'use client'

import { useState } from 'react'
import { SidebarAdaptiveV4 } from './sidebar-adaptive-v4'
import { DashboardShell } from './dashboard-shell'
import { DioceseSetupBanner } from './diocese-setup-banner'
import { CongregationSetupBanner } from './congregation-setup-banner'
import type { Profile } from '@/lib/types/auth'
import type { Role } from '@/lib/types/auth'
import type { ProfileRoleRow } from '@/lib/profile-roles/types'

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
