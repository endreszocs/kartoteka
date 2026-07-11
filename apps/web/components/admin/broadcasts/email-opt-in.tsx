'use client'

/**
 * „E-mail értesítés is menjen" kapcsoló — korábban két helyen (changelog-szekció
 * és kézi üzenet-űrlap) szó szerint duplikálva volt; most egy komponens.
 */

import { Mail } from 'lucide-react'

export function EmailOptIn({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex min-h-11 cursor-pointer select-none items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 transition hover:bg-muted/40">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-input accent-[var(--primary)]"
      />
      <span className="text-sm text-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Mail className="size-3.5" aria-hidden />
          E-mail értesítés is menjen
        </span>
        <span className="block text-xs leading-relaxed text-muted-foreground">
          A címzettek a csengő-értesítés mellett e-mailben is megkapják az üzenetet.
        </span>
      </span>
    </label>
  )
}
