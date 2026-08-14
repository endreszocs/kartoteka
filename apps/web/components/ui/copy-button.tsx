'use client'

/**
 * CopyButton — közös „másolás vágólapra" gomb (2026-08-14, 4. pont).
 *
 * A felmérés 5 helyen talált kézzel ismételt vágólap-logikát, egyenetlen
 * hibakezeléssel (csak 1 guardolt a hiányzó navigator.clipboard-ra). Ez a
 * közös változat: guard + vizuális visszajelzés (pipa 1,5 mp-ig) + toast a
 * hibáról. Új másolás-igénynél EZT használd, ne írj inline logikát.
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

export function CopyButton({
  value,
  label,
  className = '',
}: {
  /** A vágólapra kerülő szöveg. */
  value: string
  /** Mi kerül a toastba / az aria-labelbe (pl. „IBAN", „E-mail cím"). */
  label: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function handleCopy() {
    // Guard: http-n vagy régi böngészőben nincs clipboard API — mondjuk ki,
    // ne dobjunk némán kivételt.
    if (!navigator.clipboard?.writeText) {
      toast.error('A vágólap nem érhető el ebben a böngészőben.')
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(`A(z) ${label} másolása nem sikerült.`)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={`${label} másolása`}
      title={`${label} másolása`}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200 ${className}`}
    >
      {copied ? <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="size-3.5" />}
    </button>
  )
}
