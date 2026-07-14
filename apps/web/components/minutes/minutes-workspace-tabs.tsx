'use client'

import { useState } from 'react'
import { ColorTabs } from '@/components/ui/color-tabs'
import { AdminImportLauncher } from '@/components/shared/admin-import-launcher'
import { JegyzokonyvekHelp } from './jegyzokonyvek-help'

/**
 * Jegyzőkönyvek modul tab-rendszere a Hero ALATT (Tagnyilvántartás minta).
 *
 * A page.tsx Hero + KPI fejlécei felül vannak, alatta ez a tab-rendszer
 * renderelődik. A "Jegyzőkönyv munkafelület" tab a children-t mutatja
 * (KPI kártyák, Meghívó, MinutesList).
 */

type WorkspaceTab = 'munkafelulet' | 'help'

interface MinutesWorkspaceTabsProps {
  showAdminImport: boolean
  congregationName?: string | null
  adminImportContent?: React.ReactNode
  children: React.ReactNode
}

export function MinutesWorkspaceTabs({
  showAdminImport,
  congregationName,
  adminImportContent,
  children,
}: MinutesWorkspaceTabsProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('munkafelulet')

  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <ColorTabs
            tabs={[
              { value: 'munkafelulet', label: 'Jegyzőkönyv munkafelület', color: 'blue' },
              { value: 'help', label: 'Súgó', color: 'teal' },
            ]}
            active={activeTab}
            onChange={(v) => setActiveTab(v as WorkspaceTab)}
          />
        </div>
        {showAdminImport && adminImportContent && (
          <AdminImportLauncher
            moduleLabel="Jegyzőkönyvek"
            congregationName={congregationName}
            description="A jegyzőkönyvi tömeges import jelenlegi előkészítő felülete külön ablakban. A meglévő jegyzőkönyv-rögzítő varázsló ettől változatlanul külön marad."
          >
            {adminImportContent}
          </AdminImportLauncher>
        )}
      </div>

      <div className="mt-4 space-y-5">
        {activeTab === 'munkafelulet' && children}
        {activeTab === 'help' && <JegyzokonyvekHelp />}
      </div>
    </>
  )
}
