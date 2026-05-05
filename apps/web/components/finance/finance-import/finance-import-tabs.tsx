'use client'

/**
 * Pénzügyi import tabs — Kassza-import (teljes éves könyvelés) +
 * Egyházfenntartás-import (xlsx + xml deduplikációval) (2026-05-06).
 */

import { useState } from 'react'
import { Wallet, Users } from 'lucide-react'

import { PenzugyImportWizard } from './penzugy-import-wizard'
import { EgyhfenntartasImportWizard } from './egyhfenntartas/egyhfenntartas-wizard'

type TabId = 'kassza' | 'egyhfenntartas'

export function FinanceImportTabs() {
  const [tab, setTab] = useState<TabId>('kassza')

  const tabs: Array<{
    id: TabId
    label: string
    description: string
    icon: React.ComponentType<{ className?: string }>
    accent: string
  }> = [
    {
      id: 'kassza',
      label: 'Teljes Kassza-import',
      description: 'A hivatalos éves Kassza-xlsx (bevétel + kiadás)',
      icon: Wallet,
      accent: 'from-emerald-500 to-teal-600',
    },
    {
      id: 'egyhfenntartas',
      label: 'Egyházfenntartás-import',
      description: 'xlsx + xml egyeztetés tagonként',
      icon: Users,
      accent: 'from-violet-500 to-indigo-600',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {tabs.map(t => {
          const Icon = t.icon
          const isActive = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                isActive
                  ? 'border-violet-400 bg-white shadow-md'
                  : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white'
              }`}
            >
              <div
                className={`flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${t.accent} text-white shadow-sm`}
              >
                <Icon className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-heading text-base text-slate-800">{t.label}</h3>
                <p className="mt-0.5 text-xs text-slate-600">{t.description}</p>
              </div>
            </button>
          )
        })}
      </div>

      {tab === 'kassza' && (
        <div className="card-raised p-4 sm:p-5">
          <PenzugyImportWizard />
        </div>
      )}
      {tab === 'egyhfenntartas' && <EgyhfenntartasImportWizard />}
    </div>
  )
}
