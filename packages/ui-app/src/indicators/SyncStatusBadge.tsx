'use client'

import { AlertTriangle, Cloud } from 'lucide-react'

export interface SyncStatusBadgeProps {
  pending: number
  conflict: number
  onClick: () => void
  label?: string
  title?: string
  /** 'fixed' (default): lebegő pozíció · 'inline': a header-be ágyazáshoz. */
  position?: 'fixed' | 'inline'
}

export function SyncStatusBadge({ pending, conflict, onClick, label, title, position = 'fixed' }: SyncStatusBadgeProps) {
  if (pending === 0 && conflict === 0) return null

  const hasConflict = conflict > 0
  const toneClasses = hasConflict
    ? 'border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100'
    : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
  const dotClasses = hasConflict ? 'bg-rose-500' : 'bg-amber-500'

  const computedLabel =
    label ??
    (hasConflict
      ? `${conflict} konfliktus feloldást vár`
      : pending === 1
        ? '1 tétel szinkronra vár'
        : `${pending} tétel szinkronra vár`)

  const computedTitle =
    title ??
    (hasConflict
      ? 'Kattints a megfelelő oldalra, ahol a konfliktusok feloldhatók.'
      : 'Offline-rögzített tételek várnak szinkronizációra. Kattints a megfelelő oldalra.')

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${position === 'fixed' ? 'fixed right-3 top-12 z-40' : ''} flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur-sm transition-colors ${toneClasses}`}
      title={computedTitle}
      aria-label={computedLabel}
    >
      <span className={`inline-block size-2 rounded-full ${dotClasses}`} />
      {hasConflict ? <AlertTriangle className="size-3.5" /> : <Cloud className="size-3.5" />}
      <span className="max-w-[220px] truncate">{computedLabel}</span>
    </button>
  )
}
