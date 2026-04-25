'use client'

export type SessionStatusTone = 'emerald' | 'amber' | 'orange' | 'slate'

export interface SessionStatusBadgeProps {
  tone: SessionStatusTone
  label: string
  isOnline?: boolean
}

const TONE_CLASSES: Record<SessionStatusTone, string> = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-300 bg-amber-50 text-amber-900',
  orange: 'border-orange-300 bg-orange-50 text-orange-900',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
}

const DOT_CLASSES: Record<SessionStatusTone, string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  slate: 'bg-slate-400',
}

export function SessionStatusBadge({ tone, label, isOnline }: SessionStatusBadgeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-3 top-3 z-40 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur-sm ${TONE_CLASSES[tone]}`}
      title={label}
    >
      <span
        className={`inline-block size-2 rounded-full ${DOT_CLASSES[tone]} ${isOnline ? 'animate-pulse' : ''}`}
      />
      <span className="max-w-[280px] truncate">{label}</span>
    </div>
  )
}
