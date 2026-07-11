'use client'

/**
 * Felhasználók oldal — kétfüles konténer (2026-07-11 admin-redesign 2. kör).
 *
 * A korábbi külön „Könyvelők / számvevők" admin-oldal beolvadt ide másodlagos
 * fülként („Könyvelői hozzárendelések"), változatlan funkcióval. Így a
 * felhasználó-kezelés és a pénzügyi feladatkör-kiosztás egy helyen van, kevesebb
 * menüponttal. Az /admin/konyvelok útvonal ide irányít (?tab=konyvelok).
 *
 * Token-first, mobil-first: a fül-fejléc 375px-en is elfér (rövid feliratok),
 * és vízszintesen görgethető, ha kell.
 */

import { useState } from 'react'
import { Calculator, UserCog } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ProfileCongregationsTab } from '@/components/admin/profile-congregations-tab'
import { UnifiedUsersTab } from './unified-users-tab'

type TabKey = 'users' | 'konyvelok'

export function UsersPageTabs({ initialTab = 'users' }: { initialTab?: TabKey }) {
  const [tab, setTab] = useState<TabKey>(initialTab)

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(String(v) as TabKey)}>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList className="w-full min-w-max sm:w-auto">
          <TabsTrigger value="users" className="gap-1.5">
            <UserCog className="size-4" aria-hidden />
            <span className="hidden sm:inline">Felhasználók és szerepkörök</span>
            <span className="sm:hidden">Felhasználók</span>
          </TabsTrigger>
          <TabsTrigger value="konyvelok" className="gap-1.5">
            <Calculator className="size-4" aria-hidden />
            <span className="hidden sm:inline">Könyvelői hozzárendelések</span>
            <span className="sm:hidden">Könyvelők</span>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="users" className="mt-4">
        <div className="card-raised p-4 sm:p-5">
          <UnifiedUsersTab />
        </div>
      </TabsContent>

      <TabsContent value="konyvelok" className="mt-4">
        <div className="card-raised p-4 sm:p-5">
          <ProfileCongregationsTab />
        </div>
      </TabsContent>
    </Tabs>
  )
}
