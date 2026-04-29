'use client'

/**
 * Átjelentkezési kérelem kártya — a /notifications oldalon jelenik meg.
 *
 * 2 állapot:
 *   - Inbound (a célgyülekezet inboxa): "Elfogadom" / "Elutasítom" gomb
 *   - Outbound (a forrás-gyülekezet): csak megjelenítés, státusz badge
 *
 * 2026-04-30 — Endre kérése
 */

import { useState, useTransition } from 'react'
import { ArrowRight, Building2, Calendar, Check, Loader2, MapPin, User, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  respondToTransferNotification,
  markTransferNotificationRead,
  type TransferNotification,
} from '@/lib/notifications/transfer-notifications-actions'

interface TransferRequestCardProps {
  notification: TransferNotification
  /** 'inbound' = a célgyülekezet lelkésze nézi (Elfogadom/Elutasítom);
   *  'outbound' = a forrás-gyülekezet lelkésze (csak megtekintés). */
  mode: 'inbound' | 'outbound'
  onResponded?: () => void
}

export function TransferRequestCard({ notification, mode, onResponded }: TransferRequestCardProps) {
  const [isResponding, startResponding] = useTransition()
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectNote, setRejectNote] = useState('')

  const member = notification.member_snapshot
  const memberName = `${member?.csaladnev || ''} ${member?.k_nev || ''}`.trim() || 'Ismeretlen tag'
  const sourceName = notification.source_congregation?.nev_hu
    || notification.source_congregation?.name
    || 'Ismeretlen forrás-gyülekezet'
  const targetName = notification.target_congregation?.nev_hu
    || notification.target_congregation?.name
    || 'Ismeretlen célgyülekezet'

  const handleAccept = () => {
    startResponding(async () => {
      const res = await respondToTransferNotification({
        id: notification.id,
        status: 'accepted',
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${memberName} átjelentkezése elfogadva.`)
      onResponded?.()
    })
  }

  const handleReject = () => {
    if (!showRejectInput) {
      setShowRejectInput(true)
      return
    }
    startResponding(async () => {
      const res = await respondToTransferNotification({
        id: notification.id,
        status: 'rejected',
        note: rejectNote.trim() || undefined,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${memberName} átjelentkezése elutasítva.`)
      onResponded?.()
    })
  }

  const handleMarkRead = () => {
    if (notification.read_at) return
    void markTransferNotificationRead(notification.id)
  }

  // Státusz-jelölő
  const statusBadge =
    notification.status === 'accepted' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <Check className="size-3.5" /> Elfogadva
      </span>
    ) : notification.status === 'rejected' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
        <X className="size-3.5" /> Elutasítva
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
        Várja a választ
      </span>
    )

  return (
    <div
      onMouseEnter={mode === 'inbound' ? handleMarkRead : undefined}
      className="overflow-hidden rounded-[1.5rem] bg-white/95 ring-1 ring-violet-100 shadow-[0_18px_40px_-30px_rgba(124,58,237,0.25)]"
    >
      {/* Fejléc — forrás → cél */}
      <div className="border-b border-violet-100 bg-gradient-to-br from-violet-50/60 to-rose-50/60 px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Building2 className="size-4 text-violet-600" />
            <span className="font-semibold text-slate-800">{sourceName}</span>
            <ArrowRight className="size-4 text-violet-400" />
            <Building2 className="size-4 text-rose-600" />
            <span className="font-semibold text-slate-800">{targetName}</span>
          </div>
          {statusBadge}
        </div>
      </div>

      {/* Tag-adatok */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <User className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-slate-800">
              {memberName}
              {member?.szcs_nev && member.szcs_nev !== member.csaladnev && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  (sz. {member.szcs_nev})
                </span>
              )}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              {member?.sz_datum && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3.5" />
                  Sz: {member.sz_datum.split('T')[0]}
                </span>
              )}
              {member?.ferfi !== null && member?.ferfi !== undefined && (
                <span>{member.ferfi ? '♂ Férfi' : '♀ Nő'}</span>
              )}
              {member?.cnp && (
                <span className="font-mono">CNP: {member.cnp}</span>
              )}
            </div>
            {member?.cim && (
              <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="size-3.5" />
                {member.cim}
              </p>
            )}
            {member?.megjegyzes && (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {member.megjegyzes}
              </p>
            )}
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Beérkezett: {new Date(notification.created_at).toLocaleString('hu-HU')}
        </p>
        {notification.responded_at && (
          <p className="mt-1 text-xs text-slate-500">
            Válaszolt: {new Date(notification.responded_at).toLocaleString('hu-HU')}
            {notification.response_note && (
              <>
                {' '}— megjegyzés: <em>{notification.response_note}</em>
              </>
            )}
          </p>
        )}
      </div>

      {/* Cselekvés-gombok (inbound esetén) */}
      {mode === 'inbound' && notification.status === 'pending' && (
        <div className="border-t border-violet-100 bg-slate-50/40 px-5 py-3">
          {showRejectInput ? (
            <div className="space-y-2">
              <input
                type="text"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Elutasítás oka (opcionális, de hasznos a forrás-lelkésznek)…"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
                maxLength={500}
                autoFocus
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={handleReject}
                  disabled={isResponding}
                  className="rounded-full bg-red-600 hover:bg-red-700"
                >
                  {isResponding ? (
                    <><Loader2 className="mr-1.5 size-4 animate-spin" />Elutasítás…</>
                  ) : (
                    <><X className="mr-1.5 size-4" />Elutasítás megerősítése</>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowRejectInput(false)
                    setRejectNote('')
                  }}
                  disabled={isResponding}
                  className="rounded-full"
                >
                  Mégsem
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={handleAccept}
                disabled={isResponding}
                className="rounded-full bg-emerald-600 hover:bg-emerald-700"
              >
                {isResponding ? (
                  <><Loader2 className="mr-1.5 size-4 animate-spin" />Elfogadás…</>
                ) : (
                  <><Check className="mr-1.5 size-4" />Elfogadom</>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleReject}
                disabled={isResponding}
                className="rounded-full border-red-200 text-red-700 hover:bg-red-50"
              >
                <X className="mr-1.5 size-4" />
                Elutasítom
              </Button>
              <p className="ml-auto text-xs text-slate-500">
                Elfogadáskor a tag az új gyülekezet tagja lesz.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
