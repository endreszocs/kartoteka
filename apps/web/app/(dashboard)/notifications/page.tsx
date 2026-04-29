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
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
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
        <div className="flex items-center gap-2">
          <Inbox className="size-5 text-violet-600" />
          <h2 className="text-base font-semibold text-slate-800">
            Bejövő — válasz vár ({inboundPending.length})
          </h2>
        </div>
        {inboundPending.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
            Nincs új átjelentkezési kérelem.
          </div>
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
          <h2 className="text-sm font-semibold text-slate-600">
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
        <div className="flex items-center gap-2">
          <Send className="size-5 text-violet-600" />
          <h2 className="text-base font-semibold text-slate-800">
            Elküldött ({outboundList.length})
          </h2>
        </div>
        {outboundList.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
            Nincs még elküldött átjelentkezési kérelem.
          </div>
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
