import type { LucideIcon } from 'lucide-react'
import { Bell, Inbox, Send } from 'lucide-react'

import { PageHero } from '@kartoteka/ui-app'
import {
  listInboundTransferNotifications,
  listOutboundTransferNotifications,
} from '@/lib/notifications/transfer-notifications-actions'
import { TransferRequestCard } from '@/components/notifications/transfer-request-card'

/**
 * /notifications oldal — átjelentkezési kérelmek inboxa.
 *
 * 2026-04-30 — Endre kérése: a célgyülekezet lelkésze itt látja a feléje
 * érkezett átjelentkezési kérelmeket, és el/elutasíthatja.
 *
 * 2 szekció:
 *   - Bejövő (inbound): a saját gyülekezet a célgyülekezet
 *   - Elküldött (outbound): a saját gyülekezet a forrás
 *
 * 2026-08-10 — a header értesítés-paneljével közös formanyelv: ikon-chip a
 * szekciófejlécekben, darabszám-pill, token-alapú (dark-mode-helyes) üres
 * állapotok. A kérelem-kártyák logikája és megjelenése változatlan.
 */

export default async function NotificationsPage() {
  const [inbound, outbound] = await Promise.all([
    listInboundTransferNotifications({ status: 'all', limit: 50 }),
    listOutboundTransferNotifications({ status: 'all', limit: 50 }),
  ])

  if (inbound.error || outbound.error) {
    return (
      <div className="space-y-4">
        <PageHero
          eyebrow="Értesítések"
          title="Átjelentkezési kérelmek"
          description="Hibás betöltés."
          Icon={Bell}
        />
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
          {inbound.error || outbound.error}
        </div>
      </div>
    )
  }

  const inboundList = inbound.data || []
  const outboundList = outbound.data || []
  const inboundPending = inboundList.filter(n => n.status === 'pending')

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Értesítések"
        title="Átjelentkezési kérelmek"
        description="Itt látod a feléd érkező átjelentkezési kérelmeket (másik gyülekezetből hozzád átjelentkezni szándékozó tagok), és a saját gyülekezeted által küldött kérelmeket."
        Icon={Bell}
        stats={[
          { label: 'Bejövő (válasz vár)', value: String(inboundPending.length) },
          { label: 'Elküldött', value: String(outboundList.length) },
        ]}
      />

      {/* Bejövő — válasz vár */}
      <section className="space-y-3">
        <SectionHeading Icon={Inbox} title="Bejövő — válasz vár" count={inboundPending.length} />
        {inboundPending.length === 0 ? (
          <EmptyNote>Nincs új átjelentkezési kérelem.</EmptyNote>
        ) : (
          <div className="space-y-3">
            {inboundPending.map(n => (
              <TransferRequestCard key={n.id} notification={n} mode="inbound" />
            ))}
          </div>
        )}
      </section>

      {/* Bejövő — már megválaszoltak */}
      {inboundList.length > inboundPending.length && (
        <section className="space-y-3 pt-4">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Bejövő — már megválaszolt ({inboundList.length - inboundPending.length})
          </h2>
          <div className="space-y-3">
            {inboundList
              .filter(n => n.status !== 'pending')
              .map(n => (
                <TransferRequestCard key={n.id} notification={n} mode="inbound" />
              ))}
          </div>
        </section>
      )}

      {/* Elküldött */}
      <section className="space-y-3 pt-4">
        <SectionHeading Icon={Send} title="Elküldött" count={outboundList.length} />
        {outboundList.length === 0 ? (
          <EmptyNote>Nincs még elküldött átjelentkezési kérelem.</EmptyNote>
        ) : (
          <div className="space-y-3">
            {outboundList.map(n => (
              <TransferRequestCard key={n.id} notification={n} mode="outbound" />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Közös apró elemek (2026-08-10) — a header értesítés-paneljével azonos
// formanyelv: ikon-chip + darabszám-pill, illetve token-alapú üres állapot.
// ──────────────────────────────────────────────────────────────────────────

function SectionHeading({
  Icon,
  title,
  count,
}: {
  Icon: LucideIcon
  title: string
  count: number
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/12 text-violet-700 ring-1 ring-violet-500/20 dark:text-violet-300 dark:ring-violet-400/25">
        <Icon className="size-4" />
      </span>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        {count}
      </span>
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
