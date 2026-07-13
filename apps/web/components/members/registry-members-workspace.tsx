'use client'

import { Activity, useCallback, useEffect, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { Home, UserRound } from 'lucide-react'

import type { MemberListPage } from '@/lib/members/registry-list-types'

import { PersonsTab } from './persons-tab'

type RegistryView = 'persons' | 'families'

interface RegistryMembersWorkspaceProps {
  initialPage: MemberListPage
}

const FamiliesTab = dynamic(
  () => import('./families-tab-v2').then((module) => module.FamiliesTab),
  {
    ssr: false,
    loading: () => <FamiliesWorkspaceSkeleton />,
  },
)

export function RegistryMembersWorkspace({ initialPage }: RegistryMembersWorkspaceProps) {
  const [view, setView] = useState<RegistryView>('persons')
  const [familiesActivated, setFamiliesActivated] = useState(false)

  const applyHash = useCallback(() => {
    const hash = window.location.hash.replace(/^#/, '')
    if (hash === 'families') {
      setView('families')
      setFamiliesActivated(true)
    } else if (hash === 'persons') {
      setView('persons')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) applyHash()
    })
    window.addEventListener('hashchange', applyHash)
    window.addEventListener('popstate', applyHash)
    return () => {
      cancelled = true
      window.removeEventListener('hashchange', applyHash)
      window.removeEventListener('popstate', applyHash)
    }
  }, [applyHash])

  function selectView(nextView: RegistryView) {
    setView(nextView)
    if (nextView === 'families') setFamiliesActivated(true)

    const nextHash = `#${nextView}`
    if (window.location.hash !== nextHash) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}${nextHash}`,
      )
    }
  }

  return (
    <section className="space-y-4" aria-label="Tagnyilvántartási munkafelület">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/95 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">
            Nyilvántartási nézet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ugyanazok az adatok személyenként vagy családi kartonokba rendezve.
          </p>
        </div>

        <div
          className="grid h-[52px] w-full shrink-0 grid-cols-2 rounded-xl border border-border bg-muted/55 p-1 sm:w-auto"
          role="group"
          aria-label="Tagnyilvántartási nézet kiválasztása"
        >
          <ViewButton
            active={view === 'persons'}
            icon={<UserRound className="size-4" />}
            label="Személyenként"
            onClick={() => selectView('persons')}
          />
          <ViewButton
            active={view === 'families'}
            icon={<Home className="size-4" />}
            label="Családok szerint"
            onClick={() => selectView('families')}
          />
        </div>
      </div>

      <Activity mode={view === 'persons' ? 'visible' : 'hidden'}>
        <PersonsTab initialPage={initialPage} />
      </Activity>

      {familiesActivated && (
        <Activity mode={view === 'families' ? 'visible' : 'hidden'}>
          <FamiliesTab />
        </Activity>
      )}
    </section>
  )
}

function ViewButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:text-sm ${
        active
          ? 'bg-background text-primary shadow-sm ring-1 ring-border/60'
          : 'text-muted-foreground hover:bg-background/55 hover:text-foreground'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

function FamiliesWorkspaceSkeleton() {
  return (
    <div className="space-y-4" aria-label="Családok betöltése" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl border border-border bg-muted/45 motion-reduce:animate-none" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-2xl border border-border bg-muted/45 motion-reduce:animate-none" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-64 animate-pulse rounded-2xl border border-border bg-muted/45 motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  )
}
