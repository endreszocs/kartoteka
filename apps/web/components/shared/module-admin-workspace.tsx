'use client'

import { useMemo, useState } from 'react'

import { ColorTabs } from '@/components/ui/color-tabs'
import { ModuleAdminImportTabV2, type ModuleImportProfile } from '@/components/shared/module-admin-import-tab-v2'
import type { ImportModule, ImportProfile } from '@/lib/import/import-profiles'

type WorkspaceTab = 'main' | 'help' | 'admin-import'

interface ModuleAdminWorkspaceProps {
  moduleKey: string
  moduleLabel: string
  mainTabLabel: string
  importTitle: string
  importDescription: string
  congregationName: string | null
  isGodMode: boolean
  isDelegatedImport?: boolean
  delegatedExpiresAt?: number | null
  /**
   * Opcionális: ha `true`, a "Rendszergazdai importáló" fül akkor is megjelenik,
   * ha sem god mode, sem delegated import nincs. Modul-specifikusan engedélyezhető —
   * pl. a Tagnyilvántartás az aktív `admin` szerepkörnek is mutatja (2026-05-25).
   */
  alwaysAllowAdminImport?: boolean
  /**
   * 2026-05-25: opcionális Súgó-tab tartalma (Apple Settings-stílusú help-komponens).
   * Ha megadva, a tab-listában megjelenik egy "Súgó" fül (mainTabLabel ÉS admin-import
   * között), teal színnel. Lelkészbarát tartalom a modul domain-logikájáról.
   */
  helpContent?: React.ReactNode
  /** Egyedi címke a Súgó tabhoz (default: "Súgó"). */
  helpTabLabel?: string
  profiles: ModuleImportProfile[]
  /** Új multi-sheet import profilok (ha megadva, a multi-sheet rendszer is elérhető) */
  importProfiles?: ImportProfile[]
  /** Modul kulcs az import rendszerhez */
  importModule?: ImportModule
  hideTabsUntilPrivileged?: boolean
  /**
   * Egyedi import-tab tartalom — ha megadva, a "Rendszergazdai importáló" fülön
   * ezt rendereli a rendszer az alapértelmezett ModuleAdminImportTabV2 helyett.
   */
  customImportTab?: React.ReactNode
  children: React.ReactNode
}

export function ModuleAdminWorkspace({
  moduleKey,
  moduleLabel,
  mainTabLabel,
  importTitle,
  importDescription,
  congregationName,
  isGodMode,
  isDelegatedImport = false,
  delegatedExpiresAt = null,
  alwaysAllowAdminImport = false,
  helpContent,
  helpTabLabel = 'Súgó',
  profiles,
  importProfiles,
  importModule,
  hideTabsUntilPrivileged = false,
  customImportTab,
  children,
}: ModuleAdminWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('main')

  const canSeeAdminImport = isGodMode || isDelegatedImport || alwaysAllowAdminImport
  const hasHelp = Boolean(helpContent)

  // Resolved tab — ha az aktuális tab nem elérhető (pl. user logout után), visszaesünk main-re
  let resolvedActiveTab: WorkspaceTab = activeTab
  if (activeTab === 'admin-import' && !canSeeAdminImport) resolvedActiveTab = 'main'
  if (activeTab === 'help' && !hasHelp) resolvedActiveTab = 'main'

  // A tab-lista akkor jelenik meg, ha van legalább 2 tab elérhető. hideTabsUntilPrivileged
  // viselkedés: csak main marad → elrejt. Ha van help vagy admin-import → mutatja.
  const tabCount = 1 + (hasHelp ? 1 : 0) + (canSeeAdminImport ? 1 : 0)
  const shouldRenderTabs = tabCount > 1 || !hideTabsUntilPrivileged

  const tabs = useMemo(() => {
    const arr: Array<{ value: WorkspaceTab; label: string; color: string }> = [
      { value: 'main', label: mainTabLabel, color: 'blue' },
    ]
    if (hasHelp) {
      arr.push({ value: 'help', label: helpTabLabel, color: 'teal' })
    }
    if (canSeeAdminImport) {
      // 'red-prominent': inaktív állapotban is piros háttér, hogy
      // a "veszélyes" rendszergazdai művelet egyértelmű legyen.
      arr.push({ value: 'admin-import', label: 'Rendszergazdai importáló', color: 'red-prominent' })
    }
    return arr
  }, [canSeeAdminImport, hasHelp, helpTabLabel, mainTabLabel])

  return (
    <div className="space-y-4">
      {shouldRenderTabs ? (
        <ColorTabs
          tabs={tabs}
          active={resolvedActiveTab}
          onChange={(value) => setActiveTab(value as WorkspaceTab)}
        />
      ) : null}

      {resolvedActiveTab === 'main' && children}
      {resolvedActiveTab === 'help' && helpContent}
      {resolvedActiveTab === 'admin-import' &&
        (customImportTab ? (
          customImportTab
        ) : (
          <ModuleAdminImportTabV2
            moduleKey={moduleKey}
            moduleLabel={moduleLabel}
            title={importTitle}
            description={importDescription}
            congregationName={congregationName}
            isGodMode={isGodMode}
            isDelegatedImport={isDelegatedImport}
            delegatedExpiresAt={delegatedExpiresAt}
            profiles={profiles}
            importProfiles={importProfiles}
            importModule={importModule}
          />
        ))}
    </div>
  )
}
