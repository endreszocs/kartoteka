'use client'

/**
 * Kartotéka teljes dashboard-shell — platform-agnosztikus port.
 *
 * Ez egyesíti a web `DashboardLayoutClient` + `DashboardShell` viselkedését
 * egy komponensbe, pure React-ben, Next.js-függőségek nélkül.
 *
 * Komponens-összetétel:
 *   - Sidebar (KartotekaSidebar) — bal oldal, mobile Sheet
 *   - Header (KartotekaHeader) — felső sáv
 *   - Banners (opcionális, slot): god-mode, admin override, setup
 *   - Main content (children) — page-shell radial gradient + padding
 *
 * Modal / dialog kezelés:
 *   - A shell NEM nyitja meg a modalokat; a `onOpenProfile`, `onOpenCongregation`
 *     callback-ek a parent-nek szólnak, ami saját Dialog-ot jelenít meg.
 *     Ez leválasztja a shell-t a modális tartalomtól (web: ProfileDialog +
 *     CongregationDialog dinamikusan, desktop: egyszerűbb verziók).
 */

import { useState, type ReactNode } from 'react'
import type { MenuItem, SidebarLinkComponent } from './kartoteka-sidebar'
import { KartotekaSidebar } from './kartoteka-sidebar'
import { KartotekaHeader, type HeaderProfile } from './kartoteka-header'

// ─────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────

export interface KartotekaShellProps {
  // Platform adapter
  Link: SidebarLinkComponent
  currentPath: string
  logoSrc: string

  // User + gyülekezet
  profile: HeaderProfile
  congregationId: string | null
  congregationName: string | null
  congregationLogo: string | null

  // Role / scope
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

  // Sign-out + dialog callbacks
  onSignOut: () => Promise<void> | void
  onOpenProfile?: () => void
  onOpenCongregation?: () => void
  onOpenHelp?: () => void
  onOpenSettings?: () => void

  /** Opcionális banner slot a header alá (god-mode, setup-prompt stb.). */
  banners?: ReactNode
  /**
   * Extra tartalom a header jobb oldali sávjába (a súgó-gomb elé) — pl.
   * session/szinkron státusz-jelvények (desktop, 2026-06-11). A korábbi
   * lebegő (fixed) jelvények kitakarták a tartalmat.
   */
  headerExtra?: ReactNode
  /**
   * Menüpontok elrejtése href szerint — olyan kliensekhez, ahol egy modul
   * még nem létezik (pl. desktop: /admin, /profile). A web változatlan.
   */
  hiddenMenuHrefs?: string[]
  children: ReactNode

  /**
   * A Pénzügy menüpont kibontható almenüje (v0.7.6+).
   * - Web: 11 finance fül (`/penzugy#dashboard`, `/penzugy#cashbook`, ...)
   * - Desktop: 8 desktop oldal (`/penzugy/attekintes`, `/penzugy/befizetes`, ...)
   */
  financeSubmenu?: MenuItem[]
}

// ─────────────────────────────────────────────────────────────────────────
// Komponens
// ─────────────────────────────────────────────────────────────────────────

export function KartotekaShell({
  Link,
  currentPath,
  logoSrc,
  profile,
  congregationId: _congregationId,
  congregationName,
  congregationLogo,
  isMasterAdmin,
  isAdmin,
  isEgyhazkeruletiAdmin = false,
  isEsperes,
  isKonyvelo = false,
  isSzamvevo = false,
  hasCongregation,
  assignedCongregationsCount = 0,
  isGodMode,
  activeScope = null,
  onSignOut,
  onOpenProfile,
  onOpenCongregation,
  onOpenHelp,
  onOpenSettings,
  banners,
  headerExtra,
  hiddenMenuHrefs,
  children,
  financeSubmenu,
}: KartotekaShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      <KartotekaSidebar
        Link={Link}
        currentPath={currentPath}
        logoSrc={logoSrc}
        isMasterAdmin={isMasterAdmin}
        isAdmin={isAdmin}
        isEgyhazkeruletiAdmin={isEgyhazkeruletiAdmin}
        isEsperes={isEsperes}
        isKonyvelo={isKonyvelo}
        isSzamvevo={isSzamvevo}
        hasCongregation={hasCongregation}
        assignedCongregationsCount={assignedCongregationsCount}
        isGodMode={isGodMode}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        activeScope={activeScope}
        financeSubmenu={financeSubmenu}
        hiddenMenuHrefs={hiddenMenuHrefs}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <KartotekaHeader
          profile={profile}
          congregationName={congregationName}
          congregationLogo={congregationLogo}
          onSignOut={onSignOut}
          onOpenProfile={onOpenProfile}
          onOpenCongregation={onOpenCongregation}
          onOpenHelp={onOpenHelp}
          onOpenSettings={onOpenSettings}
          onToggleMobileMenu={() => setMobileOpen((prev) => !prev)}
          headerExtra={headerExtra}
        />

        {banners}

        <main className="flex-1 overflow-y-auto">
          {/* Reszponzív tartalom (2026-04-25):
              - Korábban max-w-7xl (1280px) — teljes képernyőn üres sávok mindkét oldalon.
              - Mostantól nincs felső korlát: a tartalom teljesen kitölti a sidebar utáni
                főterületet, csak a padding (lg:p-8) tart távolságot a szélektől.
              - Ultra-széles (3440px+) kijelzőn a beágyazott grid-komponensek (KPI cards,
                BottomStats, Celebrations) `xl:grid-cols-*` szabályaikkal magukat osztják el,
                így a szöveges widgetek sem feszülnek olvashatatlanul túl. */}
          <div className="page-shell min-h-full p-4 md:p-6 lg:p-8">
            <div className="w-full">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
