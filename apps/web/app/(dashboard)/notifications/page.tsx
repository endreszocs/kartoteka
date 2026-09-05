import { Suspense } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Bell, Inbox, Send } from 'lucide-react'

import { PageHero } from '@kartoteka/ui-app'
import {
  listInboundTransferNotifications,
  listOutboundTransferNotifications,
} from '@/lib/notifications/transfer-notifications-actions'
import { listErtesitesekAction } from '@/lib/notifications/uzenetek-actions'
import { createClient } from '@/lib/supabase/server'
import { TransferRequestCard } from '@/components/notifications/transfer-request-card'
import { ErtesitesInbox } from '@/components/notifications/ertesites-inbox'
import { NotificationsTabs } from '@/components/notifications/notifications-tabs'

/**
 * /notifications — AZ ÉRTESÍTÉSEK OLDALA (2026-08-11 átalakítás; 2026-09-05
 * beszélgetés-nézet).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MI VÁLTOZOTT, ÉS MIÉRT
 * ════════════════════════════════════════════════════════════════════════════
 * Ez az oldal 2026-04-30 óta EGYETLEN dolgot mutatott: az átjelentkezési
 * kérelmeket. A harang-üzenetekből EGYETLEN SORT SEM — azokat kizárólag a
 * fejléc-csengő lenyíló panelje mutatta, ott is csak 24 óráig.
 *
 * 2026-09-05: az „Üzenetek" fül beszélgetés-nézet lett (KITŐL · MIKOR · MIT):
 * bal oldalt a feladók, jobb oldalt a szál buborékokban. Az állapot
 * (`?ful=…&felado=…&uzenet=…&archivum=1&kerelem=…`) az URL-ben él — a csengő
 * és a mélylinkek ide mutatnak, a Vissza gomb működik.
 *
 * ⚠️ AZ ELSŐ FÜL AZ ÜZENETEK. Az átjelentkezés gyülekezeti hatókört igényel;
 *    rendszergazdai / esperesi / egyházmegyei profilban a régi oldal emiatt
 *    CSAK egy hibadobozt mutatott. A hatókör hiánya CSAK a második fület érinti.
 *
 * ⚠️ `use client` NINCS ezen az oldalon és a `PageHero`-n sem. 2026-08-11-én
 *    éles 500-at okozott, hogy a `PageHero` kliens-komponens volt, és
 *    szerver-komponensből kapott függvényt (`Icon={Bell}`). Az interaktív rész
 *    saját `'use client'` gyerek-komponens; a `useSearchParams`-ot használó
 *    fülek `Suspense` alatt állnak.
 *
 * ⚠️ Az URL-paramétereket NEM itt olvassuk: a szál-váltás kliens-oldali
 *    (`history.pushState`), és egy szerver-oldali `searchParams`-olvasás
 *    minden váltásnál újra lefuttatná a három lekérdezést.
 */

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const [
    {
      data: { user },
    },
    uzenetek,
    inbound,
    outbound,
  ] = await Promise.all([
    supabase.auth.getUser(),
    listErtesitesekAction(),
    listInboundTransferNotifications({ status: 'all', limit: 50 }),
    listOutboundTransferNotifications({ status: 'all', limit: 50 }),
  ])

  const uzenetSorok = uzenetek.rows ?? []
  const olvasatlan = uzenetSorok.filter((s) => !s.olvasva && !s.archived).length

  const inboundList = inbound.data || []
  const outboundList = outbound.data || []
  const inboundPending = inboundList.filter((n) => n.status === 'pending')
  const atjelentkezesHiba = inbound.error || outbound.error || null

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Értesítések"
        title="Üzeneteid"
        description="Beszélgetésekbe rendezve: bal oldalt, hogy KITŐL jött az üzenet, jobb oldalt a szál időrendben. Mentés-jelzések, hozzáférés-kérések, hírlevelek — és az átjelentkezési kérelmek. Amit elolvastál, megmarad; amit archiválsz, visszahozható."
        Icon={Bell}
        stats={[
          { label: 'Olvasatlan üzenet', value: String(olvasatlan) },
          { label: 'Válaszra vár (átjelentkezés)', value: String(inboundPending.length) },
        ]}
      />

      <Suspense fallback={<div className="card-raised min-h-[20rem] animate-pulse" aria-busy aria-label="Betöltés…" />}>
        <NotificationsTabs
          uzenetekSzam={olvasatlan}
          kerelmekSzam={inboundPending.length}
          uzenetek={
            <ErtesitesInbox
              kezdoSorok={uzenetSorok}
              kezdoHiba={uzenetek.error ?? null}
              tobbVan={uzenetek.tobbVan}
              userId={user?.id ?? null}
            />
          }
          kerelmek={
            atjelentkezesHiba ? (
              // ⚠️ EZ CSAK A FÜLET ÉRINTI. Korábban ugyanez a hiba az EGÉSZ oldalt
              //    elvitte, és a rendszergazda soha nem jutott el az üzeneteihez.
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-relaxed text-foreground">
                <p className="font-semibold">Az átjelentkezési kérelmek most nem érhetők el.</p>
                <p className="mt-1">{atjelentkezesHiba}</p>
                <p className="mt-1 text-muted-foreground">
                  Ez a bekapcsolt profilodtól függ: az átjelentkezés gyülekezeti szintű ügy. Válts át
                  gyülekezeti profilra, ha látni szeretnéd. Az „Üzenetek" fül ettől függetlenül működik.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <section className="space-y-3">
                  <SectionHeading ikon="inbox" title="Bejövő — válasz vár" count={inboundPending.length} />
                  {inboundPending.length === 0 ? (
                    <EmptyNote>Nincs új átjelentkezési kérelem.</EmptyNote>
                  ) : (
                    <div className="space-y-3">
                      {inboundPending.map((n) => (
                        <TransferRequestCard key={n.id} notification={n} mode="inbound" />
                      ))}
                    </div>
                  )}
                </section>

                {inboundList.length > inboundPending.length && (
                  <section className="space-y-3 pt-2">
                    <h2 className="text-sm font-semibold text-muted-foreground">
                      Bejövő — már megválaszolt ({inboundList.length - inboundPending.length})
                    </h2>
                    <div className="space-y-3">
                      {inboundList
                        .filter((n) => n.status !== 'pending')
                        .map((n) => (
                          <TransferRequestCard key={n.id} notification={n} mode="inbound" />
                        ))}
                    </div>
                  </section>
                )}

                <section className="space-y-3 pt-2">
                  <SectionHeading ikon="send" title="Elküldött" count={outboundList.length} />
                  {outboundList.length === 0 ? (
                    <EmptyNote>Nincs még elküldött átjelentkezési kérelem.</EmptyNote>
                  ) : (
                    <div className="space-y-3">
                      {outboundList.map((n) => (
                        <TransferRequestCard key={n.id} notification={n} mode="outbound" />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )
          }
        />
      </Suspense>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Közös apró elemek — a header értesítés-paneljével azonos formanyelv:
// ikon-chip + darabszám-pill, token-alapú (dark-mode-helyes) üres állapot.
// ──────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ NEM `Icon: LucideIcon` PROP, HANEM NÉV (2026-08-11).
 *
 * Ez a fejléc a fülekhez tartozó `ReactNode` SLOT belsejében renderel, amit
 * egy KLIENS-komponens (`NotificationsTabs`) kap meg. Egy függvény-átadás
 * (`Icon={Bell}`) éles 500-at okozott; a név-alapú választás ezt a
 * hibaosztályt SZERKEZETILEG zárja ki.
 */
const FEJLEC_IKONOK = { inbox: Inbox, send: Send } as const

function SectionHeading({ ikon, title, count }: { ikon: keyof typeof FEJLEC_IKONOK; title: string; count: number }) {
  const Icon: LucideIcon = FEJLEC_IKONOK[ikon]
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/12 text-violet-700 ring-1 ring-violet-500/20 dark:text-violet-300 dark:ring-violet-400/25">
        <Icon className="size-4" />
      </span>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{count}</span>
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-secondary/40 p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
