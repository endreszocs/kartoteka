'use client'

import { useState } from 'react'

import { ColorTabs } from '@/components/ui/color-tabs'
import { Tabs, TabsContent } from '@/components/ui/tabs'

import { AccessRequestsTab } from './access-requests-tab'
import { BroadcastsTab } from './broadcasts-tab'
import { CongregationsTab } from './congregations-tab'
import { DataWipeTab } from './data-wipe-tab'
import { DevicesLicensesTab } from './devices-licenses-tab'
import { TagnyilvantartasImportWizard } from '@/components/members/tagnyilvantartas-import-wizard'
import { OverviewTabRefined } from './overview-tab-refined'
import { ProfileCongregationsTab } from './profile-congregations-tab'
import { SecuritySettingsTabV2 } from './security-settings-tab-v2'
import { SupportTab } from './support-tab'
import { SystemFinanceTab } from './system-finance-tab'
import { UsersTab } from './users-tab'
import { ImportLogList } from './import-log-list'

// Sprint U.5 (2026-05-03): a "roles" fül összeolvadt a "users"-szel — az UsersTab
// most már a `UnifiedUsersTab`-ot rendereli (re-export). A "roles" tab kikerült.
const TABS = [
  { value: 'overview', label: 'Áttekintés', color: 'blue' },
  { value: 'access-requests', label: 'Hozzáférés-kérelmek', color: 'amber' },
  { value: 'congregations', label: 'Gyülekezetek', color: 'emerald' },
  { value: 'users', label: 'Felhasználók', color: 'violet' },
  { value: 'assignments', label: 'Könyvelők / számvevők', color: 'teal' },
  { value: 'devices', label: 'Eszközök és napló', color: 'cyan' },
  { value: 'broadcasts', label: 'Frissítések', color: 'orange' },
  { value: 'support', label: 'Támogatás', color: 'yellow' },
  { value: 'import', label: 'Import', color: 'pink' },
  { value: 'system-finance', label: 'Rendszer pénzügyei', color: 'rose' },
  { value: 'security', label: 'Rendszer', color: 'red' },
  { value: 'data-wipe', label: 'Veszélyes zóna', color: 'red' },
]

export function AdminTabsV3({ isGodMode = false }: { isGodMode?: boolean }) {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <ColorTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <TabsContent value="overview">
        <OverviewTabRefined />
      </TabsContent>
      <TabsContent value="access-requests">
        <AccessRequestsTab />
      </TabsContent>
      <TabsContent value="congregations">
        <CongregationsTab />
      </TabsContent>
      <TabsContent value="users">
        <UsersTab />
      </TabsContent>
      <TabsContent value="assignments">
        <ProfileCongregationsTab />
      </TabsContent>
      <TabsContent value="devices">
        <DevicesLicensesTab />
      </TabsContent>
      <TabsContent value="broadcasts">
        <BroadcastsTab />
      </TabsContent>
      <TabsContent value="support">
        <SupportTab />
      </TabsContent>
      <TabsContent value="import">
        {isGodMode ? (
          <div className="mt-4 space-y-6">
            <TagnyilvantartasImportWizard mode="admin" />
            <ImportLogList />
          </div>
        ) : (
          <div className="mt-4 rounded-[1.5rem] border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-900">
            <p className="font-semibold">Az importáló rendszergazdai módban érhető el.</p>
            <p className="mt-1">
              Aktiváld a rendszergazdai (god) módot, hogy bármely gyülekezet
              tagnyilvántartási adatait importálhasd egy egységes wizardon keresztül.
            </p>
          </div>
        )}
      </TabsContent>
      <TabsContent value="system-finance">
        <SystemFinanceTab />
      </TabsContent>
      <TabsContent value="security">
        <SecuritySettingsTabV2 />
      </TabsContent>
      <TabsContent value="data-wipe">
        <DataWipeTab />
      </TabsContent>
    </Tabs>
  )
}
