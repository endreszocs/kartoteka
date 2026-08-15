'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { HeaderRefinedV3 } from './header-refined-v3'
import { GodModeBannerV3 } from './god-mode-banner-v3'
import { AdminOverrideBanner } from './admin-override-banner'
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

const CongregationSetupWizardLazy = dynamic(
  () =>
    import('@/components/modals/congregation-setup-wizard').then(
      (module) => module.CongregationSetupWizard,
    ),
  { ssr: false },
)

// 2026-08-15 (egyházmegyei terv, 4.1): a fejléc „Egyházmegyénk" (read-only
// adatlap) és „Egyházmegye beállításai" (a MEGLÉVŐ setup-wizard menüből
// nyitva) ablakai — csak diocese-scope aktív profilnál töltődnek be.
const DioceseSummaryDialogLazy = dynamic(
  () => import('@/components/modals/diocese-summary').then((module) => module.DioceseSummaryDialog),
  { ssr: false },
)

const DioceseSetupWizardLazy = dynamic(
  () => import('@/components/modals/diocese-setup-wizard').then((module) => module.DioceseSetupWizard),
  { ssr: false },
)

interface DashboardShellProps {
  profile: Profile
  /** 2026-07-10 (S4-avatar): a beállított profilfotó URL-je a header avatárhoz. */
  avatarUrl?: string | null
  congregationId: string | null
  congregationName: string | null
  congregationLogo: string | null
  /** A gyülekezet egyházmegyéjének neve (header chip secondary felirathoz). */
  congregationDioceseName?: string | null
  isMasterAdmin?: boolean
  isGodMode?: boolean
  godModeExpiresAt?: number | null
  override?: { active: boolean; congregationName?: string; remainingMinutes?: number }
  profileRoles?: ProfileRoleRow[]
  activeProfileRoleId?: string | null
  scopeNames?: Record<string, string>
  /** Az aktív UI-kontextus scope-ja — a header bal-felső chipje ehhez igazodik. */
  activeScope?: 'system' | 'district' | 'diocese' | 'congregation' | null
  /** A scope_id-hez tartozó név (egyházmegye / egyházkerület esetén). */
  activeScopeName?: string | null
  /** 2026-08-15 (4.1): az AKTÍV diocese-profil egyházmegyéje — a fejléc
   *  „Egyházmegyénk" / „Egyházmegye beállításai" ablakainak célpontja.
   *  CSAK diocese-scope aktív profilnál nem null. */
  activeDioceseId?: string | null
  /** Írhat-e a néző megyei szinten? (számvevő: false → a beállítás-menüpont
   *  és a szerkesztés-gomb rejtve — ne mutassunk sehová nem vezető gombot). */
  canWriteDiocese?: boolean
  /**
   * RÖGZÍTETT HELYŰ RIASZTÁS-SÁV (2026-08-11) — a fejléc ALATT, a görgethető
   * `<main>`-en KÍVÜL.
   *
   * ⚠️ MIÉRT KÜLÖN SLOT, ÉS NEM `children`. A biztonsági mentés őrszem-sávja
   * korábban a `<main>` első gyereke volt, tehát EGYÜTT GÖRGÜLT a tartalommal,
   * és aszinkron beszúródva a görgetés-horgonyzás ki is tolhatta a látható
   * terület fölé. Egy riasztás, amit el lehet görgetni (vagy ami néha egyszerűen
   * nem látszik), nem riasztás. Itt saját, `shrink-0` sort kap a fejléc alatt:
   * a hely SZERKEZETI, nem z-index-verseny kérdése.
   */
  alertSlot?: React.ReactNode
  children: React.ReactNode
  onToggleMobileMenu: () => void
  /** Sidebar collapse/expand toggle — a header Kartotéka-ikonjához kötve. */
  onToggleSidebar?: () => void
}

export function DashboardShell({
  profile,
  avatarUrl = null,
  congregationId,
  congregationName,
  congregationLogo,
  congregationDioceseName = null,
  isMasterAdmin,
  isGodMode,
  godModeExpiresAt,
  override,
  profileRoles = [],
  activeProfileRoleId = null,
  scopeNames = {},
  activeScope = null,
  activeScopeName = null,
  activeDioceseId = null,
  canWriteDiocese = false,
  alertSlot = null,
  children,
  onToggleMobileMenu,
  onToggleSidebar,
}: DashboardShellProps) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [congregationOpen, setCongregationOpen] = useState(false)
  const [godModeOpen, setGodModeOpen] = useState(false)
  const [congregationSetupWizardOpen, setCongregationSetupWizardOpen] = useState(false)
  // 2026-08-15 (4.1): megyei fejléc-ablakok — csak diocese-scope-nál használt.
  const [dioceseSummaryOpen, setDioceseSummaryOpen] = useState(false)
  const [dioceseSetupOpen, setDioceseSetupOpen] = useState(false)

  // Globális window-esemény figyelése — pl. a januári banner "Beállítom most"
  // gombja küldi. A kommunikáció: a page-level komponensek (banner, widget)
  // dispatchelik, a shell pedig megnyitja a modalt.
  useEffect(() => {
    function handleOpenCongregationDialog() {
      setCongregationOpen(true)
    }
    function handleOpenCongregationSetupWizard() {
      setCongregationSetupWizardOpen(true)
    }
    window.addEventListener('kartoteka:open-congregation-dialog', handleOpenCongregationDialog)
    window.addEventListener(
      'kartoteka:open-congregation-setup-wizard',
      handleOpenCongregationSetupWizard,
    )
    return () => {
      window.removeEventListener('kartoteka:open-congregation-dialog', handleOpenCongregationDialog)
      window.removeEventListener(
        'kartoteka:open-congregation-setup-wizard',
        handleOpenCongregationSetupWizard,
      )
    }
  }, [])

  return (
    <>
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
        avatarUrl={avatarUrl}
        congregationName={congregationName}
        congregationLogo={congregationLogo}
        congregationDioceseName={congregationDioceseName}
        profileRoles={profileRoles}
        activeProfileRoleId={activeProfileRoleId}
        scopeNames={scopeNames}
        activeScope={activeScope}
        activeScopeName={activeScopeName}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenCongregation={() => setCongregationOpen(true)}
        onOpenDiocese={activeDioceseId ? () => setDioceseSummaryOpen(true) : undefined}
        onOpenDioceseSetup={
          activeDioceseId && canWriteDiocese ? () => setDioceseSetupOpen(true) : undefined
        }
        onOpenGodMode={isMasterAdmin && !isGodMode ? () => setGodModeOpen(true) : undefined}
        onToggleMobileMenu={onToggleMobileMenu}
        onToggleSidebar={onToggleSidebar}
      />

      {/* Riasztás-sor — a fejléc alatt, a görgethető területen KÍVÜL.
          `shrink-0`: nem nyomódik össze, ha a tartalom hosszú.
          A vízszintes/felső térközt maga a sáv hozza (lásd backup-stale-banner),
          hogy rejtett állapotban NE maradjon üres függőleges hézag. */}
      {alertSlot ? <div className="shrink-0">{alertSlot}</div> : null}

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

      {/* CongregationSetupWizard — a fejléc-dropdown "Gyülekezet-beállítás
          újraindítása" gombja vagy a CongregationSetupBanner nyitja az
          `kartoteka:open-congregation-setup-wizard` event-tel. */}
      {congregationId && (
        <CongregationSetupWizardLazy
          open={congregationSetupWizardOpen}
          onOpenChange={setCongregationSetupWizardOpen}
          congregationId={congregationId}
        />
      )}

      {/* 2026-08-15 (4.1): megyei fejléc-ablakok — a gyülekezeti páros
          tükörképei. Az „Egyházmegyénk" read-only; a beállítás-varázslót a
          menüpont ÉS a summary „Szerkesztés a beállításokban" gombja nyitja. */}
      {activeDioceseId && (
        <DioceseSummaryDialogLazy
          open={dioceseSummaryOpen}
          onOpenChange={setDioceseSummaryOpen}
          dioceseId={activeDioceseId}
          canWrite={canWriteDiocese}
          onOpenSetup={() => setDioceseSetupOpen(true)}
        />
      )}
      {activeDioceseId && canWriteDiocese && (
        <DioceseSetupWizardLazy
          open={dioceseSetupOpen}
          onOpenChange={setDioceseSetupOpen}
          dioceseId={activeDioceseId}
        />
      )}
    </>
  )
}
