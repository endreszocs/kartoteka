'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { HeaderRefinedV3 } from './header-refined-v3'
import { GodModeBannerV3 } from './god-mode-banner-v3'
import { AdminOverrideBanner } from './admin-override-banner'
import { DashboardIntroOverlay } from './dashboard-intro-overlay'
import type { Profile } from '@/lib/types/auth'
import type { ProfileRoleRow } from '@/lib/profile-roles/types'

const ProfileDialog = dynamic(
  () => import('@/components/modals/profile-dialog').then(module => module.ProfileDialog),
  { ssr: false }
)

const CongregationDialog = dynamic(
  () => import('@/components/modals/congregation-dialog-v2').then(module => module.CongregationDialogV2),
  { ssr: false }
)

const GodModeDialog = dynamic(
  () => import('@/components/modals/god-mode-dialog-v5').then(module => module.GodModeDialogV5),
  { ssr: false }
)

interface DashboardShellProps {
  profile: Profile
  congregationId: string | null
  congregationName: string | null
  congregationLogo: string | null
  isMasterAdmin?: boolean
  isGodMode?: boolean
  godModeExpiresAt?: number | null
  override?: { active: boolean; congregationName?: string; remainingMinutes?: number }
  profileRoles?: ProfileRoleRow[]
  activeProfileRoleId?: string | null
  scopeNames?: Record<string, string>
  children: React.ReactNode
  onToggleMobileMenu: () => void
}

export function DashboardShell({
  profile,
  congregationId,
  congregationName,
  congregationLogo,
  isMasterAdmin,
  isGodMode,
  godModeExpiresAt,
  override,
  profileRoles = [],
  activeProfileRoleId = null,
  scopeNames = {},
  children,
  onToggleMobileMenu,
}: DashboardShellProps) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [congregationOpen, setCongregationOpen] = useState(false)
  const [godModeOpen, setGodModeOpen] = useState(false)

  // Globális window-esemény figyelése — pl. a januári banner "Beállítom most"
  // gombja küldi. A kommunikáció: a page-level komponensek (banner, widget)
  // dispatchelik, a shell pedig megnyitja a modalt.
  useEffect(() => {
    function handleOpen() {
      setCongregationOpen(true)
    }
    window.addEventListener('kartoteka:open-congregation-dialog', handleOpen)
    return () => {
      window.removeEventListener('kartoteka:open-congregation-dialog', handleOpen)
    }
  }, [])

  return (
    <>
      <DashboardIntroOverlay />

      {isGodMode && godModeExpiresAt && (
        <GodModeBannerV3 expiresAt={godModeExpiresAt} />
      )}

      {override?.active && (
        <AdminOverrideBanner
          congregationName={override.congregationName || ''}
          remainingMinutes={override.remainingMinutes || 0}
        />
      )}

      <HeaderRefinedV3
        profile={profile}
        congregationName={congregationName}
        congregationLogo={congregationLogo}
        profileRoles={profileRoles}
        activeProfileRoleId={activeProfileRoleId}
        scopeNames={scopeNames}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenCongregation={() => setCongregationOpen(true)}
        onOpenGodMode={isMasterAdmin && !isGodMode ? () => setGodModeOpen(true) : undefined}
        onToggleMobileMenu={onToggleMobileMenu}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="page-shell kt-page-enter min-h-full p-4 md:p-6 lg:p-7">
          {children}
        </div>
      </main>

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        profile={profile}
      />

      <CongregationDialog
        open={congregationOpen}
        onOpenChange={setCongregationOpen}
        congregationId={congregationId}
      />

      {isMasterAdmin && (
        <GodModeDialog
          open={godModeOpen}
          onOpenChange={setGodModeOpen}
        />
      )}
    </>
  )
}
