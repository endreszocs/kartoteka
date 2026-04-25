'use client'

import { useMemo, useState } from 'react'

import { ColorTabs } from '@/components/ui/color-tabs'
import { ModuleAdminImportTabV2, type ModuleImportProfile } from '@/components/shared/module-admin-import-tab-v2'
import type { ImportModule, ImportProfile } from '@/lib/import/import-profiles'

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
  profiles: ModuleImportProfile[]
  /** Új multi-sheet import profilok (ha megadva, a multi-sheet rendszer is elérhető) */
  importProfiles?: ImportProfile[]
  /** Modul kulcs az import rendszerhez */
  importModule?: ImportModule
  hideTabsUntilPrivileged?: boolean
  /**
   * Egyedi import-tab tartalom — ha megadva, a "Rendszergazdai importáló" fülön
   * ezt rendereli a rendszer az alapértelmezett ModuleAdminImportTabV2 helyett.
   * Erre épül pl. a tagnyilvántartás új import wizardja (TagnyilvantartasImportWizard).
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
  profiles,
  importProfiles,
  importModule,
  hideTabsUntilPrivileged = false,
  customImportTab,
  children,
}: ModuleAdminWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'main' | 'admin-import'>('main')
  const canSeeAdminImport = isGodMode || isDelegatedImport
  const resolvedActiveTab: 'main' | 'admin-import' = canSeeAdminImport ? activeTab : 'main'
  const shouldRenderTabs = canSeeAdminImport || !hideTabsUntilPrivileged

  const tabs = useMemo(
    () =>
      canSeeAdminImport
        ? [
            { value: 'main', label: mainTabLabel, color: 'blue' },
            { value: 'admin-import', label: 'Rendszergazdai importáló', color: 'red' },
          ]
        : [{ value: 'main', label: mainTabLabel, color: 'blue' }],
    [canSeeAdminImport, mainTabLabel],
  )

  return (
    <div className="space-y-4">
      {shouldRenderTabs ? (
        <ColorTabs
          tabs={tabs}
          active={resolvedActiveTab}
          onChange={(value) => setActiveTab(value as 'main' | 'admin-import')}
        />
      ) : null}

      {resolvedActiveTab === 'main' ? (
        children
      ) : customImportTab ? (
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
      )}
    </div>
  )
}
