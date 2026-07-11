'use client'

/**
 * Kézbesítési státusz-jelvények (értesítés + e-mail) — a korábbi kézi
 * DeliveryBadge/EmailDeliveryBadge helyett a közös StatusBadge-re építve.
 * A changelog-kártyák ÉS az archívum is innen kapja, így egy a nyelv.
 */

import { Check, Clock, Mail, MailWarning, MessageSquare } from 'lucide-react'

import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { formatDateTime } from './format'

/** Csengő-értesítés státusza. */
export function NotificationStatusBadge({ sent }: { sent: boolean }) {
  return sent ? (
    <StatusBadge intent="success" icon={Check}>
      Értesítés elküldve
    </StatusBadge>
  ) : (
    <StatusBadge intent="neutral" icon={MessageSquare}>
      Még nincs kiküldve
    </StatusBadge>
  )
}

/**
 * E-mail kézbesítés státusza.
 * - requested=false → nem volt kérve e-mail
 * - error → hiba
 * - sentAt → sikeres kiküldés (időponttal)
 * - egyébként → függőben
 */
export function EmailStatusBadge({
  requested,
  sentAt,
  error,
  notSentLabel = 'E-mail nem volt kérve',
}: {
  requested: boolean
  sentAt: string | null
  error: string | null
  notSentLabel?: string
}) {
  if (!requested) {
    return (
      <StatusBadge intent="neutral" icon={Mail}>
        {notSentLabel}
      </StatusBadge>
    )
  }
  if (error) {
    return (
      <StatusBadge intent="danger" icon={MailWarning}>
        E-mail hiba
      </StatusBadge>
    )
  }
  if (sentAt) {
    return (
      <StatusBadge intent="success" icon={Mail}>
        E-mail elküldve · {formatDateTime(sentAt)}
      </StatusBadge>
    )
  }
  return (
    <StatusBadge intent="warning" icon={Clock}>
      E-mail függőben
    </StatusBadge>
  )
}
