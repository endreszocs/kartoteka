'use client'

import { useState } from 'react'

import { ColorTabs } from '@/components/ui/color-tabs'
import { Tabs, TabsContent } from '@/components/ui/tabs'

import { AccessRequestsTab } from './access-requests-tab'
import { BroadcastsTab } from './broadcasts-tab'
import { CongregationsTab } from './congregations-tab'
import { DataWipeTab } from './data-wipe-tab'
import { DevicesLicensesTab } from './devices-licenses-tab'
import { ImportTabRefined } from './import-tab-refined'
import { OverviewTabRefined } from './overview-tab-refined'
import { ProfileCongregationsTab } from './profile-congregations-tab'
import { ProfileRolesTab } from './profile-roles-tab'
import { SecuritySettingsTabV2 } from './security-settings-tab-v2'
import { SupportTab } from './support-tab'
import { SystemFinanceTab } from './system-finance-tab'
import { UsersTab } from './users-tab'

const TABS = [
  { value: 'overview', label: 'Áttekintés', color: 'blue' },
  { value: 'access-requests', label: 'Hozzáférés-kérelmek', color: 'amber' },
  { value: 'congregations', label: 'Gyülekezetek', color: 'emerald' },
  { value: 'users', label: 'Felhasználók', color: 'violet' },
  { value: 'roles', label: 'Szerepkörök', color: 'indigo' },
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
      <TabsContent value="roles">
        <ProfileRolesTab />
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
        <ImportTabRefined isGodMode={isGodMode} />
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
