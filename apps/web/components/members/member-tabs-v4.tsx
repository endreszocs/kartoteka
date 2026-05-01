'use client'

import { useEffect, useMemo, useState } from 'react'

import { ColorTabs } from '@/components/ui/color-tabs'
import type { EnrichedMember } from '@/lib/constants/members'
import { DistrictsTab } from './districts-tab'
import { FamiliesTab } from './families-tab-v2'
import { OverviewTab } from './overview-tab'
import { PersonsTab } from './persons-tab'
import { PresbytersTab } from './presbyters-tab'
import { ValidationErrorsTab } from './validation-errors-tab'
import { VotersTab } from './voters-tab'

// Hash-routing — a sidebar almenüből (`/tagnyilvantartas#persons` stb.) közvetlen tab-ugrás.
// Az érvényes value-k egyezniek kell a `tabs` array-vel.
const VALID_TAB_HASHES = new Set(['overview', 'persons', 'families', 'presbyters', 'districts', 'voters', 'errors'])
const DEFAULT_TAB = 'overview'

function getTabFromHash(hash: string): string {
  const clean = hash.replace(/^#/, '')
  return VALID_TAB_HASHES.has(clean) ? clean : DEFAULT_TAB
}

interface MemberTabsV4Props {
  initialMembers: EnrichedMember[]
  paidPersonIds: number[]
  paidFamilyIds: number[]
  exemptPersonIds: number[]
  exemptFamilyIds: number[]
  personToFamilyMap: Record<number, number>
  isGodMode: boolean
}

export function MemberTabsV4({
  initialMembers,
  paidPersonIds,
  personToFamilyMap,
  isGodMode,
}: MemberTabsV4Props) {
  const [members, setMembers] = useState(initialMembers)
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB)

  // Hash-routing: induláskor + minden hash-változáskor frissítjük az activeTab-ot.
  // A sidebar `/tagnyilvantartas#families` stb. URL-jeiből közvetlen tab-ugrás.
  //
  // 2026-04-28 FIX: a Next.js `<Link>` `pushState`-tel navigál — ez NEM trigger-eli
  // automatikusan a `hashchange` event-et (csak a böngésző natív back/forward-ja
  // teszi). Ezért monkey-patch-eljük a `history.pushState`/`replaceState`-et hogy
  // saját `hashchange` event-et küldjenek minden navigáció után. Így ha a sidebar
  // `<Link>` ugyanezen az oldalon csak a hash-t változtatja (`/tagnyilvantartas#persons`),
  // a tab IS frissül.
  useEffect(() => {
    const apply = () => setActiveTab(getTabFromHash(window.location.hash))
    apply()

    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState
    let lastHash = window.location.hash
    const dispatchIfHashChanged = () => {
      const newHash = window.location.hash
      if (newHash !== lastHash) {
        lastHash = newHash
        // setTimeout(0) — várjuk meg hogy a Next.js befejezze a routing-ot
        setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 0)
      }
    }
    window.history.pushState = function (...args) {
      originalPushState.apply(this, args)
      dispatchIfHashChanged()
    }
    window.history.replaceState = function (...args) {
      originalReplaceState.apply(this, args)
      dispatchIfHashChanged()
    }

    window.addEventListener('hashchange', apply)
    window.addEventListener('popstate', apply)
    return () => {
      window.removeEventListener('hashchange', apply)
      window.removeEventListener('popstate', apply)
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
    }
  }, [])

  // Tab váltáskor frissítjük a URL hash-ét is (hogy bookmarkolható legyen)
  const handleTabChange = (next: string) => {
    setActiveTab(next)
    if (typeof window !== 'undefined') {
      const newHash = next === DEFAULT_TAB ? '' : `#${next}`
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search + newHash)
      }
    }
  }

  const tabs = useMemo(
    () => [
      { value: 'overview', label: 'Áttekintés', color: 'blue' },
      { value: 'persons', label: 'Személyek', color: 'emerald' },
      { value: 'families', label: 'Családok', color: 'violet' },
      { value: 'presbyters', label: 'Presbiterek', color: 'amber' },
      { value: 'districts', label: 'Körzetek', color: 'cyan' },
      { value: 'voters', label: 'Választók', color: 'pink' },
      { value: 'errors', label: 'Hibák', color: 'red' },
    ],
    [],
  )

  function handleMemberRemoved(id: number) {
    setMembers((prev) => prev.filter((member) => member.id !== id))
  }

  function handleMemberUpdated(id: number, updates: Partial<EnrichedMember>) {
    setMembers((prev) =>
      prev.map((member) => (member.id === id ? { ...member, ...updates } : member)),
    )
  }

  function handleRefresh(newMembers: EnrichedMember[]) {
    setMembers(newMembers)
  }

  return (
    <div className="space-y-4">
      <div className="card-raised relative overflow-hidden p-5 sm:p-6">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-amber-200/35 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-teal-200/30 blur-3xl" />

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">
              Tagnyilvántartás
            </p>
            <h2 className="font-heading text-3xl text-slate-800">Közösségi áttekintés</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              A tagok, családok, körzetek és választói adatok egy helyen, letisztultan és
              könnyen áttekinthetően.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
              {members.length} személy
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
              {paidPersonIds.length} járulékfizető
            </span>
            {isGodMode && (
              <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600 shadow-sm">
                Rendszergazdai mód aktív
              </span>
            )}
          </div>
        </div>
      </div>

      <ColorTabs tabs={tabs} active={activeTab} onChange={handleTabChange} />

      <div>
        {activeTab === 'overview' && <OverviewTab members={members} />}
        {activeTab === 'persons' && (
          <PersonsTab
            members={members}
            paidPersonIds={paidPersonIds}
            personToFamilyMap={personToFamilyMap}
            isGodMode={isGodMode}
            onMemberRemoved={handleMemberRemoved}
            onMemberUpdated={handleMemberUpdated}
            onRefresh={handleRefresh}
          />
        )}
        {activeTab === 'families' && <FamiliesTab />}
        {activeTab === 'presbyters' && <PresbytersTab />}
        {activeTab === 'districts' && <DistrictsTab />}
        {activeTab === 'voters' && <VotersTab />}
        {activeTab === 'errors' && <ValidationErrorsTab />}
      </div>
    </div>
  )
}
