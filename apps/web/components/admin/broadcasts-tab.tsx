'use client'

/**
 * Admin „Frissítések" fül — héj: adatbetöltés + szekció-elrendezés.
 *
 * 2026-07-11 olvashatósági redesign: a korábbi bal-oldali menü + szekció-
 * router (külön „Áttekintés" lépcsővel) helyett az oldal FELÜLRŐL LEFELÉ
 * olvasható, a teendők sorrendjében:
 *
 *   1. Gyors-áttekintő sáv        — van-e kiküldetlen fejlesztés? (ugrás)
 *   2. Fejlesztések kiküldése     — a következő teendő, nyitva indul
 *   3. Új üzenet írása            — összecsukva indul
 *   4. Elküldött üzenetek         — összecsukva indul
 *
 * Így egyszerre mindig egy dolog dominál a képernyőn, és semmi nincs
 * elrejtve egy külön navigációs lépcső mögé.
 *
 * A korábbi javítások változatlanul érvényben:
 *   - a kezdeti betöltés hibája nem néma (hiba-panel + újrapróbálás);
 *   - a küldés utáni frissítés nem cseréli az egész felületet betöltő-
 *     szövegre (a tartalom és a görgetési pozíció megmarad);
 *   - a tömeges küldés biztonsági viselkedése (alapból csak kiküldetlenek)
 *     a ChangelogSendSection-ben él tovább, érintetlenül.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, RefreshCw, Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { AdminSkeleton } from '@/components/admin/_shared/admin-skeleton'
import { StatusBadge } from '@/components/admin/_shared/status-badge'

import {
  listBroadcasts,
  listChangelogEntries,
  listCongregationsForBroadcast,
  listDiocesesForBroadcast,
  listDistrictsForBroadcast,
} from '@/app/(dashboard)/admin/broadcasts-actions'

import type { BroadcastRow, ChangelogEntry } from '@/lib/broadcasts/types'
import { varKikuldesre } from '@/lib/broadcasts/changelog-status'

import { NewsletterComposeDialog } from './newsletter-compose-dialog'
import { BroadcastsSummaryNav, type BroadcastSectionId } from './broadcasts/broadcasts-overview'
import { BroadcastSectionCard } from './broadcasts/section-card'
import { ChangelogSendSection } from './broadcasts/changelog-send-section'
import { BroadcastComposeSection } from './broadcasts/broadcast-compose-section'
import { BroadcastArchive } from './broadcasts/broadcast-archive'
import type {
  CongLite,
  DioceseLite,
  DistrictLite,
} from './broadcasts/broadcast-target-picker'

const SECTION_DOM_ID: Record<BroadcastSectionId, string> = {
  changelog: 'frissitesek-fejlesztesek',
  compose: 'frissitesek-uj-uzenet',
  archive: 'frissitesek-elkuldott',
}

export function BroadcastsTab() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Melyik szekció van kinyitva — a teendő (fejlesztések) nyitva indul,
  // a másodlagosak összecsukva, hogy az oldal első ránézésre átlátható legyen.
  const [openSections, setOpenSections] = useState<Record<BroadcastSectionId, boolean>>({
    changelog: true,
    compose: false,
    archive: false,
  })

  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  // true = a 2026-08-12-changelog-jelolesek.sql még nem futott le élesben.
  // Nem hiba, hanem TEENDŐ — a szekció kiírja a futtatandó fájl nevét.
  const [jelolesekNeedsSql, setJelolesekNeedsSql] = useState(false)
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
    setJelolesekNeedsSql(!!e.jelolesekNeedsSql)
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

  const toggleSection = useCallback((id: BroadcastSectionId) => {
    setOpenSections((current) => ({ ...current, [id]: !current[id] }))
  }, [])

  /** Gyorsnavigáció: kinyitja a szekciót és odagörget. */
  const goToSection = useCallback((id: BroadcastSectionId) => {
    setOpenSections((current) => ({ ...current, [id]: true }))
    requestAnimationFrame(() => {
      document
        .getElementById(SECTION_DOM_ID[id])
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  // Memoizálva — a NewsletterComposeDialog reset-effektje ezekre hivatkozik,
  // stabil identitás nélkül minden szülő-render kiütné a dialógus állapotát.
  const activeEntries = useMemo(() => entries.filter((e) => !e.readMarked), [entries])
  // A „kiküldésre vár" definíciója EGY helyen él (lib/broadcasts/changelog-status.ts):
  // se valódi kiküldés, se kézi jelölés nincs rajta.
  const unsentEntries = useMemo(() => activeEntries.filter(varKikuldesre), [activeEntries])

  if (loading) {
    // A szekciók maguk kártyák, ezért a betöltő is kap egy kártya-hátteret.
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <AdminSkeleton rows={6} className="py-2" />
      </div>
    )
  }

  if (loadError && entries.length === 0 && broadcasts.length === 0) {
    // Semmi nem töltődött be — teljes hiba-állapot újrapróbálással.
    return <LoadErrorPanel message={loadError} onRetry={initialLoad} />
  }

  const unsentCount = unsentEntries.length

  return (
    <div className="space-y-4 sm:space-y-5">
      {loadError && <LoadErrorPanel message={loadError} onRetry={initialLoad} compact />}

      {/* Gyors-áttekintő sáv: mi a helyzet, hova érdemes ugrani */}
      <BroadcastsSummaryNav
        unsentCount={unsentCount}
        broadcastsCount={broadcasts.length}
        onGo={goToSection}
      />

      {/* (a) A következő teendő: fejlesztések kiküldése */}
      <BroadcastSectionCard
        id={SECTION_DOM_ID.changelog}
        icon={Sparkles}
        title="Fejlesztések kiküldése"
        description="A fejlesztési napló bejegyzései — értesítésként vagy szép hírlevélbe csomagolva küldheted ki őket."
        badges={
          unsentCount > 0 ? (
            <StatusBadge intent="warning">{unsentCount} kiküldésre vár</StatusBadge>
          ) : undefined
        }
        open={openSections.changelog}
        onToggle={() => toggleSection('changelog')}
      >
        <ChangelogSendSection
          entries={entries}
          congregations={congregations}
          dioceses={dioceses}
          districts={districts}
          jelolesekNeedsSql={jelolesekNeedsSql}
          onReload={reload}
          onOpenNewsletter={() => setNewsletterOpen(true)}
        />
      </BroadcastSectionCard>

      {/* (b) Új üzenet írása */}
      <BroadcastSectionCard
        id={SECTION_DOM_ID.compose}
        icon={Send}
        title="Új üzenet írása"
        description="Saját, egyedi üzenet (cím + szöveg) a kiválasztott címzetteknek — értesítésként vagy e-mailben."
        open={openSections.compose}
        onToggle={() => toggleSection('compose')}
      >
        <BroadcastComposeSection
          congregations={congregations}
          dioceses={dioceses}
          districts={districts}
          onSent={reload}
        />
      </BroadcastSectionCard>

      {/* (c) Előzmények */}
      <BroadcastSectionCard
        id={SECTION_DOM_ID.archive}
        icon={Clock}
        title="Elküldött üzenetek"
        description="Mikor, kinek és mit küldtél ki — előnézettel és e-mail kézbesítési státusszal."
        badges={
          broadcasts.length > 0 ? (
            <StatusBadge intent="neutral">{broadcasts.length}</StatusBadge>
          ) : undefined
        }
        open={openSections.archive}
        onToggle={() => toggleSection('archive')}
      >
        <BroadcastArchive broadcasts={broadcasts} />
      </BroadcastSectionCard>

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
