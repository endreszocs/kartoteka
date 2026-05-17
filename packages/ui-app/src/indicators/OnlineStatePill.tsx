'use client'

/**
 * OnlineStatePill — egységes online/offline állapot-jelző (DIAGNOSTICS P2-7).
 *
 * A read-only desktop oldalakra (anyakönyv, leltár, sírhelyek, iktató,
 * jegyzőkönyvek, éves jelentés) — a feedback_lelkesz_informalas elve szerint
 * a felhasználónak látnia kell, hogy a megjelenített adat a lokális cache-ből
 * jön vagy a friss Supabase-állapotból.
 *
 * - `navigator.onLine` + `online`/`offline` event-ek figyelése
 * - Inline (default) vagy fixed-top-right pozíció
 * - Opcionális `lastSyncAt` időbélyeg ("Online · 14:32")
 * - a11y: role="status", aria-label
 *
 * Nem konfliktál a meglévő SyncStatusBadge-dzsel (az pending/conflict-számláló,
 * ez puszta online/offline pill).
 */

import { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'

export interface OnlineStatePillProps {
  /** Utolsó sikeres szinkronizáció időpontja — opcionális, ha megadva, megjelenik. */
  lastSyncAt?: Date | string | null
  /** Pozíció: 'inline' (default — a flow-ban) vagy 'fixed-top-right'. */
  position?: 'inline' | 'fixed-top-right'
  /** Extra Tailwind-osztályok. */
  className?: string
}

function formatTime(input: Date | string | null | undefined): string | null {
  if (!input) return null
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
}

export function OnlineStatePill({
  lastSyncAt,
  position = 'inline',
  className,
}: OnlineStatePillProps) {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const toneClasses = isOnline
    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
    : 'border-amber-300 bg-amber-50 text-amber-900'
  const dotClasses = isOnline ? 'bg-emerald-500' : 'bg-amber-500'
  const label = isOnline ? 'Online' : 'Offline'

  const timeText = formatTime(lastSyncAt)
  const fullText = timeText ? `${label} · ${timeText}` : label

  const positionClasses =
    position === 'fixed-top-right'
      ? 'fixed right-3 top-12 z-40 flex'
      : 'inline-flex'

  const ariaLabel = isOnline
    ? `Hálózat státusza: online${timeText ? ` (utolsó frissítés: ${timeText})` : ''}`
    : `Hálózat státusza: offline — a megjelenített adat a lokális cache-ből származik${
        timeText ? ` (utolsó frissítés: ${timeText})` : ''
      }`

  const finalClassName = [
    positionClasses,
    'items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur-sm',
    toneClasses,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={finalClassName} role="status" aria-label={ariaLabel}>
      <span className={`inline-block size-2 rounded-full ${dotClasses}`} aria-hidden="true" />
      {isOnline ? <Wifi className="size-3.5" aria-hidden="true" /> : <WifiOff className="size-3.5" aria-hidden="true" />}
      <span>{fullText}</span>
    </div>
  )
}
