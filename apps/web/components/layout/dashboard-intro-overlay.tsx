'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

const INTRO_STORAGE_KEY = 'kartoteka-intro-seen'

export function DashboardIntroOverlay() {
  // Mindig false-szal inicializálunk (SSR-kompatibilis), useEffect-ben állítjuk
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  // Kliensoldalon ellenőrizzük a sessionStorage-t
  // queueMicrotask-kal kerüljük a React 19 set-state-in-effect szabálysértést
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (window.sessionStorage.getItem(INTRO_STORAGE_KEY) === '1') return
      setVisible(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!visible) return

    const closeTimer = window.setTimeout(() => {
      setClosing(true)
    }, 1050)

    const hideTimer = window.setTimeout(() => {
      window.sessionStorage.setItem(INTRO_STORAGE_KEY, '1')
      setVisible(false)
    }, 1500)

    return () => {
      window.clearTimeout(closeTimer)
      window.clearTimeout(hideTimer)
    }
  }, [visible])

  if (!visible) {
    return null
  }

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-0 z-[120] flex items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(243,192,97,0.22),transparent_18rem),radial-gradient(circle_at_top_right,rgba(49,162,150,0.18),transparent_18rem),rgba(245,250,247,0.92)] backdrop-blur-md transition-all duration-500',
        closing && 'opacity-0'
      )}
    >
      <div
        className={cn(
          'flex flex-col items-center rounded-[2rem] border border-white/75 bg-white/88 px-8 py-7 text-center shadow-[0_34px_80px_-42px_rgba(16,70,63,0.42)] transition-all duration-500',
          closing ? 'scale-[1.03] blur-[2px]' : 'scale-100'
        )}
      >
        <div className="relative">
          <div className="absolute inset-[-12px] rounded-[1.8rem] bg-gradient-to-br from-amber-200/35 via-white/10 to-teal-200/35 blur-md" />
          <div className="relative flex size-20 items-center justify-center rounded-[1.6rem] bg-white shadow-[0_24px_40px_-24px_rgba(16,70,63,0.42)]">
            <Image src="/kartoteka-logo.png" alt="Kartotéka" width={54} height={54} className="object-contain" />
          </div>
        </div>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.32em] text-primary/72">
          Református gyülekezeti nyilvántartás
        </p>
        <h2 className="mt-2 font-heading text-4xl text-slate-800">
          Kartotéka
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
          A szolgálati tér megnyílik. Egy pillanat türelmet kérünk, amíg előkészítjük a mai munkához a felületet.
        </p>

        <div className="mt-5 flex items-center gap-2">
          <span className="size-2 rounded-full bg-teal-500/75 animate-bounce [animation-delay:-0.2s]" />
          <span className="size-2 rounded-full bg-amber-400/80 animate-bounce [animation-delay:-0.1s]" />
          <span className="size-2 rounded-full bg-cyan-500/75 animate-bounce" />
        </div>
      </div>
    </div>
  )
}
