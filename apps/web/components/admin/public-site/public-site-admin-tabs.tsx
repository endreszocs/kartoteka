'use client'

/**
 * Publikus oldal admin tab-rendszer.
 * Egy helyen egyesíti: áttekintés, beállítások, bejegyzések, magazin.
 */

import { useState } from 'react'
import { Globe } from 'lucide-react'
import { ColorTabs } from '@/components/ui/color-tabs'

interface PublicSiteAdminTabsProps {
  /** Áttekintés tartalom (szerver renderelt) */
  overviewContent: React.ReactNode
  /** Beállítások tartalom */
  settingsContent: React.ReactNode
  /** Bejegyzések tartalom */
  postsContent: React.ReactNode
  /** Magazin tartalom */
  magazineContent: React.ReactNode
}

export function PublicSiteAdminTabs({
  overviewContent,
  settingsContent,
  postsContent,
  magazineContent,
}: PublicSiteAdminTabsProps) {
  const [activeTab, setActiveTab] = useState('overview')

  const tabs = [
    { value: 'overview', label: 'Áttekintés', color: 'emerald' },
    { value: 'settings', label: 'Beállítások', color: 'blue' },
    { value: 'posts', label: 'Bejegyzések', color: 'violet' },
    { value: 'magazine', label: 'Magazin', color: 'amber' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
          <Globe className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h1 className="font-heading text-3xl text-slate-800">Gyülekezeti weboldal</h1>
          <p className="text-sm text-slate-500">
            A publikus weboldal kezelése — beállítások, bejegyzések, magazin
          </p>
        </div>
      </div>

      <ColorTabs tabs={tabs} active={activeTab} onChange={(value) => setActiveTab(value)} />

      <div>
        {activeTab === 'overview' && overviewContent}
        {activeTab === 'settings' && settingsContent}
        {activeTab === 'posts' && postsContent}
        {activeTab === 'magazine' && magazineContent}
      </div>
    </div>
  )
}
