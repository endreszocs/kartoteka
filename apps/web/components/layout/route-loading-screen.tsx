'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface RouteLoadingScreenProps {
  /** A betöltött modul neve — pl. "Tagnyilvántartás", "Pénzügy". */
  module?: string
  /** Felirat a logó alatt (alapértelmezett: "Református gyülekezeti nyilvántartás"). */
  subtitle?: string
  /** Üzenet — egy mondat a betöltési folyamat hangulatáról. */
  message?: string
}

/**
 * Egységes route-loading overlay — `fixed inset-0` blur-rel + középen
 * egy kis kártya az EREK logóval. A rendszer minden `loading.tsx`-e ezt
 * használja (root, dashboard, modulok), így minden módnál (full-screen,
 * sidebar-os, dialog-mögött) ugyanaz a "homályos háttér + lebegő kártya"
 * élmény jelenik meg. Mintája a [[dashboard-intro-overlay]].
 *
 * 2026-06-01: a kliens-hidratáció után a `document.body`-hoz portal-eljük,
 * mert a `.page-shell` `isolation: isolate`-tel új stacking-context-et hoz
 * létre — emiatt a `z-[1000]` overlay korábban CSAK a content-területet
 * blur-elte, a header-t (sticky, a page-shell-en kívül) nem. A portal a
 * stacking-context-et megkerüli, így a header is elhomályosodik.
 * SSR-en a fallback még a normál DOM-pozícióban renderelődik (nincs
 * blur-flash), client hidratáció után a portal átmozgatja a body-ra.
 */
export function RouteLoadingScreen({
  module = 'Kartotéka',
  // 2026-06-10: semleges felirat — a rendszer nem csak az erdélyi kerületé
  subtitle = 'Református gyülekezeti nyilvántartás',
  message = 'A modul betöltése folyamatban van, az adatok hamarosan megérkeznek.',
}: RouteLoadingScreenProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) setMounted(true) })
    return () => { cancelled = true }
  }, [])

  const content = (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${module} betöltése`}
      className="pointer-events-none fixed inset-0 z-[1000] flex items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(243,192,97,0.32),transparent_18rem),radial-gradient(circle_at_top_right,rgba(49,162,150,0.26),transparent_18rem),rgba(245,250,247,0.97)] px-4 backdrop-blur-md"
    >
      <div className="flex max-w-md flex-col items-center rounded-[2rem] border border-white/75 bg-white/90 px-6 py-7 text-center shadow-[0_34px_80px_-42px_rgba(16,70,63,0.42)] sm:px-8">
        {/* Logó + pulzáló glow */}
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-[-12px] animate-pulse rounded-[1.8rem] bg-gradient-to-br from-amber-200/35 via-white/10 to-teal-200/35 blur-md"
          />
          <div className="relative flex size-20 items-center justify-center rounded-[1.6rem] bg-white shadow-[0_24px_40px_-24px_rgba(16,70,63,0.42)]">
            <Image
              src="/kartoteka-logo.png"
              alt="Kartotéka"
              width={64}
              height={64}
              priority
              className="object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.18)]"
            />
          </div>
        </div>

        {/* Cím-blokk */}
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/72 sm:tracking-[0.32em]">
          {subtitle}
        </p>
        <h2 className="mt-2 font-heading text-3xl text-slate-800 md:text-4xl">
          {module}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
          {message}
        </p>

        {/* 3 bouncing dot */}
        <div className="mt-5 flex items-center gap-2">
          <span className="size-2 animate-bounce rounded-full bg-teal-500/75 [animation-delay:-0.2s]" />
          <span className="size-2 animate-bounce rounded-full bg-amber-400/80 [animation-delay:-0.1s]" />
          <span className="size-2 animate-bounce rounded-full bg-cyan-500/75" />
        </div>
      </div>
    </div>
  )

  // SSR + initial render: a content a normál DOM-pozícióban (a page-shell-en
  // belül) marad — még nincs portal. Client-hidratáció után portal a body-ra,
  // ami kilép a .page-shell stacking-context-éből → a header is blur-elve.
  if (!mounted) return content
  return createPortal(content, document.body)
}
