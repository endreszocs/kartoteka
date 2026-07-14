'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

import { getFamilyGraphUnlockState } from '@/app/(dashboard)/tagnyilvantartas/family-graph-actions'
import { ColorTabs } from '@/components/ui/color-tabs'
import { FamilyGraphUnlockDialog } from '@/components/members/family-graph-unlock-dialog'
import {
  FAMILY_GRAPH_COUNT_EVENT,
  type FamilyGraphUnlockState,
} from '@/lib/members/family-graph-types'
import type { MemberOverviewSnapshot } from '@/lib/members/member-overview'
import type { MemberListPage } from '@/lib/members/registry-list-types'
import { OverviewTab } from './overview-tab'
import { RegistryMembersWorkspace } from './registry-members-workspace'

// 2026-06-30 (perf): a nem-default, ritkábban használt fülek next/dynamic-kal
// töltődnek — így a route kezdeti JS-bundle-jéből kikerül a nehéz súgó (~58KB),
// a Presbiterek, Körzetek, Választók és Hibák fül kódja, és csak a
// tényleges fülre kattintáskor töltődik le. Az Áttekintés (default) és a Személyek
// (leggyakoribb) statikus marad a gyors első festésért. A viselkedés változatlan.
const tabLoading = () => <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
const PresbytersTab = dynamic(() => import('./presbyters-tab').then((m) => m.PresbytersTab), { ssr: false, loading: tabLoading })
const DistrictsTab = dynamic(() => import('./districts-tab').then((m) => m.DistrictsTab), { ssr: false, loading: tabLoading })
const VotersTab = dynamic(() => import('./voters-tab').then((m) => m.VotersTab), { ssr: false, loading: tabLoading })
const ValidationErrorsTab = dynamic(() => import('./validation-errors-tab').then((m) => m.ValidationErrorsTab), { ssr: false, loading: tabLoading })
const TagnyilvantartasHelp = dynamic(() => import('./tagnyilvantartas-help').then((m) => m.TagnyilvantartasHelp), { ssr: false, loading: tabLoading })
const FamilyGraphTab = dynamic(() => import('./family-graph-tab').then((m) => m.FamilyGraphTab), { ssr: false, loading: tabLoading })

// Hash-routing — a sidebar almenüből (`/tagnyilvantartas#persons` stb.) közvetlen tab-ugrás.
// Az érvényes value-k egyezniek kell a `tabs` array-vel.
const VALID_TAB_HASHES = new Set([
  'overview',
  'persons',
  'family-network',
  'presbyters',
  'districts',
  'voters',
  'errors',
  'help',
  // 2026-05-25: a "Rendszergazdai importáló" fül a hash-routingban is elérhető,
  // de a jogosulatlan felhasználónak nem mutatjuk (lásd `showAdminImport` prop).
  'admin-import',
])
const DEFAULT_TAB = 'overview'

function getTabFromHash(
  hash: string,
  familyGraphUnlocked: boolean,
  showAdminImport: boolean,
): string {
  const clean = hash.replace(/^#/, '')
  // A korábbi közvetlen családi URL-ek a közös, személy-központú
  // munkafelületre mutatnak; a családi adatok a személyi kartonból érhetők el.
  if (clean === 'families') return 'persons'
  if (clean === 'family-network' && !familyGraphUnlocked) return 'persons'
  if (clean === 'admin-import' && !showAdminImport) return DEFAULT_TAB
  return VALID_TAB_HASHES.has(clean) ? clean : DEFAULT_TAB
}

interface MemberTabsV4Props {
  overviewSnapshot: MemberOverviewSnapshot
  initialMemberPage: MemberListPage
  isGodMode: boolean
  congregationId: string | null
  userId: string | null
  familyGraphUnlock: FamilyGraphUnlockState
  /**
   * Ha `true`, a tab-listához hozzáadódik egy "Rendszergazdai importáló" fül
   * (utolsó helyen, piros háttérrel). Jogosultság: god mode aktív, delegated
   * import vagy aktív admin szerepkör — a page.tsx dönti el.
   */
  showAdminImport?: boolean
  /** A Rendszergazdai importáló fül tartalma (jellemzően TagnyilvantartasImportWizard). */
  adminImportContent?: React.ReactNode
}

export function MemberTabsV4({
  overviewSnapshot,
  initialMemberPage,
  isGodMode,
  congregationId,
  userId,
  familyGraphUnlock,
  showAdminImport = false,
  adminImportContent,
}: MemberTabsV4Props) {
  const unlockScope = `${userId ?? 'anonymous'}:${congregationId ?? 'none'}`
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB)
  const [scopedGraphUnlock, setScopedGraphUnlock] = useState(() => ({
    scopeKey: unlockScope,
    value: familyGraphUnlock,
  }))
  const graphUnlock = scopedGraphUnlock.scopeKey === unlockScope
    ? scopedGraphUnlock.value
    : familyGraphUnlock
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false)
  const graphUnlockedRef = useRef(familyGraphUnlock.unlocked)
  const unlockCeremonyCheckedRef = useRef(false)
  const unlockScopeRef = useRef(unlockScope)
  const unlockRequestVersionRef = useRef(0)
  const showAdminImportRef = useRef(showAdminImport)

  useEffect(() => {
    unlockRequestVersionRef.current += 1
    setScopedGraphUnlock({
      scopeKey: unlockScope,
      value: {
        familyCount: familyGraphUnlock.familyCount,
        threshold: familyGraphUnlock.threshold,
        unlocked: familyGraphUnlock.unlocked,
      },
    })
  }, [
    familyGraphUnlock.familyCount,
    familyGraphUnlock.threshold,
    familyGraphUnlock.unlocked,
    unlockScope,
  ])

  useEffect(() => {
    if (unlockScopeRef.current === unlockScope) return
    unlockScopeRef.current = unlockScope
    unlockRequestVersionRef.current += 1
    unlockCeremonyCheckedRef.current = false
    setUnlockDialogOpen(false)
  }, [unlockScope])

  useEffect(() => {
    showAdminImportRef.current = showAdminImport
  }, [showAdminImport])

  useEffect(() => {
    graphUnlockedRef.current = graphUnlock.unlocked
  }, [graphUnlock.unlocked])

  // Hash-routing: induláskor + minden hash-változáskor frissítjük az activeTab-ot.
  // A sidebar `/tagnyilvantartas#persons` stb. URL-jeiből közvetlen tab-ugrás.
  //
  // 2026-04-28 FIX: a Next.js `<Link>` `pushState`-tel navigál — ez NEM trigger-eli
  // automatikusan a `hashchange` event-et (csak a böngésző natív back/forward-ja
  // teszi). Ezért monkey-patch-eljük a `history.pushState`/`replaceState`-et hogy
  // saját `hashchange` event-et küldjenek minden navigáció után. Így ha a sidebar
  // `<Link>` ugyanezen az oldalon csak a hash-t változtatja (`/tagnyilvantartas#persons`),
  // a tab IS frissül.
  useEffect(() => {
    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState
    let lastHash = window.location.hash
    const apply = () => {
      lastHash = window.location.hash
      if (lastHash === '#family-network' && !graphUnlockedRef.current) {
        lastHash = '#persons'
        originalReplaceState.call(
          window.history,
          null,
          '',
          `${window.location.pathname}${window.location.search}${lastHash}`,
        )
      } else if (lastHash === '#admin-import' && !showAdminImportRef.current) {
        lastHash = ''
        originalReplaceState.call(
          window.history,
          null,
          '',
          `${window.location.pathname}${window.location.search}`,
        )
      }
      setActiveTab(getTabFromHash(
        lastHash,
        graphUnlockedRef.current,
        showAdminImportRef.current,
      ))
    }
    apply()

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

  // A családlista csak változáskor jelez. A kliens nem döntheti el a feloldást:
  // minden ilyen jelzés után a tenant-szűrt Server Action számolja újra a státuszt.
  useEffect(() => {
    let cancelled = false
    let refreshing = false
    let refreshRequested = false

    const refreshUnlock = async () => {
      refreshRequested = true
      unlockRequestVersionRef.current += 1
      if (refreshing) return
      refreshing = true
      try {
        while (refreshRequested && !cancelled) {
          refreshRequested = false
          const requestVersion = unlockRequestVersionRef.current
          const requestScope = unlockScopeRef.current
          let next: FamilyGraphUnlockState | null = null
          let lastError: unknown = null

          for (let attempt = 0; attempt < 2 && !cancelled; attempt += 1) {
            try {
              next = await getFamilyGraphUnlockState()
              break
            } catch (error) {
              lastError = error
              if (attempt === 0) {
                await new Promise((resolve) => window.setTimeout(resolve, 450))
              }
            }
          }

          if (
            next &&
            !cancelled &&
            requestVersion === unlockRequestVersionRef.current &&
            requestScope === unlockScopeRef.current
          ) {
            setScopedGraphUnlock({ scopeKey: requestScope, value: next })
          } else if (!next && lastError && !cancelled) {
            console.error(
              '[MemberTabsV4] A családi háló feloldási állapota két próbálkozás után sem frissíthető:',
              lastError,
            )
          }
        }
      } finally {
        refreshing = false
      }
    }

    window.addEventListener(FAMILY_GRAPH_COUNT_EVENT, refreshUnlock)
    return () => {
      cancelled = true
      window.removeEventListener(FAMILY_GRAPH_COUNT_EVENT, refreshUnlock)
    }
  }, [])

  // Ha egy törlés után ismét 15 alá esik a családszám, a rejtett nézetből
  // biztonságosan visszalépünk a Személyek munkafelületre.
  useEffect(() => {
    if (!graphUnlock.unlocked && activeTab === 'family-network') {
      setActiveTab('persons')
      const nextUrl = `${window.location.pathname}${window.location.search}#persons`
      window.history.replaceState(null, '', nextUrl)
    }
  }, [activeTab, graphUnlock.unlocked])

  useEffect(() => {
    if (!showAdminImport && activeTab === 'admin-import') {
      setActiveTab(DEFAULT_TAB)
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}`,
      )
    }
  }, [activeTab, showAdminImport])

  // A meglepetés gyülekezetenként és felhasználónként egyszer jelenik meg az
  // adott böngészőben. Adatbázis-migráció nélkül ez a legkisebb, privát állapot.
  useEffect(() => {
    if (!graphUnlock.unlocked) {
      unlockCeremonyCheckedRef.current = false
      return
    }
    if (
      !congregationId ||
      !userId ||
      unlockCeremonyCheckedRef.current
    ) return

    unlockCeremonyCheckedRef.current = true
    const storageKey = `kartoteka:family-network-unlock:v1:${userId}:${congregationId}`
    try {
      if (localStorage.getItem(storageKey) === 'seen') return
    } catch {
      // Szigorú böngészőbeállítások mellett is megmutatható egyszer a sessionben.
    }
    const scheduledScope = unlockScope
    let opened = false
    const frameId = requestAnimationFrame(() => {
      if (
        graphUnlockedRef.current &&
        unlockScopeRef.current === scheduledScope
      ) {
        opened = true
        setUnlockDialogOpen(true)
      }
    })

    return () => {
      cancelAnimationFrame(frameId)
      if (!opened) unlockCeremonyCheckedRef.current = false
    }
  }, [congregationId, graphUnlock.unlocked, unlockScope, userId])

  function rememberFamilyGraphDiscovery() {
    if (!congregationId || !userId) return
    try {
      localStorage.setItem(
        `kartoteka:family-network-unlock:v1:${userId}:${congregationId}`,
        'seen',
      )
    } catch {
      // A dialógus localStorage nélkül is szabályosan bezárható.
    }
  }

  function handleUnlockDialogOpenChange(open: boolean) {
    if (!open) rememberFamilyGraphDiscovery()
    setUnlockDialogOpen(open)
  }

  // Tab váltáskor frissítjük a URL hash-ét is (hogy bookmarkolható legyen)
  const handleTabChange = (next: string) => {
    if (next === 'family-network' && !graphUnlock.unlocked) return
    if (next === 'admin-import' && !showAdminImport) return
    setActiveTab(next)
    if (typeof window !== 'undefined') {
      const newHash = next === DEFAULT_TAB ? '' : `#${next}`
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search + newHash)
      }
    }
  }

  const tabs = useMemo(() => {
    const base = [
      { value: 'overview', label: 'Áttekintés', color: 'blue' },
      { value: 'persons', label: 'Személyek', color: 'emerald' },
      ...(graphUnlock.unlocked
        ? [{ value: 'family-network', label: 'Családi háló ✦', color: 'violet' }]
        : []),
      { value: 'presbyters', label: 'Presbiterek', color: 'amber' },
      { value: 'districts', label: 'Körzetek', color: 'cyan' },
      { value: 'voters', label: 'Választók', color: 'pink' },
      { value: 'errors', label: 'Hibák', color: 'red' },
      // 2026-05-25: lelkészi súgó — kategória-választós oldal a tagnyilvántartás
      // domain-szabályairól (egyháztagság, családok, járulék, választók, ...).
      { value: 'help', label: 'Súgó', color: 'teal' },
    ]
    if (showAdminImport) {
      base.push({
        value: 'admin-import',
        label: 'Rendszergazdai importáló',
        // 'red-prominent' inaktív állapotban is piros háttér — vizuálisan
        // figyelmeztető, hogy a fül veszélyes műveletet rejt.
        color: 'red-prominent',
      })
    }
    return base
  }, [graphUnlock.unlocked, showAdminImport])

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
              {initialMemberPage.totalCount} személy
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
              {overviewSnapshot.stats.total} aktív tag
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
        {activeTab === 'overview' && <OverviewTab snapshot={overviewSnapshot} />}
        {activeTab === 'persons' && (
          <RegistryMembersWorkspace initialPage={initialMemberPage} />
        )}
        {activeTab === 'family-network' && graphUnlock.unlocked && <FamilyGraphTab />}
        {activeTab === 'presbyters' && <PresbytersTab />}
        {activeTab === 'districts' && <DistrictsTab />}
        {activeTab === 'voters' && <VotersTab />}
        {activeTab === 'errors' && <ValidationErrorsTab />}
        {activeTab === 'help' && <TagnyilvantartasHelp />}
        {activeTab === 'admin-import' && showAdminImport && adminImportContent}
      </div>

      <FamilyGraphUnlockDialog
        congregationId={congregationId}
        open={unlockDialogOpen && graphUnlock.unlocked}
        onOpenChange={handleUnlockDialogOpenChange}
        onExplore={() => {
          rememberFamilyGraphDiscovery()
          setUnlockDialogOpen(false)
          handleTabChange('family-network')
        }}
      />
    </div>
  )
}
