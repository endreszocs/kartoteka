'use client'

/**
 * Admin „Frissítések" fül — héj: navigáció + adatbetöltés + szekció-router.
 *
 * 2026-07-11 admin-redesign: az 1300 soros fájl szét lett bontva a
 * components/admin/broadcasts/ könyvtárba:
 *   - broadcasts-overview.tsx      — áttekintő kártyák
 *   - changelog-send-section.tsx   — fejlesztések kiküldése (+ KÖTELEZŐ bugfix:
 *                                    a tömeges küldés nem force-újraküld némán)
 *   - broadcast-compose-section.tsx — kézi üzenet (saját címzés-állapottal)
 *   - broadcast-archive.tsx        — elküldött üzenetek (kinyitható törzs)
 *   - broadcast-target-picker.tsx / email-opt-in.tsx / delivery-badges.tsx / format.ts
 *
 * További javítások:
 *   - a kezdeti betöltés hibája többé nem néma (hiba-panel + újrapróbálás);
 *   - a küldés utáni frissítés nem cseréli az egész felületet betöltő-szövegre
 *     (a tartalom és a görgetési pozíció megmarad);
 *   - token-alapú színek (dark-safe), mobil-first navigáció;
 *   - a duplikált belső hero-fejléc megszűnt (az oldal-fejlécet az
 *     AdminPageHeader adja).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  Clock,
  LayoutGrid,
  RefreshCw,
  Send,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AdminSkeleton } from '@/components/admin/_shared/admin-skeleton'

import {
  listBroadcasts,
  listChangelogEntries,
  listCongregationsForBroadcast,
  listDiocesesForBroadcast,
  listDistrictsForBroadcast,
} from '@/app/(dashboard)/admin/broadcasts-actions'

import type { BroadcastRow, ChangelogEntry } from '@/lib/broadcasts/types'

import { NewsletterComposeDialog } from './newsletter-compose-dialog'
import { BroadcastsOverview, type BroadcastSectionId } from './broadcasts/broadcasts-overview'
import { ChangelogSendSection } from './broadcasts/changelog-send-section'
import { BroadcastComposeSection } from './broadcasts/broadcast-compose-section'
import { BroadcastArchive } from './broadcasts/broadcast-archive'
import type {
  CongLite,
  DioceseLite,
  DistrictLite,
} from './broadcasts/broadcast-target-picker'

const NAV_ITEMS: Array<{
  id: BroadcastSectionId
  label: string
  icon: LucideIcon
  hint: string
}> = [
  { id: 'overview', label: 'Áttekintés', icon: LayoutGrid, hint: 'Mire való ez az oldal' },
  {
    id: 'changelog',
    label: 'Fejlesztések kiküldése',
    icon: Sparkles,
    hint: 'Újdonságok és hírlevél a felhasználóknak',
  },
  { id: 'compose', label: 'Új üzenet írása', icon: Send, hint: 'Saját üzenet összeállítása' },
  { id: 'archive', label: 'Elküldött üzenetek', icon: Clock, hint: 'Korábbi kiküldések' },
]

export function BroadcastsTab() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [section, setSection] = useState<BroadcastSectionId>('overview')

  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([])
  const [congregations, setCongregations] = useState<CongLite[]>([])
  const [dioceses, setDioceses] = useState<DioceseLite[]>([])
  const [districts, setDistricts] = useState<DistrictLite[]>([])

  const [newsletterOpen, setNewsletterOpen] = useState(false)

  /**
   * Az 5 lista lekérése. FIX 2026-07-11: a visszaadott { error }-ok többé nem
   * vesznek el némán — összegyűjtjük és hiba-panelben mutatjuk.
   */
  const fetchAll = useCallback(async () => {
    const [e, b, c, d, di] = await Promise.all([
      listChangelogEntries(),
      listBroadcasts(),
      listCongregationsForBroadcast(),
      listDiocesesForBroadcast(),
      listDistrictsForBroadcast(),
    ])

    if (e.data) setEntries(e.data)
    if (b.data) setBroadcasts(b.data)
    if (c.data) setCongregations(c.data)
    if (d.data) setDioceses(d.data)
    if (di.data) setDistricts(di.data)

    const errors = [e.error, b.error, c.error, d.error, di.error].filter(
      (x): x is string => !!x,
    )
    return errors.length > 0 ? Array.from(new Set(errors)).join(' · ') : null
  }, [])

  const initialLoad = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    fetchAll()
      .then((err) => setLoadError(err))
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : 'Ismeretlen betöltési hiba.'),
      )
      .finally(() => setLoading(false))
  }, [fetchAll])

  useEffect(() => {
    // rAF-deferral — a synchronous setState-in-effect lint elkerülésére
    // (ugyanaz a minta, mint a support-tab / admin-confirm-dialog esetén).
    const raf = requestAnimationFrame(() => initialLoad())
    return () => cancelAnimationFrame(raf)
  }, [initialLoad])

  /**
   * Küldés utáni frissítés — NEM üríti ki a felületet (a korábbi teljes
   * „Adatok betöltése…" csere helyett), csak csendben újratölti a listákat.
   */
  const reload = useCallback(() => {
    fetchAll()
      .then((err) => {
        if (err) toast.error(`A lista frissítése részben sikertelen: ${err}`)
      })
      .catch(() => toast.error('A lista frissítése nem sikerült.'))
  }, [fetchAll])

  // Memoizálva — a NewsletterComposeDialog reset-effektje ezekre hivatkozik,
  // stabil identitás nélkül minden szülő-render kiütné a dialógus állapotát.
  const activeEntries = useMemo(() => entries.filter((e) => !e.readMarked), [entries])
  const unsentEntries = useMemo(
    () => activeEntries.filter((e) => !e.alreadySent),
    [activeEntries],
  )

  if (loading) {
    return <AdminSkeleton rows={6} className="py-4" />
  }

  if (loadError && entries.length === 0 && broadcasts.length === 0) {
    // Semmi nem töltődött be — teljes hiba-állapot újrapróbálással.
    return <LoadErrorPanel message={loadError} onRetry={initialLoad} />
  }

  const unsentCount = unsentEntries.length

  const navBadge: Partial<Record<BroadcastSectionId, number>> = {
    changelog: unsentCount,
    archive: broadcasts.length,
  }

  return (
    <div className="space-y-4">
      {loadError && <LoadErrorPanel message={loadError} onRetry={initialLoad} compact />}

      {/* Mobil: vízszintes chip-navigáció */}
      <nav aria-label="Frissítések szekciók" className="flex flex-wrap gap-2 lg:hidden">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = section === item.id
          const badge = navBadge[item.id]
          return (
            <Button
              key={item.id}
              type="button"
              variant="outline"
              onClick={() => setSection(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`min-h-11 gap-1.5 rounded-xl px-3 ${
                active
                  ? 'border-transparent bg-primary/10 font-medium text-primary ring-1 ring-primary/30 hover:bg-primary/15'
                  : 'text-muted-foreground'
              }`}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
              {badge != null && badge > 0 && (
                <Badge
                  className={
                    active
                      ? 'border-transparent bg-primary text-primary-foreground'
                      : 'border-border bg-muted text-muted-foreground'
                  }
                >
                  {badge}
                </Badge>
              )}
            </Button>
          )
        })}
      </nav>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        {/* Desktop: bal oldali menü */}
        <nav
          aria-label="Frissítések szekciók"
          className="hidden h-fit overflow-hidden rounded-2xl border border-border bg-card p-2 lg:sticky lg:top-4 lg:block"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = section === item.id
            const badge = navBadge[item.id]
            return (
              // Teljes-soros menügomb (engedélyezett wrapper-kivétel)
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-tight">{item.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground/80">
                    {item.hint}
                  </span>
                </span>
                {badge != null && badge > 0 && (
                  <Badge
                    className={
                      active
                        ? 'border-transparent bg-primary text-primary-foreground'
                        : 'border-border bg-muted text-muted-foreground'
                    }
                  >
                    {badge}
                  </Badge>
                )}
                <ChevronRight
                  className={`size-4 shrink-0 ${active ? 'text-primary/60' : 'text-muted-foreground/40'}`}
                  aria-hidden
                />
              </button>
            )
          })}
        </nav>

        {/* Tartalom */}
        <div className="min-w-0">
          {section === 'overview' && (
            <BroadcastsOverview
              entriesCount={entries.length}
              unsentCount={unsentCount}
              broadcastsCount={broadcasts.length}
              onGo={setSection}
            />
          )}

          {section === 'changelog' && (
            <ChangelogSendSection
              entries={entries}
              congregations={congregations}
              dioceses={dioceses}
              districts={districts}
              onReload={reload}
              onOpenNewsletter={() => setNewsletterOpen(true)}
            />
          )}

          {section === 'compose' && (
            <BroadcastComposeSection
              congregations={congregations}
              dioceses={dioceses}
              districts={districts}
              onSent={reload}
            />
          )}

          {section === 'archive' && <BroadcastArchive broadcasts={broadcasts} />}
        </div>
      </div>

      {/* Fejlesztési hírlevél szerkesztő */}
      <NewsletterComposeDialog
        open={newsletterOpen}
        onOpenChange={setNewsletterOpen}
        unsentEntries={unsentEntries}
        allEntries={activeEntries}
        onSent={reload}
      />
    </div>
  )
}

function LoadErrorPanel({
  message,
  onRetry,
  compact,
}: {
  message: string
  onRetry: () => void
  compact?: boolean
}) {
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-rose-200 bg-rose-50/60 text-center dark:border-rose-900 dark:bg-rose-950/30 ${
        compact ? 'p-4' : 'p-6'
      }`}
    >
      <p className="font-semibold text-rose-800 dark:text-rose-300">
        {compact
          ? 'Az adatok egy része nem töltődött be'
          : 'A frissítések betöltése nem sikerült'}
      </p>
      <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">{message}</p>
      <Button onClick={onRetry} variant="outline" className="mt-3 gap-2">
        <RefreshCw className="size-4" aria-hidden />
        Újrapróbálom
      </Button>
    </div>
  )
}

// A régi (egy fájlos) implementáció al-komponenseinek helye mostantól:
// components/admin/broadcasts/*. Ez a típus-re-export a meglévő importok
// kedvéért marad (ha valahol a CongLite-ot innen várnák).
export type { CongLite, DioceseLite, DistrictLite }
