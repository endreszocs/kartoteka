'use client'

import { useState } from 'react'
import { ColorTabs } from '@/components/ui/color-tabs'
import { JegyzokonyvekHelp } from './jegyzokonyvek-help'

/**
 * Jegyzőkönyvek modul tab-rendszere a Hero ALATT (Tagnyilvántartás minta).
 *
 * A page.tsx Hero + KPI fejlécei felül vannak, alatta ez a tab-rendszer
 * renderelődik. A "Jegyzőkönyv munkafelület" tab a children-t mutatja
 * (KPI kártyák, Meghívó, MinutesList).
 */

type WorkspaceTab = 'munkafelulet' | 'help' | 'admin-import'

interface MinutesWorkspaceTabsProps {
  showAdminImport: boolean
  adminImportContent?: React.ReactNode
  children: React.ReactNode
}

export function MinutesWorkspaceTabs({
  showAdminImport,
  adminImportContent,
  children,
}: MinutesWorkspaceTabsProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('munkafelulet')

  return (
    <>
      <ColorTabs
        tabs={[
          { value: 'munkafelulet', label: 'Jegyzőkönyv munkafelület', color: 'blue' },
          { value: 'help', label: 'Súgó', color: 'teal' },
          ...(showAdminImport ? [
            { value: 'admin-import', label: 'Rendszergazdai importáló', color: 'red-prominent' },
          ] : []),
        ]}
        active={activeTab}
        onChange={(v) => setActiveTab(v as WorkspaceTab)}
      />

      <div className="mt-4 space-y-5">
        {activeTab === 'munkafelulet' && children}
        {activeTab === 'help' && <JegyzokonyvekHelp />}
        {activeTab === 'admin-import' && showAdminImport && adminImportContent}
      </div>
    </>
  )
}
