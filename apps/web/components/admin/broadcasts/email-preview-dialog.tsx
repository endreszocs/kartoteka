'use client'

/**
 * E-mail előnézet dialógus (2026-07-11, admin-redesign 2. kör).
 *
 * A már elküldött üzenetek (broadcastId) és a még el nem küldött
 * CHANGELOG-vázlatok (changelogKey) leveleit mutatja meg pontosan úgy,
 * ahogy a címzettek postafiókjában megjelennek — a szerver ugyanazzal a
 * sablonnal generálja a HTML-t, amivel a tényleges küldés megy.
 *
 * A render sandbox-olt iframe-ben történik (sandbox="" — semmilyen script
 * nem futhat), a levél saját, világos hátterű dokumentum, ezért az iframe
 * háttere szándékosan fehér (nem téma-token).
 */

import { useEffect, useState } from 'react'
import { CalendarClock, Mail, RefreshCw, Tag, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AdminSkeleton } from '@/components/admin/_shared/admin-skeleton'
import { StatusBadge } from '@/components/admin/_shared/status-badge'

import {
  getBroadcastEmailPreview,
  getChangelogEmailPreview,
} from '@/app/(dashboard)/admin/broadcasts-actions'

import type { BroadcastEmailPreview } from './email-preview-types'
import { formatDateTime } from './format'

export function EmailPreviewDialog({
  open,
  onOpenChange,
  broadcastId,
  changelogKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Elküldött üzenet (system_broadcasts sor) előnézete. */
  broadcastId?: string | null
  /** CHANGELOG-bejegyzés előnézete (vázlat vagy már kiküldött). */
  changelogKey?: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<BroadcastEmailPreview | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!open || (!broadcastId && !changelogKey)) return
    let cancelled = false
    // rAF-deferral — a synchronous setState-in-effect lint elkerülésére
    // (ugyanaz a minta, mint a broadcasts-tab / admin-confirm-dialog esetén).
    const raf = requestAnimationFrame(() => {
      setLoading(true)
      setError(null)
      setPreview(null)
      const request = broadcastId
        ? getBroadcastEmailPreview(broadcastId)
        : getChangelogEmailPreview(changelogKey as string)
      request
        .then((res) => {
          if (cancelled) return
          if (res.data) setPreview(res.data)
          else setError(res.error || 'Az előnézet betöltése nem sikerült.')
        })
        .catch((err) => {
          if (cancelled) return
          setError(err instanceof Error ? err.message : 'Az előnézet betöltése nem sikerült.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [open, broadcastId, changelogKey, attempt])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-full flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8 text-lg text-foreground">
            <Mail className="size-4 shrink-0 text-primary" aria-hidden />
            E-mail előnézet
          </DialogTitle>
          <DialogDescription>
            A levél ugyanazzal a sablonnal készül, amivel a tényleges kiküldés megy.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {loading && <AdminSkeleton rows={4} className="py-2" />}

          {!loading && error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-center dark:border-rose-900 dark:bg-rose-950/30"
            >
              <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">
                Az előnézet betöltése nem sikerült
              </p>
              <p className="mt-1 text-xs text-rose-700 dark:text-rose-400">{error}</p>
              <Button
                variant="outline"
                className="mt-3 gap-2"
                onClick={() => setAttempt((a) => a + 1)}
              >
                <RefreshCw className="size-4" aria-hidden />
                Újrapróbálom
              </Button>
            </div>
          )}

          {!loading && !error && preview && (
            <>
              {/* Tárgy + küldési metaadatok */}
              <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {preview.draft ? (
                    <StatusBadge intent="info">Így fog kinézni — még nincs elküldve</StatusBadge>
                  ) : (
                    <StatusBadge intent="success">Elküldött üzenet</StatusBadge>
                  )}
                  <StatusBadge intent="neutral">{preview.meta.tipusLabel}</StatusBadge>
                </div>
                <p className="text-sm leading-snug">
                  <span className="font-medium text-muted-foreground">Tárgy:</span>{' '}
                  <span className="font-semibold text-foreground">{preview.subject}</span>
                </p>
                {(preview.meta.sentAt ||
                  preview.meta.recipientCount != null ||
                  preview.meta.scopeLabel) && (
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {preview.meta.sentAt && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3.5" aria-hidden />
                        {formatDateTime(preview.meta.sentAt)}
                      </span>
                    )}
                    {preview.meta.recipientCount != null && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5" aria-hidden />
                        {preview.meta.recipientCount} címzett
                      </span>
                    )}
                    {preview.meta.scopeLabel && (
                      <span className="inline-flex items-center gap-1">
                        <Tag className="size-3.5" aria-hidden />
                        {preview.meta.scopeLabel}
                      </span>
                    )}
                  </p>
                )}
                {!preview.draft && !preview.meta.emailRequested && (
                  <p className="text-xs text-muted-foreground">
                    Ez az üzenet csak alkalmazáson belüli értesítésként ment ki — a levél így
                    nézett volna ki e-mailben.
                  </p>
                )}
                {preview.meta.emailError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">
                    E-mail hiba a kiküldéskor: {preview.meta.emailError}
                  </p>
                )}
              </div>

              {/* Sandbox-olt e-mail render — script nem futhat benne */}
              <iframe
                srcDoc={preview.html}
                sandbox=""
                className="h-[60dvh] w-full rounded-xl border border-border bg-white"
                title="E-mail előnézet"
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Bezárás
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
